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
 * Affiliate links are produced by the existing AmazonAffiliateEngine
 * (generateAffiliateUrl) — this class deliberately does NOT duplicate affiliate
 * URL logic.
 *
 * RESPONSE ASSUMPTIONS (documented — Amazon Creators API response shape is not
 * fully public; the normalizer is defensive and tolerant of multiple shapes):
 *   - The API returns an object whose items are found at one of:
 *       response.items | response.data.items | response.data | response.results | response.products
 *   - Each item may expose fields as snake_case, camelCase, or nested objects:
 *       asin:        asin | ASIN | id | productId
 *       title/name:  title | name | Title | ItemInfo.Title.DisplayValue
 *       price:       price.amount | price | amount | salePrice.amount | Price.Amount
 *                    (string "$19.99" or number)
 *       image:       image.url | imageUrl | image | images.primary.url | large URL
 *       availability: isAvailable | available | availability.State | sourceAvailability
 *       category:    category | categoryId | categoryKey
 *   - Endpoint paths are configurable (env override or constructor option):
 *       search: products/search  (GET ?keyword=...)
 *       items:  products         (GET ?asins=B0...,B0...)
 *
 * Error handling:
 *   - Missing/empty API response                        -> throws AMAZON_CONNECTOR_EMPTY_RESPONSE
 *   - Items without an ASIN                             -> skipped (logged)
 *   - Items missing price or image                      -> kept, flagged in item.issues
 *   - Items explicitly unavailable                      -> kept with isAvailable:false (flagged)
 */

const { CreatorsApiClient } = require('./CreatorsApiClient');
const { AmazonAffiliateEngine } = require('./AmazonAffiliateEngine');

const DEFAULT_SEARCH_PATH = 'products/search';
const DEFAULT_ITEMS_PATH = 'products';
const DEFAULT_CONFIDENCE = 0.9; // Deterministic value for API-sourced data

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
   *   - limit: max results (pageSize)
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

    const params = new URLSearchParams();
    params.set('keyword', keyword.trim());
    const limit = Number(options.limit);
    if (Number.isInteger(limit) && limit > 0) {
      params.set('pageSize', String(limit));
    }

    const response = await this.client.request(`${this.searchPath}?${params.toString()}`, {
      method: options.method || 'GET',
      headers: options.headers
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

    const params = new URLSearchParams();
    params.set('asins', [...new Set(ids)].join(','));

    const response = await this.client.request(`${this.itemsPath}?${params.toString()}`, {
      method: options.method || 'GET',
      headers: options.headers
    });

    const items = this._extractItems(response);
    this._assertNonEmptyResponse(items, 'getProductsByASIN');

    return this._normalizeItems(items);
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
   * Returns [] when no array is found.
   */
  _extractItems(response) {
    if (!response || typeof response !== 'object') return [];

    const candidates = [
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

      const normalizedItem = {
        asin,
        title,
        name: title, // StockSpot Product.name is required; title acts as name
        retailer: 'amazon',
        category: this._extractCategory(raw),
        price: this._extractPrice(raw),
        image: this._extractImage(raw),
        url: this._buildProductUrl(raw, asin),
        affiliateLink: '', // filled below using existing AmazonAffiliateEngine
        isAvailable: this._extractAvailability(raw),
        confidence: DEFAULT_CONFIDENCE,
        pageText: ''
      };

      // Delegate affiliate URL construction to the existing engine.
      normalizedItem.affiliateLink = this.affiliateEngine.generateAffiliateUrl(normalizedItem.url);

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
      item.asin ||
      item.ASIN ||
      item.productId ||
      item.id;
    if (typeof raw === 'string') return raw.trim();
    return null;
  }

  _extractTitle(item) {
    const candidates = [
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
      item.price && item.price.amount,
      item.price && item.price.value,
      item.Price && item.Price.Amount,
      item.salePrice && item.salePrice.amount,
      item.amount,
      item.price,
      item.salePrice,
      item.Offers && item.Offers.Listings && item.Offers.Listings[0] && item.Offers.Listings[0].Price && item.Offers.Listings[0].Price.Amount
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
      item.categoryKey,
      item.categoryId,
      item.category,
      item.categoryName,
      item.browseNode,
      // Nested PA-API-like shape: BrowseNodeInfo.BrowseNodes[0]
      item.BrowseNodeInfo && item.BrowseNodeInfo.BrowseNodes && item.BrowseNodeInfo.BrowseNodes[0] && item.BrowseNodeInfo.BrowseNodes[0].DisplayName
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
   * Build a canonical Amazon product URL. Uses raw.url when it looks like an
   * Amazon product URL; otherwise constructs one from the ASIN.
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