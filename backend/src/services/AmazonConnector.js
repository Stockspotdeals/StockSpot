/**
 * AmazonConnector
 *
 * Product connector layer for the Amazon Creators API.
 *
 * IMPORTANT:
 *  - This is NOT the PA-API (Product Advertising API).
 *  - This does NOT use AWS SigV4 / AccessKey authentication.
 *  - This uses Amazon Creators API OAuth authentication via CreatorsApiClient.
 *  - It does NOT write to MongoDB. It returns StockSpot-compatible normalized objects
 *    that can later be handed to productUpsert().
 *
 * Official Creators API (per Amazon docs at affiliate-program.amazon.com/creatorsapi):
 *  - Base URL: https://creatorsapi.amazon
 *  - GetItems:    POST /catalog/v1/getItems
 *  - SearchItems: POST /catalog/v1/searchItems
 *  - Both operations use a JSON request body (NOT query-string parameters).
 *
 * GetItems body:
 *   { itemIds: [...], itemIdType: "ASIN", partnerTag, resources: [...] }
 *
 * SearchItems body:
 *   { keywords: "...", partnerTag, resources: [...] }
 *
 * Response structure:
 *   Items are nested under response.itemResults.items[].item.
 *   Each item exposes:
 *     - ASIN
 *     - detailPageURL (canonical product URL, already includes affiliate tag)
 *     - itemInfo.title
 *     - images.primary.large
 *     - offersV2.listings[].price / .availability
 *     - browseNodeInfo.browseNodes
 *
 * Affiliate links: detailPageURL already contains the affiliate tag, so it is used
 * directly as both url and affiliateLink. We do NOT regenerate Amazon URLs when
 * detailPageURL exists.
 *
 * Error handling:
 *   - Missing/empty API response                        -> throws AMAZON_CONNECTOR_EMPTY_RESPONSE
 *   - Items without an ASIN                             -> skipped (logged)
 *   - Items missing price or image                      -> kept, flagged in item.issues
 *   - Items explicitly unavailable                      -> kept with isAvailable:false (flagged)
 */

const { CreatorsApiClient } = require('./CreatorsApiClient');
const { AmazonAffiliateEngine } = require('./AmazonAffiliateEngine');

const DEFAULT_SEARCH_PATH = 'catalog/v1/searchItems';
const DEFAULT_ITEMS_PATH = 'catalog/v1/getItems';
const DEFAULT_CONFIDENCE = 0.9; // Deterministic value for API-sourced data

// Resources requested from the Creators API for both operations.
const DEFAULT_RESOURCES = [
  'images.primary.large',
  'itemInfo.title',
  'offersV2.listings.price',
  'offersV2.listings.availability',
  'browseNodeInfo.browseNodes'
];

class AmazonConnector {
  /**
   * @param {object} [options]
   *   - client: CreatorsApiClient instance (defaults to new CreatorsApiClient)
   *   - affiliateEngine: AmazonAffiliateEngine instance (defaults to new AmazonAffiliateEngine)
   *   - searchPath: override search endpoint path
   *   - itemsPath:  override items endpoint path
   */
  constructor(options = {}) {
    this.client = options.client || new CreatorsApiClient(options);
    this.affiliateEngine = options.affiliateEngine || new AmazonAffiliateEngine();
    this.searchPath = options.searchPath || process.env.AMAZON_API_SEARCH_PATH || DEFAULT_SEARCH_PATH;
    this.itemsPath = options.itemsPath || process.env.AMAZON_API_ITEMS_PATH || DEFAULT_ITEMS_PATH;
  }

  /** True when all required Creators API env vars are present. */
  get isConfigured() {
    return this.client.isConfigured;
  }

  /** Missing required env var names (never values). */
  get missingEnvVars() {
    return this.client.missingEnvVars;
  }

  /**
   * Search Amazon products by keyword.
   *
   * @param {string} keyword - search term
   * @param {object} [options]
   *   - limit: max results (itemCount)
   *   - headers: extra request headers
   * @returns {Promise<Array<object>>} normalized StockSpot-compatible products
   */
  async searchProducts(keyword, options = {}) {
    if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
      const err = new Error('AmazonConnector.searchProducts requires a non-empty keyword');
      err.name = 'AmazonConnectorError';
      err.code = 'AMAZON_CONNECTOR_BAD_KEYWORD';
      throw err;
    }

    const body = {
      keywords: keyword.trim(),
      partnerTag: this._getPartnerTag(),
      resources: DEFAULT_RESOURCES
    };

    const limit = Number(options.limit);
    if (Number.isInteger(limit) && limit > 0) {
      body.itemCount = limit;
    }

    const response = await this.client.request(this.searchPath, {
      method: 'POST',
      headers: options.headers,
      body
    });

    const items = this._extractItems(response);
    this._assertNonEmptyResponse(items, 'searchProducts');

    return this._normalizeItems(items);
  }

  /**
   * Lookup products by ASIN(s).
   *
   * @param {string|string[]} asins - one or more ASINs
   * @param {object} [options]
   *   - headers: extra request headers
   * @returns {Promise<Array<object>>} normalized StockSpot-compatible products
   */
  async getProductsByASIN(asins, options = {}) {
    const ids = (Array.isArray(asins) ? asins : [asins])
      .filter(Boolean)
      .map(String)
      .filter(s => s.trim().length > 0);

    if (ids.length === 0) {
      const err = new Error('AmazonConnector.getProductsByASIN requires at least one ASIN');
      err.name = 'AmazonConnectorError';
      err.code = 'AMAZON_CONNECTOR_BAD_ASIN';
      throw err;
    }

    const body = {
      itemIds: [...new Set(ids)],
      itemIdType: 'ASIN',
      partnerTag: this._getPartnerTag(),
      resources: DEFAULT_RESOURCES
    };

    const response = await this.client.request(this.itemsPath, {
      method: 'POST',
      headers: options.headers,
      body
    });

    const items = this._extractItems(response);
    this._assertNonEmptyResponse(items, 'getProductsByASIN');

    return this._normalizeItems(items);
  }

  /**
   * Returns the partner tag used in request bodies.
   * Falls back to the affiliate engine's associate id when AMAZON_ASSOCIATE_TAG is unset.
   */
  _getPartnerTag() {
    return process.env.AMAZON_ASSOCIATE_TAG || process.env.AMAZON_ASSOCIATE_ID || this.affiliateEngine.associateId || '';
  }

  // ----------------------------------------------------------------
  // Response normalization
  // ----------------------------------------------------------------

  /**
   * Throws when the API response contained no usable items.
   */
  _assertNonEmptyResponse(items, methodName) {
    if (!items || items.length === 0) {
      const err = new Error(`AmazonConnector.${methodName} received an empty API response`);
      err.name = 'AmazonConnectorError';
      err.code = 'AMAZON_CONNECTOR_EMPTY_RESPONSE';
      throw err;
    }
  }

  /**
   * Defensively locate the item array in a Creators API response.
   * Official structure: response.itemResults.items[].item
   * Also tolerates legacy/alternate shapes for robustness.
   * Returns [] when no array is found.
   */
  _extractItems(response) {
    if (!response || typeof response !== 'object') return [];

    const candidates = [
      // Official Creators API shape: itemResults.items[].item
      response.itemResults && response.itemResults.items && response.itemResults.items.map(i => i && i.item),
      // Alternate: itemResults.items directly
      response.itemResults && response.itemResults.items,
      // Legacy/alternate shapes
      response.items,
      response.products,
      response.results,
      response.data && response.data.items,
      response.data && response.data.products,
      response.data
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate;
      }
      // Some APIs return an object keyed by ASIN
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const values = Object.values(candidate);
        if (values.length > 0 && values.every(v => v && typeof v === 'object')) {
          return values;
        }
      }
    }

    return [];
  }

  /**
   * Normalize an array of raw Creators API items into StockSpot-compatible objects.
   * Items without an ASIN are skipped; missing price/image/availability are handled
   * gracefully (flagged in item.issues).
   */
  _normalizeItems(items) {
    const normalized = [];

    for (const raw of items) {
      if (!raw || typeof raw !== 'object') continue;

      const asin = this._extractAsin(raw);
      if (!asin) {
        console.warn('[AmazonConnector] Skipping item without ASIN.');
        continue;
      }

      const title = this._extractTitle(raw);
      const detailPageURL = this._extractDetailPageURL(raw);
      const url = detailPageURL || this._buildProductUrl(raw, asin);

      const normalizedItem = {
        asin,
        title,
        name: title, // StockSpot Product.name is required; title acts as name
        retailer: 'amazon',
        category: this._extractCategory(raw),
        price: this._extractPrice(raw),
        image: this._extractImage(raw),
        url,
        // Use detailPageURL directly when present (it already includes the affiliate tag).
        // Only fall back to the affiliate engine when no detailPageURL is available.
        affiliateLink: detailPageURL || this.affiliateEngine.generateAffiliateUrl(url),
        isAvailable: this._extractAvailability(raw),
        confidence: DEFAULT_CONFIDENCE,
        pageText: ''
      };

      // Graceful per-item issue tracking.
      const issues = [];
      if (!normalizedItem.title) issues.push('missing_title');
      if (normalizedItem.price === null || normalizedItem.price === undefined) issues.push('missing_price');
      if (!normalizedItem.image) issues.push('missing_image');
      if (!normalizedItem.isAvailable) issues.push('unavailable');

      if (issues.length > 0) {
        normalizedItem.issues = issues;
        console.warn(`[AmazonConnector] Item ${asin} issues: ${issues.join(', ')}`);
      }

      normalized.push(normalizedItem);
    }

    return normalized;
  }

  // ----------------------------------------------------------------
  // Field extractors (defensive — tolerant of multiple response shapes)
  // ----------------------------------------------------------------

  _extractAsin(item) {
    const raw =
      item.ASIN ||
      item.asin ||
      item.productId ||
      item.id;
    if (typeof raw === 'string') return raw.trim();
    return null;
  }

  _extractTitle(item) {
    const candidates = [
      // Official Creators API shape: itemInfo.title.DisplayValue
      item.itemInfo && item.itemInfo.title && item.itemInfo.title.DisplayValue,
      // Nested PA-API-like shape: ItemInfo.Title.DisplayValue
      item.ItemInfo && item.ItemInfo.Title && item.ItemInfo.Title.DisplayValue,
      // Direct nested objects
      item.title && item.title.DisplayValue,
      item.title && item.title.value,
      // Primitive fields
      item.title,
      item.name,
      item.productName,
      item.Title
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return '';
  }

  _extractPrice(item) {
    const candidates = [
      // Official Creators API shape: offersV2.listings[].price.Amount
      item.offersV2 && item.offersV2.listings && item.offersV2.listings[0] && item.offersV2.listings[0].price && item.offersV2.listings[0].price.Amount,
      item.offersV2 && item.offersV2.listings && item.offersV2.listings[0] && item.offersV2.listings[0].price && item.offersV2.listings[0].price.DisplayAmount,
      // Nested PA-API-like shape: Offers.Listings[0].Price.Amount
      item.Offers && item.Offers.Listings && item.Offers.Listings[0] && item.Offers.Listings[0].Price && item.Offers.Listings[0].Price.Amount,
      // Direct nested objects
      item.price && item.price.amount,
      item.price && item.price.value,
      item.Price && item.Price.Amount,
      item.salePrice && item.salePrice.amount,
      item.amount,
      item.price,
      item.salePrice
    ];

    for (const candidate of candidates) {
      if (candidate === null || candidate === undefined || candidate === '') continue;
      const parsed = this._parsePrice(candidate);
      if (parsed !== null) return parsed;
    }
    return null;
  }

  _parsePrice(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
    if (typeof value === 'string') {
      const match = value.replace(/[,]/g, '').match(/(\d+(?:\.\d+)?)/);
      if (match) {
        const num = parseFloat(match[1]);
        return Number.isFinite(num) ? Math.round(num * 100) / 100 : null;
      }
    }
    return null;
  }

  _extractImage(item) {
    const candidates = [
      // Official Creators API shape: images.primary.large.URL
      item.images && item.images.primary && item.images.primary.large && item.images.primary.large.URL,
      item.images && item.images.primary && item.images.primary.medium && item.images.primary.medium.URL,
      // Nested PA-API-like shape: Images.Primary.Large.URL
      item.Images && item.Images.Primary && item.Images.Primary.Large && item.Images.Primary.Large.URL,
      item.Images && item.Images.Primary && item.Images.Primary.Medium && item.Images.Primary.Medium.URL,
      // Nested object shapes
      item.image && (item.image.url || item.image.value || item.image.large || item.image.src),
      item.images && item.images.primary && item.images.primary.url,
      item.images && item.images.large && item.images.large.url,
      item.thumbnail && (item.thumbnail.url || item.thumbnail),
      // Primitive fields
      item.imageUrl,
      item.image,
      item.cover,
      item.coverUrl
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate.trim())) {
        return candidate.trim();
      }
    }
    return '';
  }

  _extractCategory(item) {
    const candidates = [
      // Official Creators API shape: browseNodeInfo.browseNodes[0].DisplayName
      item.browseNodeInfo && item.browseNodeInfo.browseNodes && item.browseNodeInfo.browseNodes[0] && item.browseNodeInfo.browseNodes[0].DisplayName,
      // Nested PA-API-like shape: BrowseNodeInfo.BrowseNodes[0]
      item.BrowseNodeInfo && item.BrowseNodeInfo.BrowseNodes && item.BrowseNodeInfo.BrowseNodes[0] && item.BrowseNodeInfo.BrowseNodes[0].DisplayName,
      item.categoryKey,
      item.categoryId,
      item.category,
      item.categoryName,
      item.browseNode
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
      // Convert numeric/other ids to string
      if (candidate !== null && candidate !== undefined) {
        const str = String(candidate).trim();
        if (str && str !== 'null' && str !== 'undefined') return str;
      }
    }
    return ''; // ProductIntelligence will classify from title downstream
  }

  _extractAvailability(item) {
    const candidates = [
      // Official Creators API shape: offersV2.listings[].availability
      item.offersV2 && item.offersV2.listings && item.offersV2.listings[0] && item.offersV2.listings[0].availability,
      item.isAvailable,
      item.available,
      item.inStock,
      item.availability && item.availability.State,
      item.availability && item.availability.state,
      item.availability && item.availability.status
    ];

    // First found explicit boolean wins.
    for (const candidate of candidates) {
      if (typeof candidate === 'boolean') return candidate;
    }

    // String statuses: treat only clearly-unavailable states as false.
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const lower = candidate.toLowerCase();
        if (['available', 'in stock', 'in_stock', 'active'].includes(lower)) return true;
        if (['unavailable', 'out of stock', 'out_of_stock', 'sold out', 'sold_out', 'inactive', 'not available'].includes(lower)) return false;
      }
    }

    // Default: assume available when unknown (caller can re-filter).
    return true;
  }

  /**
   * Extract the canonical product URL from the official Creators API response.
   * detailPageURL already includes the affiliate tag.
   */
  _extractDetailPageURL(item) {
    const raw = item.detailPageURL || item.DetailPageURL || item.detailPageUrl;
    if (typeof raw === 'string' && /^https?:\/\//i.test(raw.trim())) {
      return raw.trim();
    }
    return '';
  }

  /**
   * Build a canonical Amazon product URL. Used only when detailPageURL is absent.
   * Uses raw.url when it looks like an Amazon product URL; otherwise constructs one from the ASIN.
   */
  _buildProductUrl(item, asin) {
    const rawUrl = item.url || item.productUrl || item.link || item.urlString;
    if (typeof rawUrl === 'string' && /^https?:\/\//i.test(rawUrl) && /amazon\./i.test(rawUrl)) {
      const clean = rawUrl.split(/[?#]/)[0]; // strip query/hash
      const m = clean.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
      if (m) return `https://www.amazon.com/dp/${m[1]}`;
      return clean;
    }
    return `https://www.amazon.com/dp/${asin}`;
  }
}

module.exports = { AmazonConnector };