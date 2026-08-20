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
 * Response structure (per the official docs):
 *   Items are nested under response.itemsResult.items[].
 *   Each item exposes:
 *     - asin
 *     - detailPageURL (canonical product URL, already includes affiliate tag)
 *     - itemInfo.title.displayValue
 *     - images.primary.large.url
 *     - offersV2.listings[].price.money.{amount,currency,displayAmount}
 *     - browseNodeInfo.browseNodes
 *
 * Affiliate links: detailPageURL already contains the affiliate tag, so it is used
 * directly as both url and affiliateLink. We do NOT regenerate Amazon URLs when
 * detailPageURL exists.
 *
 * Price selection (Phase 12.6.6):
 *   1. Prefer the Buy Box winner listing (isBuyBoxWinner === true) with a valid price.
 *   2. Otherwise use the first valid New-condition listing with a valid price.
 *   3. Otherwise fall back to any listing with a valid price.
 *   4. Only accept Number.isFinite(Number(amount)) && amount > 0.
 *
 * Error handling:
 *   - Missing/empty API response                        -> throws AMAZON_CONNECTOR_EMPTY_RESPONSE
 *   - Items without an ASIN                             -> skipped (logged)
 *   - Items missing price or image                      -> kept, flagged in item.issues
 *   - Items explicitly unavailable                      -> kept with isAvailable:false (flagged)
 */

const { CreatorsApiClient } = require('./CreatorsApiClient');
const { AmazonAffiliateEngine } = require('./AmazonAffiliateEngine');
const { CategoryDetector } = require('./CategoryDetector');

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
      marketplace: 'www.amazon.com',
      partnerTag: this._getPartnerTag(),
      resources: DEFAULT_RESOURCES
    };

    const response = await this.client.request(this.itemsPath, {
      method: 'POST',
      headers: options.headers,
      body
    });

    // DIAGNOSTICS: Report the actual response object being processed.
    // Do NOT log tokens, secrets, credentials, or affiliate IDs.
    const items = this._extractItems(response);
    if (response && typeof response === 'object') {
      const itemsResult = response.itemsResult || (response.Output && response.Output.itemsResult);
      console.log('[AmazonConnector] Creators API response:');
      console.log(`  HTTP ${response._httpStatus || 'N/A'}`);
      console.log(`  itemsResult present: ${!!itemsResult}`);
      console.log(`  items returned: ${items.length}`);

      // Log error fields if present: __type, message, code, requestId.
      // Amazon error envelopes may be nested under Output (e.g. { Output: { __type: ... } })
      // or under response.error / response.errors[0].
      const err = (response.Output && (response.Output.__type || response.Output.message || response.Output.code || response.Output.requestId))
        ? response.Output
        : (response.error || (response.errors && response.errors[0]));
      if (err) {
        console.log('[AmazonConnector DEBUG] error __type:', err.__type || err.type || 'N/A');
        console.log('[AmazonConnector DEBUG] error message:', err.message || 'N/A');
        console.log('[AmazonConnector DEBUG] error code:', err.code || 'N/A');
        console.log('[AmazonConnector DEBUG] error requestId:', err.requestId || 'N/A');
      }
    } else {
      console.log('[AmazonConnector DEBUG] Response is not an object:', typeof response);
    }

    if (items.length > 0) {
      const firstAsin = this._extractAsin(items[0]);
      console.log(`[AmazonConnector] Received ${items.length} item(s) from Creators API${firstAsin ? ` (first ASIN: ${firstAsin})` : ''}`);
    }

    // TEMPORARY DIAGNOSTIC (Phase 12.6.6): Log the raw item structure for the
    // FIRST returned ASIN only, to verify the actual Creators API price path.
    // Logs ONLY relevant item structure — never tokens, secrets, or credentials.
    if (items.length > 0) {
      this._logItemStructureDiagnostic(items[0]);
    }

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

  /**
   * TEMPORARY DIAGNOSTIC (Phase 12.6.6): Log the relevant structure of a single
   * raw Creators API item to verify the actual price path.
   *
   * Logs ONLY the fields needed to diagnose pricing — never tokens, secrets,
   * credentials, or authorization headers.
   *
   * @param {object} item - a single raw Creators API item
   */
  _logItemStructureDiagnostic(item) {
    if (!item || typeof item !== 'object') {
      console.log('[AmazonConnector DIAG] item is not an object:', typeof item);
      return;
    }

    const asin = this._extractAsin(item);
    const title = this._extractTitle(item);
    const detailPageURL = this._extractDetailPageURL(item);
    const offersV2 = item.offersV2;
    const listings = offersV2 && Array.isArray(offersV2.listings) ? offersV2.listings : [];

    console.log('[AmazonConnector DIAG] === Item structure diagnostic (first ASIN only) ===');
    console.log('[AmazonConnector DIAG] asin:', asin || 'N/A');
    console.log('[AmazonConnector DIAG] detailPageURL present:', !!detailPageURL);
    console.log('[AmazonConnector DIAG] itemInfo.title present:', !!(item.itemInfo && item.itemInfo.title));
    console.log('[AmazonConnector DIAG] title:', title ? title.slice(0, 80) : 'N/A');
    console.log('[AmazonConnector DIAG] offersV2 present:', offersV2 !== null && offersV2 !== undefined);
    console.log('[AmazonConnector DIAG] offersV2.listings count:', listings.length);

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i];
      if (!listing || typeof listing !== 'object') {
        console.log(`[AmazonConnector DIAG]   listing[${i}]: not an object`);
        continue;
      }
      const price = listing.price;
      const money = price && price.money;
      console.log(`[AmazonConnector DIAG]   listing[${i}]:`);
      console.log(`[AmazonConnector DIAG]     availability:`, listing.availability !== undefined ? JSON.stringify(listing.availability) : 'N/A');
      console.log(`[AmazonConnector DIAG]     condition:`, listing.condition !== undefined ? JSON.stringify(listing.condition) : 'N/A');
      console.log(`[AmazonConnector DIAG]     isBuyBoxWinner:`, listing.isBuyBoxWinner !== undefined ? listing.isBuyBoxWinner : 'N/A');
      console.log(`[AmazonConnector DIAG]     merchantInfo present:`, !!(listing.merchantInfo && typeof listing.merchantInfo === 'object'));
      console.log(`[AmazonConnector DIAG]     price present:`, !!price);
      console.log(`[AmazonConnector DIAG]     price object keys:`, price && typeof price === 'object' ? Object.keys(price) : 'N/A');
      console.log(`[AmazonConnector DIAG]     price.money present:`, !!money);
      if (money && typeof money === 'object') {
        console.log(`[AmazonConnector DIAG]     price.money.amount:`, money.amount !== undefined ? money.amount : 'N/A');
        console.log(`[AmazonConnector DIAG]     price.money.currency:`, money.currency !== undefined ? money.currency : 'N/A');
        console.log(`[AmazonConnector DIAG]     price.money.displayAmount:`, money.displayAmount !== undefined ? money.displayAmount : 'N/A');
      }
      console.log(`[AmazonConnector DIAG]     savingBasis present:`, !!(listing.savingBasis && typeof listing.savingBasis === 'object'));
      console.log(`[AmazonConnector DIAG]     dealDetails present:`, !!(listing.dealDetails && typeof listing.dealDetails === 'object'));
    }
    console.log('[AmazonConnector DIAG] === End item structure diagnostic ===');
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
   * Official structure: response.itemsResult.items (product objects directly)
   * Also tolerates legacy/alternate shapes for robustness.
   * Returns [] when no array is found.
   */
  _extractItems(response) {
    if (!response || typeof response !== 'object') return [];

    const candidates = [
      // Official Creators API shape: itemsResult.items (product objects directly)
      response.itemsResult && response.itemsResult.items,
      // Alternate (older wrapper): Output.itemsResult.items
      response.Output && response.Output.itemsResult && response.Output.itemsResult.items,
      // Legacy/alternate shapes
      response.itemResults && response.itemResults.items && response.itemResults.items.map(i => i && i.item),
      response.itemResults && response.itemResults.items,
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
        category: this._extractCategory(raw, title, url),
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
      if (normalizedItem.price === null || normalizedItem.price === undefined) {
        issues.push('missing_price');
        // Improved diagnostic: explain exactly why no current price is available.
        console.warn(`[AmazonConnector] Item ${asin} no current price — ${this._priceUnavailableReason(raw)}`);
      }
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
      // Official Creators API shape: itemInfo.title.displayValue
      item.itemInfo && item.itemInfo.title && item.itemInfo.title.displayValue,
      // Alternate casing: itemInfo.title.DisplayValue
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

  /**
   * Extract the best current price from a Creators API item.
   *
   * Official price path: offersV2.listings[].price.money.amount
   *
   * Selection rules (Phase 12.6.6):
   *   1. Prefer the Buy Box winner listing (isBuyBoxWinner === true) with a valid price.
   *   2. Otherwise use the first valid New-condition listing with a valid price.
   *   3. Otherwise fall back to any listing with a valid price.
   *
   * Only accepts Number.isFinite(Number(amount)) && amount > 0.
   * displayAmount is never used as the numeric source.
   */
  _extractPrice(item) {
    if (!item || typeof item !== 'object') return null;

    // Official Creators API shape: offersV2.listings[].price.money.amount
    const listings = item.offersV2 && item.offersV2.listings;
    if (Array.isArray(listings)) {
      // 1) Prefer the Buy Box winner listing with a valid price.
      const buyBoxWinner = listings.find(l => l && l.isBuyBoxWinner === true);
      if (buyBoxWinner) {
        const buyBoxPrice = this._extractPriceFromListing(buyBoxWinner);
        if (buyBoxPrice !== null) return buyBoxPrice;
      }

      // 2) Otherwise use the first valid New-condition listing with a valid price.
      for (const listing of listings) {
        if (!listing) continue;
        const condition = this._extractListingCondition(listing);
        if (condition && condition.toLowerCase() !== 'new') continue;
        const parsed = this._extractPriceFromListing(listing);
        if (parsed !== null) return parsed;
      }

      // 3) Fall back to any listing with a valid price.
      for (const listing of listings) {
        const parsed = this._extractPriceFromListing(listing);
        if (parsed !== null) return parsed;
      }
    }

    // Official Creators API shape: offersV2.summaries[].{price|lowestPrice|offerPrice}
    const summaries = item.offersV2 && item.offersV2.summaries;
    if (Array.isArray(summaries)) {
      for (const summary of summaries) {
        const price = summary && (summary.price || summary.lowestPrice || summary.offerPrice);
        if (!price) continue;
        const parsed = this._parsePrice(
          price.Amount !== undefined ? price.Amount :
          price.DisplayAmount !== undefined ? price.DisplayAmount :
          price.amount !== undefined ? price.amount :
          price.value !== undefined ? price.value : null
        );
        if (parsed !== null) return parsed;
      }
    }

    const candidates = [
      // Nested PA-API-like shape: Offers.Listings[].Price.Amount
      ...(item.Offers && item.Offers.Listings ? this._extractPricesFromOffers(item.Offers.Listings) : []),
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

  /**
   * Extract a numeric price from a single Creators API offer listing.
   *
   * Official Creators API price path: listing.price.money.amount
   * (money is a nested object with amount / currency / displayAmount).
   *
   * Only accepts a price when Number.isFinite(Number(amount)) AND amount > 0.
   * displayAmount is never used as the numeric source.
   *
   * @param {object} listing - a single offersV2.listings[] entry
   * @returns {number|null} numeric price, or null when no usable price exists
   */
  _extractPriceFromListing(listing) {
    if (!listing || typeof listing !== 'object') return null;
    const price = listing.price;
    if (!price || typeof price !== 'object') return null;

    // Official Creators API shape: price.money.amount
    const money = price.money;
    if (money && typeof money === 'object') {
      const amount = money.amount;
      if (amount !== undefined && amount !== null && amount !== '') {
        const num = Number(amount);
        if (Number.isFinite(num) && num > 0) {
          return Math.round(num * 100) / 100;
        }
      }
    }

    // Tolerate alternate/legacy shapes (PA-API-like) for robustness.
    const parsed = this._parsePrice(
      price.Amount !== undefined ? price.Amount :
      price.DisplayAmount !== undefined ? price.DisplayAmount :
      price.amount !== undefined ? price.amount :
      price.value !== undefined ? price.value :
      price.displayAmount !== undefined ? price.displayAmount : null
    );
    return parsed;
  }

  /**
   * Extract the condition of a Creators API offer listing (e.g. "New", "Used").
   */
  _extractListingCondition(listing) {
    if (!listing || typeof listing !== 'object') return '';
    const raw = listing.condition || listing.conditionType || (listing.condition && listing.condition.value);
    if (typeof raw === 'string') return raw.trim();
    if (raw && typeof raw === 'object' && typeof raw.value === 'string') return raw.value.trim();
    return '';
  }

  /**
   * Iterate a PA-API-like Offers.Listings array and return candidate price values.
   */
  _extractPricesFromOffers(listings) {
    const prices = [];
    if (!Array.isArray(listings)) return prices;
    for (const listing of listings) {
      const price = listing && listing.Price;
      if (price) {
        if (price.Amount !== undefined) prices.push(price.Amount);
        if (price.DisplayAmount !== undefined) prices.push(price.DisplayAmount);
      }
    }
    return prices;
  }

  /**
   * Explain why no current offer price could be extracted (diagnostic only —
   * never invents or logs secrets).
   */
  _priceUnavailableReason(item) {
    if (!item || typeof item !== 'object') return 'raw item is not an object';
    const offersV2 = item.offersV2;
    if (offersV2 === null || offersV2 === undefined) return 'offersV2 is absent (Amazon returned no offer data)';
    if (typeof offersV2 !== 'object') return `offersV2 is not an object (${typeof offersV2})`;

    const listings = offersV2.listings;
    if (!Array.isArray(listings) || listings.length === 0) {
      const summaries = offersV2.summaries;
      if (Array.isArray(summaries) && summaries.length > 0) {
        return 'offersV2.summaries present but no extractable price';
      }
      return `offersV2.listings is ${Array.isArray(listings) ? 'empty' : 'missing'} and no summaries present`;
    }

    const priced = listings.filter(l => l && l.price &&
      (this._extractPriceFromListing(l) !== null));
    return `offersV2.listings=${listings.length} but only ${priced.length} listing(s) include a price`;
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
      // Official Creators API shape: images.primary.large.url
      item.images && item.images.primary && item.images.primary.large && item.images.primary.large.url,
      // Alternate casing: images.primary.large.URL
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

  /**
   * Determine a safe StockSpot category for an Amazon product.
   *
   * Deterministic mapping that ALWAYS returns one of the existing valid
   * TrackedProduct enum values (never '' and never an invented value):
   *
   *   1. Collect Amazon-provided category metadata (browse node names, category fields).
   *   2. If a candidate directly matches a valid enum value, use it.
   *   3. Otherwise feed the product title/url AND the Amazon metadata through the
   *      existing project CategoryDetector, which returns a valid enum value
   *      and defaults to the safe fallback 'other'.
   *
   * @param {object} item raw Creators API item
   * @param {string} title normalized product title
   * @param {string} url normalized product url
   * @returns {string} one of: pokemon_tcg | one_piece_tcg | sports_cards | gaming |
   *                   electronics | collectibles | toys | other
   */
  _extractCategory(item, title = '', url = '') {
    const VALID_ENUMS = new Set(['pokemon_tcg', 'one_piece_tcg', 'sports_cards', 'gaming', 'electronics', 'collectibles', 'toys', 'other']);

    if (!item || typeof item !== 'object') {
      return CategoryDetector.detectCategory(title, url, '');
    }

    const candidates = [
      // Official Creators API shape: browseNodeInfo.browseNodes[].DisplayName
      ...this._collectBrowseNodeNames(item),
      item.categoryKey,
      item.categoryId,
      item.category,
      item.categoryName,
      item.browseNode
    ];

    // Direct match on one of the existing valid enum values.
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') continue;
      const normalized = candidate.trim().toLowerCase();
      if (VALID_ENUMS.has(normalized)) return normalized;
    }

    // Feed all Amazon metadata into the existing deterministic CategoryDetector.
    const amazonMetadata = candidates
      .filter(Value => typeof Value === 'string' && Value.trim())
      .join(' ');

    return CategoryDetector.detectCategory(title, url, amazonMetadata);
  }

  /**
   * Collect all Amazon browse node display names from a Creators API item.
   */
  _collectBrowseNodeNames(item) {
    const names = [];
    const nodes = (item && item.browseNodeInfo && item.browseNodeInfo.browseNodes) ||
                  (item && item.BrowseNodeInfo && item.BrowseNodeInfo.BrowseNodes) ||
                  null;
    if (!Array.isArray(nodes)) return names;
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (typeof node.DisplayName === 'string') names.push(node.DisplayName);
      if (typeof node.displayName === 'string') names.push(node.displayName);
      if (typeof node.name === 'string') names.push(node.name);
    }
    return names;
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