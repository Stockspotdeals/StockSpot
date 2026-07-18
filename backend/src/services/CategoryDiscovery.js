const { RetailerDetector, RETAILER_TYPES } = require('./RetailerDetector');
const { TrackedProduct } = require('../models/TrackedProduct');
const { DiscoverySource } = require('../models/DiscoverySource');
const { CategoryDetector } = require('./CategoryDetector');

// Lazy load cheerio — only loaded when actually needed for HTML parsing
let cheerio = null;
function getCheerio() {
  if (!cheerio) {
    try {
      cheerio = require('cheerio');
    } catch (e) {
      console.warn('[CategoryDiscovery] cheerio not available — HTML parsing disabled');
      return null;
    }
  }
  return cheerio;
}

/**
 * High-priority categories for autonomous discovery.
 * Products must match at least one of these to be auto-discovered.
 */
const PRIORITY_CATEGORIES = [
  'pokemon_tcg',
  'one_piece_tcg',
  'sports_cards',
  'gaming',
  'collectibles',
  'toys'
];

/**
 * Preorder and collector-intent keywords used to identify high-signal
 * discovery pages. Products whose titles contain these keywords receive
 * a hype score boost via the existing calculateHypeScore() mechanism.
 */
const PREORDER_SIGNAL_KEYWORDS = [
  'preorder', 'pre-order', 'pre order', 'coming soon', 'reserve now',
  'launches', 'releases', 'collector', 'limited edition', 'exclusive',
  'bundle', 'anniversary', 'special edition', 'premium', 'steelbook',
  'booster box', 'elite trainer box', 'gift collection', 'starter deck',
  'console bundle'
];

/**
 * Seed data for the DiscoverySource collection.
 * This is the canonical list of discovery URLs that CategoryDiscovery crawls.
 * On first startup, these are inserted into the database.
 * Once populated, DiscoverySource is the single source of truth.
 */
const SEED_CATEGORY_URLS = {
  [RETAILER_TYPES.AMAZON]: [
    // Trading cards & collectibles
    'https://www.amazon.com/s?k=pokemon+trading+cards&i=toys-and-games&rh=n%3A165795011',
    'https://www.amazon.com/s?k=one+piece+trading+card+game&i=toys-and-games',
    'https://www.amazon.com/s?k=sports+trading+cards&i=toys-and-games&rh=n%3A166331011',
    'https://www.amazon.com/s?k=collectible+action+figures&i=toys-and-games',
    'https://www.amazon.com/s?k=lego+sets&i=toys-and-games',
    'https://www.amazon.com/s?k=magic+the+gathering&i=toys-and-games',
    'https://www.amazon.com/s?k=yu+gi+oh+trading+cards&i=toys-and-games',
    // Gaming
    'https://www.amazon.com/s?k=nintendo+switch+games&i=videogames',
    'https://www.amazon.com/s?k=playstation+5+games&i=videogames',
    'https://www.amazon.com/s?k=xbox+series+x+games&i=videogames',
    // Preorder & collector edition pages
    'https://www.amazon.com/s?k=pokemon+booster+box+preorder&i=toys-and-games',
    'https://www.amazon.com/s?k=collector+edition+preorder&i=toys-and-games',
    'https://www.amazon.com/s?k=limited+edition+steelbook&i=videogames',
    'https://www.amazon.com/s?k=elite+trainer+box&i=toys-and-games',
    'https://www.amazon.com/s?k=special+edition+console+bundle&i=videogames',
    'https://www.amazon.com/s?k=exclusive+collector+action+figure&i=toys-and-games',
    'https://www.amazon.com/s?k=preorder+nintendo+switch&i=videogames',
    'https://www.amazon.com/s?k=coming+soon+pokemon&i=toys-and-games'
  ],
  [RETAILER_TYPES.WALMART]: [
    'https://www.walmart.com/browse/toys/pokemon-trading-cards/4171_1227809_1229591',
    'https://www.walmart.com/browse/video-games/nintendo-switch-games/2636_7050607',
    'https://www.walmart.com/browse/video-games/playstation-5-games/2636_4938110',
    'https://www.walmart.com/browse/video-games/xbox-series-x-games/2636_7049956',
    'https://www.walmart.com/browse/toys/collectibles/4171_1227812',
    'https://www.walmart.com/browse/toys/action-figures/4171_1227809_1228046'
  ],
  [RETAILER_TYPES.TARGET]: [
    'https://www.target.com/c/pokemon-trading-cards/-/N-5xtcp',
    'https://www.target.com/c/nintendo-switch-games/-/N-5xsg0',
    'https://www.target.com/c/playstation-5-games/-/N-5xsg1',
    'https://www.target.com/c/xbox-series-x-games/-/N-5xsg2',
    'https://www.target.com/c/collectible-toys/-/N-55da6',
    'https://www.target.com/c/action-figures/-/N-55da3'
  ],
  [RETAILER_TYPES.BESTBUY]: [
    'https://www.bestbuy.com/site/trading-card-games/pokemon-trading-cards/pcmcat313500050014.c?id=pcmcat313500050014',
    'https://www.bestbuy.com/site/video-games/nintendo-switch/pcmcat1486574754468.c?id=pcmcat1486574754468',
    'https://www.bestbuy.com/site/video-games/playstation-5/pcmcat1582144059518.c?id=pcmcat1582144059518',
    'https://www.bestbuy.com/site/video-games/xbox-series-x/pcmcat1582144744292.c?id=pcmcat1582144744292',
    'https://www.bestbuy.com/site/toys/action-figures/abcat170100.c?id=abcat170100',
    // Preorder discovery pages
    'https://www.bestbuy.com/site/electronics/pc-games/pcmcat143600050187.c?id=pcmcat143600050187'
  ],
  [RETAILER_TYPES.GAMESTOP]: [
    // TCG
    'https://www.gamestop.com/tcg/pokemon',
    'https://www.gamestop.com/tcg/one-piece',
    'https://www.gamestop.com/tcg/magic',
    'https://www.gamestop.com/tcg/yu-gi-oh',
    // Gaming
    'https://www.gamestop.com/video-games/nintendo-switch',
    'https://www.gamestop.com/video-games/playstation-5',
    'https://www.gamestop.com/video-games/xbox-series-x',
    // Collectibles
    'https://www.gamestop.com/collectibles',
    'https://www.gamestop.com/toys',
    // Preorder-focused pages
    'https://www.gamestop.com/collectibles/action-figures',
    'https://www.gamestop.com/collectibles/premium'
  ]
};

/**
 * Maximum number of category pages to visit per retailer per discovery run.
 */
const MAX_PAGES_PER_RETAILER = 3;

/**
 * Maximum number of new products to create per discovery run (rate control).
 */
const MAX_NEW_PRODUCTS_PER_RUN = 25;

class CategoryDiscovery {
  constructor(productMonitor) {
    this.productMonitor = productMonitor;
    this.isDryRun = process.env.DRY_RUN === 'true';
  }

  /**
   * Canonicalize a discovery URL so that equivalent URLs become identical.
   *
   * 1. Removes tracking-only parameters (utm_*, ref, ref_, tag, affiliate params, etc.)
   * 2. Sorts remaining query parameters alphabetically
   * 3. Removes fragment (#section)
   * 4. Removes trailing slashes from pathname
   * 5. Lowercases the pathname
   *
   * Preserves functional discovery parameters: k, i, rh, node, page, sort, category, search
   */
  static canonicalizeDiscoveryUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      const TRACKING_PARAMS = new Set([
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'ref', 'ref_', 'tag', 'ascsubtag', 'irclickid', 'irgwc', 'cjevent',
        'affId', 'affiliate', 'affil', 'partner', 'clickid', 'sourceid'
      ]);

      // Remove tracking parameters — match pf_rd_* and pd_rd_* by prefix
      const keysToDelete = [];
      for (const key of parsed.searchParams.keys()) {
        if (TRACKING_PARAMS.has(key) || key.startsWith('pf_rd_') || key.startsWith('pd_rd_')) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        parsed.searchParams.delete(key);
      }

      // Sort remaining query parameters alphabetically for deterministic ordering
      const sortedParams = [];
      for (const key of parsed.searchParams.keys()) {
        const values = parsed.searchParams.getAll(key);
        sortedParams.push([key, values]);
      }
      sortedParams.sort((a, b) => a[0].localeCompare(b[0]));

      // Rebuild search params in sorted order
      parsed.search = '';
      for (const [key, values] of sortedParams) {
        for (const value of values) {
          parsed.searchParams.append(key, value);
        }
      }

      // Remove fragment
      parsed.hash = '';

      // Normalize pathname: lowercase, remove trailing slash (but preserve root "/")
      let pathname = parsed.pathname.toLowerCase();
      if (pathname.length > 1) {
        pathname = pathname.replace(/\/+$/, '');
      }
      parsed.pathname = pathname;

      // Normalize origin to lowercase
      const origin = parsed.origin.toLowerCase();

      return origin + parsed.pathname + parsed.search;
    } catch {
      // If parsing fails, return the original string unchanged
      return rawUrl;
    }
  }

  /**
   * Seed the DiscoverySource collection if it is empty.
   * Called once on first use — never overwrites existing records.
   * This moves the canonical source of discovery URLs from a
   * hardcoded constant into the database without changing runtime behavior.
   */
  static async initializeSources() {
    try {
      const existingCount = await DiscoverySource.countDocuments();
      if (existingCount > 0) {
        console.log(`[CategoryDiscovery] DiscoverySource already populated (${existingCount} records), skipping seed`);
        return;
      }

      console.log('[CategoryDiscovery] Seeding DiscoverySource collection from SEED_CATEGORY_URLS...');
      const docs = [];
      let order = 0;

      for (const [retailer, urls] of Object.entries(SEED_CATEGORY_URLS)) {
        for (const url of urls) {
          const canonicalUrl = CategoryDiscovery.canonicalizeDiscoveryUrl(url);
          docs.push({
            url: canonicalUrl,
            retailer,
            sourceType: 'category',
            priority: 100,
            enabled: true
          });
          order++;
        }
      }

      if (docs.length > 0) {
        await DiscoverySource.insertMany(docs, { ordered: false });
        console.log(`[CategoryDiscovery] Seeded ${docs.length} discovery sources`);
      }
    } catch (error) {
      // Duplicate key errors are expected on concurrent startup — safe to ignore
      if (error.code !== 11000) {
        console.warn('[CategoryDiscovery] Failed to seed discovery sources:', error.message);
      }
    }
  }

  /**
   * Get enabled discovery sources grouped by retailer, preserving seed order.
   * Returns the same structure as the legacy CATEGORY_URLS constant:
   *   { retailer1: [url1, url2, ...], retailer2: [...] }
   */
  static async getDiscoveryUrls() {
    const sources = await DiscoverySource.find({ enabled: true })
      .sort({ priority: 1, createdAt: 1 })
      .lean();

    const grouped = {};
    for (const source of sources) {
      if (!grouped[source.retailer]) {
        grouped[source.retailer] = [];
      }
      grouped[source.retailer].push(source.url);
    }

    return grouped;
  }

  /**
   * Discover new DiscoverySource records by examining retailer root pages
   * and extracting candidate navigation links (category, search, preorder,
   * landing pages). This runs AFTER normal product discovery.
   *
   * Only saves URLs that appear to be discovery pages, not individual products.
   * Maximum 10 new sources per run, maximum 2 root pages per retailer.
   */
  static async discoverNewSources() {
    const rootDomains = {
      [RETAILER_TYPES.AMAZON]: 'https://www.amazon.com',
      [RETAILER_TYPES.WALMART]: 'https://www.walmart.com',
      [RETAILER_TYPES.TARGET]: 'https://www.target.com',
      [RETAILER_TYPES.BESTBUY]: 'https://www.bestbuy.com',
      [RETAILER_TYPES.GAMESTOP]: 'https://www.gamestop.com'
    };

    const MAX_ROOT_PAGES = 2;
    const MAX_NEW_SOURCES = 10;
    const DISCOVERY_TTL_DAYS = 7;
    let newSourceCount = 0;

    // Patterns to identify discovery pages (not individual products)
    const discoveryPatterns = [
      /\/s\?/i,                             // Amazon/Walmart search
      /\/browse\//i,                         // Walmart browse
      /\/c\//i,                              // Target category
      /\/site\//i,                           // Best Buy category
      /\/tcg\//i,                            // GameStop TCG
      /\/collectibles\//i,                   // GameStop collectibles
      /\/preorder/i,                         // Preorder pages
      /\/coming-soon/i,                      // Coming soon
      /\/category\//i,                       // Generic category
      /\/search\//i,                         // Generic search
      /\/landing-page\//i,                   // Landing pages
      /\/deals\//i,                          // Deals pages
      /\/new-releases\//i,                   // New releases
      /\?k=/,                                // Amazon keyword search
      /\?i=/,                                // Amazon search refinements
      /\?node=/,                             // Amazon category node
      /\/s\?ref_=/,                          // Amazon browse
      /\/video-games\//i,                    // Gaming landing pages
      /\/toys\//i,                           // Toys landing
      /\/trading-cards\//i                   // TCG landing
    ];

    // Patterns to REJECT individual product pages
    const rejectPatterns = [
      /\/dp\/[A-Z0-9]{10}/i,                 // Amazon product
      /\/gp\/product\//i,                    // Amazon product
      /\/product\//i,                         // Generic product
      /\/products\/[^\/]+\/\d+/i,            // GameStop product
      /\/ip\/[^\/]+\/\d+/i,                  // Walmart product
      /\/p\//i,                               // Target product
      /\/site\/[^\/]+\/\d+\.p/i,             // Best Buy product
      /\/cart/i,                             // Cart
      /\/checkout/i,                         // Checkout
      /\/login/i,                            // Login
      /\/account\//i,                        // Account
      /\/help\//i,                           // Help
      /\/support\//i,                        // Support
      /\/blog\//i,                           // Blog
      /\/news\//i,                           // News
      /\/privacy\//i,                        // Privacy
      /\/terms\//i,                          // Terms
      /\/contact-us\//i,                     // Contact
      /\/about-us\//i,                       // About
      /\/careers\//i                         // Careers
    ];

    console.log('[CategoryDiscovery] Starting source discovery...');
    const existingSources = await DiscoverySource.distinct('url');

    for (const [retailer, rootUrl] of Object.entries(rootDomains)) {
      if (newSourceCount >= MAX_NEW_SOURCES) break;

      const existingRetailerCount = existingSources.filter(u => {
        try { return RetailerDetector.detectRetailer(u) === retailer; } catch { return false; }
      }).length;

      // Only discover if retailer has fewer than 20 sources — enough coverage
      if (existingRetailerCount >= 20) {
        console.log(`[CategoryDiscovery] ${retailer} already has ${existingRetailerCount} sources, skipping`);
        continue;
      }

      for (let page = 0; page < MAX_ROOT_PAGES; page++) {
        if (newSourceCount >= MAX_NEW_SOURCES) break;

        const fetchUrl = page === 0 ? rootUrl : `${rootUrl}/s?k=pokemon`;
        const config = RetailerDetector.getRetailerConfig(retailer);

        try {
          const cheerioLib = getCheerio();
          if (!cheerioLib) continue;

          // Use a simple axios fetch directly for source discovery — this is
          // a lightweight navigational scan, not product monitoring.
          const axios = require('axios');
          const response = await axios.get(fetchUrl, {
            timeout: 15000,
            headers: {
              'User-Agent': config.userAgent || 'Mozilla/5.0',
              'Accept': 'text/html',
              'Accept-Language': 'en-US,en;q=0.9'
            }
          });

          if (response.status !== 200 || !response.data) continue;

          const $ = cheerioLib.load(response.data);
          const candidateUrls = new Set();

          // Extract all navigation links from the page
          $('a[href]').each((i, el) => {
            const href = $(el).attr('href');
            if (!href) return;

            const fullUrl = href.startsWith('http')
              ? href
              : `${rootUrl}${href.startsWith('/') ? href : '/' + href}`;

            try {
              const canonicalUrl = CategoryDiscovery.canonicalizeDiscoveryUrl(fullUrl);

              // Must belong to the same retailer
              if (RetailerDetector.detectRetailer(canonicalUrl) !== retailer) return;

              // Must look like a discovery page
              const isDiscovery = discoveryPatterns.some(p => p.test(canonicalUrl));
              if (!isDiscovery) return;

              // Must NOT look like a product page
              const isRejected = rejectPatterns.some(p => p.test(canonicalUrl));
              if (isRejected) return;

              candidateUrls.add(canonicalUrl);
            } catch {
              // Invalid URL — skip
            }
          });

          for (const candidateUrl of candidateUrls) {
            if (newSourceCount >= MAX_NEW_SOURCES) break;
            if (existingSources.includes(candidateUrl)) continue;

            try {
              await DiscoverySource.create({
                url: candidateUrl,
                retailer,
                sourceType: 'category',
                priority: 200,
                enabled: true
              });
              existingSources.push(candidateUrl);
              newSourceCount++;
              console.log(`[CategoryDiscovery] ✅ New discovery source: [${retailer}] ${candidateUrl}`);
            } catch (err) {
              if (err.code !== 11000) {
                console.warn(`[CategoryDiscovery] Failed to save source ${candidateUrl}:`, err.message);
              }
            }
          }
        } catch (error) {
          console.warn(`[CategoryDiscovery] Source discovery fetch failed for ${retailer} page ${page}:`, error.message);
        }

        // Polite delay between root page fetches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`[CategoryDiscovery] Source discovery complete: ${newSourceCount} new sources found`);
  }

  /**
   * Run a discovery cycle across all supported retailers.
   * Called from MonitoringWorker.runMonitoringCycle().
   *
   * @returns {Array<{ retailer: string, title: string, url: string, reason: string, timestamp: Date }>}
   */
  async discoverProducts() {
    const CATEGORY_URLS = await CategoryDiscovery.getDiscoveryUrls();
    const discoveries = [];
    const retailerKeys = Object.keys(CATEGORY_URLS);
    let newProductCount = 0;

    console.log('[CategoryDiscovery] Starting discovery cycle...');

    for (const retailer of retailerKeys) {
      if (newProductCount >= MAX_NEW_PRODUCTS_PER_RUN) {
        console.log(`[CategoryDiscovery] Reached max new products (${MAX_NEW_PRODUCTS_PER_RUN}), stopping.`);
        break;
      }

      const urls = CATEGORY_URLS[retailer].slice(0, MAX_PAGES_PER_RETAILER);

      for (const categoryUrl of urls) {
        if (newProductCount >= MAX_NEW_PRODUCTS_PER_RUN) break;

        try {
          const discovered = await this.discoverFromCategoryPage(retailer, categoryUrl);
          for (const product of discovered) {
            discoveries.push(product);
            newProductCount++;
            if (newProductCount >= MAX_NEW_PRODUCTS_PER_RUN) break;
          }

          // Polite delay between category page fetches
          await this.sleep(1500);
        } catch (error) {
          console.warn(`[CategoryDiscovery] Failed to discover from ${retailer} ${categoryUrl}: ${error.message}`);
        }
      }
    }

    console.log(`[CategoryDiscovery] Discovery cycle complete: ${discoveries.length} new products found`);

    // Phase 2: Source Discovery — find new discovery pages without creating products
    try {
      await CategoryDiscovery.discoverNewSources();
    } catch (sourceError) {
      console.warn('[CategoryDiscovery] Source discovery error (non-fatal):', sourceError.message);
    }

    return discoveries;
  }

  /**
   * Visit a single category page, extract product links, deduplicate, and create TrackedProducts.
   *
   * @param {string} retailer
   * @param {string} categoryUrl
   * @returns {Array<{ retailer: string, title: string, url: string, reason: string, timestamp: Date }>}
   */
  async discoverFromCategoryPage(retailer, categoryUrl) {
    const cheerioLib = getCheerio();
    if (!cheerioLib) {
      console.warn('[CategoryDiscovery] cheerio not available, skipping category page discovery');
      return [];
    }

    console.log(`[CategoryDiscovery] Fetching category page: ${retailer} ${categoryUrl}`);

    // Use the existing ProductMonitor's fetch infrastructure
    const config = RetailerDetector.getRetailerConfig(retailer);
    const page = await this.productMonitor.fetchHtmlWithRetry(categoryUrl, config);

    if (!page || page.pageType === 'blocked' || page.pageType === 'bot_interstitial' || !page.html) {
      console.warn(`[CategoryDiscovery] Could not fetch category page: ${retailer} ${categoryUrl} (${page?.pageType || 'no response'})`);
      return [];
    }

    const $ = cheerioLib.load(page.html);
    const productLinks = this.extractProductLinks($, retailer);

    if (productLinks.length === 0) {
      console.log(`[CategoryDiscovery] No product links found on ${retailer} ${categoryUrl}`);
      return [];
    }

    console.log(`[CategoryDiscovery] Found ${productLinks.length} potential product links on ${retailer}`);

    const discovered = [];

    for (const link of productLinks) {
      if (discovered.length >= MAX_NEW_PRODUCTS_PER_RUN) break;

      try {
        const result = await this.processProductLink(retailer, link);
        if (result) {
          discovered.push(result);
        }
      } catch (error) {
        console.warn(`[CategoryDiscovery] Error processing link ${link.url}: ${error.message}`);
      }
    }

    return discovered;
  }

  /**
   * Extract product links from a category page HTML based on retailer-specific selectors.
   *
   * @param {CheerioStatic} $
   * @param {string} retailer
   * @returns {Array<{ url: string, title: string }>}
   */
  extractProductLinks($, retailer) {
    const links = [];
    const seenUrls = new Set();

    // Generic product link selectors that work across most retailers
    const linkSelectors = [
      // Amazon search results
      'a.a-link-normal.s-no-outline[href*="/dp/"]',
      'a.a-link-normal[href*="/dp/"]',
      'h2 a.a-link-normal[href*="/dp/"]',
      // Generic product link patterns
      'a[href*="/dp/"]',
      'a[href*="/product/"]',
      'a[href*="/gp/product/"]',
      'a[href*="/ip/"]',
      'a[href*="/p/"]',
      'a[data-testid*="product-title"]',
      'a[class*="product-title"]',
      'a[class*="product-title-link"]',
      // Best Buy specific
      'a[href*="/site/"]',
      // GameStop specific
      'a[class*="product-tile"]',
      'a[class*="ProductCard"]'
    ];

    // First pass: try specific selectors
    for (const selector of linkSelectors) {
      $(selector).each((i, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim() || $(el).attr('title') || '';
        if (href && title) {
          const absoluteUrl = this.resolveUrl(href, retailer);
          if (absoluteUrl && !seenUrls.has(absoluteUrl) && this.productUrlMatchesRetailer(absoluteUrl, retailer)) {
            seenUrls.add(absoluteUrl);
            links.push({ url: absoluteUrl, title });
          }
        }
      });
    }

    // Second pass: look for any anchor that might be a product link
    // Only if we found very few links above
    if (links.length < 3) {
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href');
        const title = $(el).text().trim() || $(el).attr('title') || '';
        if (!href || !title) return;

        const absoluteUrl = this.resolveUrl(href, retailer);
        if (!absoluteUrl || seenUrls.has(absoluteUrl)) return;
        if (!this.productUrlMatchesRetailer(absoluteUrl, retailer)) return;

        // Only accept if it looks like a product URL
        if (this.looksLikeProductUrl(absoluteUrl, retailer)) {
          seenUrls.add(absoluteUrl);
          links.push({ url: absoluteUrl, title });
        }
      });
    }

    return links;
  }

  /**
   * Process a single product link: check for duplicates, create TrackedProduct.
   *
   * @param {string} retailer
   * @param {{ url: string, title: string }} link
   * @returns {{ retailer: string, title: string, url: string, reason: string, timestamp: Date }|null}
   */
  async processProductLink(retailer, link) {
    const normalizedUrl = RetailerDetector.normalizeUrl(link.url, retailer);

    // Check if product already exists (deduplication)
    const existing = await TrackedProduct.findOne({ url: normalizedUrl });
    if (existing) {
      return null;
    }

    // Detect category to filter by high-priority categories
    const category = CategoryDetector.detectCategory(link.title, normalizedUrl);
    if (!PRIORITY_CATEGORIES.includes(category)) {
      return null;
    }

    if (this.isDryRun) {
      console.log(`[CategoryDiscovery] [DRY-RUN] Would create: [${retailer}] ${link.title} — ${normalizedUrl}`);
      return {
        retailer,
        title: link.title,
        url: normalizedUrl,
        reason: `Discovered from ${retailer} category page; category=${category}`,
        timestamp: new Date()
      };
    }

    // Create new TrackedProduct with source="auto"
    try {
      const newProduct = new TrackedProduct({
        url: normalizedUrl,
        title: link.title || 'Unknown Product',
        source: 'auto',
        retailer,
        category,
        trackingType: 'restock',  // ProductMonitor will upgrade to preorder if appropriate
        isActive: true,
        checkInterval: 60,         // minutes — check hourly for newly discovered products
        availability: 'Unknown',
        isAvailable: false,
        nextCheck: new Date(Date.now() + 5 * 60 * 1000)  // First check soon
      });

      await newProduct.save();

      const discovery = {
        retailer,
        title: link.title,
        url: normalizedUrl,
        reason: `Discovered from ${retailer} category page; category=${category}`,
        timestamp: new Date()
      };

      console.log(`[CategoryDiscovery] ✅ New product created: [${retailer}] ${link.title}`);
      return discovery;
    } catch (error) {
      // Handle duplicate key errors gracefully (race condition between check and create)
      if (error.code === 11000) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Resolve a potentially relative URL to an absolute URL.
   */
  resolveUrl(href, retailer) {
    if (!href) return null;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      return href;
    }

    const baseDomains = {
      [RETAILER_TYPES.AMAZON]: 'https://www.amazon.com',
      [RETAILER_TYPES.WALMART]: 'https://www.walmart.com',
      [RETAILER_TYPES.TARGET]: 'https://www.target.com',
      [RETAILER_TYPES.BESTBUY]: 'https://www.bestbuy.com',
      [RETAILER_TYPES.GAMESTOP]: 'https://www.gamestop.com',
      [RETAILER_TYPES.POKEMONCENTER]: 'https://www.pokemoncenter.com'
    };

    const base = baseDomains[retailer];
    if (!base) return null;

    return href.startsWith('/') ? `${base}${href}` : `${base}/${href}`;
  }

  /**
   * Verify the URL belongs to the expected retailer domain.
   */
  productUrlMatchesRetailer(url, retailer) {
    try {
      const parsed = new URL(url);
      const detected = RetailerDetector.detectRetailer(url);
      return detected === retailer;
    } catch {
      return false;
    }
  }

  /**
   * Check if a URL looks like a product page URL for a given retailer.
   */
  looksLikeProductUrl(url, retailer) {
    // Retailer-specific product URL patterns
    const patterns = {
      [RETAILER_TYPES.AMAZON]: /\/dp\/[A-Z0-9]{10}/i,
      [RETAILER_TYPES.WALMART]: /\/ip\//i,
      [RETAILER_TYPES.TARGET]: /\/p\//i,
      [RETAILER_TYPES.BESTBUY]: /\/site\//i,
      [RETAILER_TYPES.GAMESTOP]: /\/products\//i
    };

    const pattern = patterns[retailer];
    return pattern ? pattern.test(url) : false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { CategoryDiscovery, PRIORITY_CATEGORIES, SEED_CATEGORY_URLS };