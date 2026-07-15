const { RetailerDetector, RETAILER_TYPES } = require('./RetailerDetector');
const { TrackedProduct } = require('../models/TrackedProduct');
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
 * Retailer category page URLs for product discovery.
 * These are the "landing" or "browse" pages that list products
 * in high-value categories like trading cards, collectibles, gaming, etc.
 *
 * Includes preorder-focused, collector-edition, and limited-release pages
 * so that CategoryDiscovery finds products that ProductMonitor can later
 * upgrade to preorder trackingType.
 */
const CATEGORY_URLS = {
  [RETAILER_TYPES.AMAZON]: [
    // Trading cards & collectibles (existing)
    'https://www.amazon.com/s?k=pokemon+trading+cards&i=toys-and-games&rh=n%3A165795011',
    'https://www.amazon.com/s?k=one+piece+trading+card+game&i=toys-and-games',
    'https://www.amazon.com/s?k=sports+trading+cards&i=toys-and-games&rh=n%3A166331011',
    'https://www.amazon.com/s?k=collectible+action+figures&i=toys-and-games',
    'https://www.amazon.com/s?k=lego+sets&i=toys-and-games',
    'https://www.amazon.com/s?k=magic+the+gathering&i=toys-and-games',
    'https://www.amazon.com/s?k=yu+gi+oh+trading+cards&i=toys-and-games',
    // Gaming (existing)
    'https://www.amazon.com/s?k=nintendo+switch+games&i=videogames',
    'https://www.amazon.com/s?k=playstation+5+games&i=videogames',
    'https://www.amazon.com/s?k=xbox+series+x+games&i=videogames',
    // Preorder & collector edition pages (new)
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
    // Existing
    'https://www.walmart.com/browse/toys/pokemon-trading-cards/4171_1227809_1229591',
    'https://www.walmart.com/browse/video-games/nintendo-switch-games/2636_7050607',
    'https://www.walmart.com/browse/video-games/playstation-5-games/2636_4938110',
    'https://www.walmart.com/browse/video-games/xbox-series-x-games/2636_7049956',
    'https://www.walmart.com/browse/toys/collectibles/4171_1227812',
    'https://www.walmart.com/browse/toys/action-figures/4171_1227809_1228046'
  ],
  [RETAILER_TYPES.TARGET]: [
    // Existing
    'https://www.target.com/c/pokemon-trading-cards/-/N-5xtcp',
    'https://www.target.com/c/nintendo-switch-games/-/N-5xsg0',
    'https://www.target.com/c/playstation-5-games/-/N-5xsg1',
    'https://www.target.com/c/xbox-series-x-games/-/N-5xsg2',
    'https://www.target.com/c/collectible-toys/-/N-55da6',
    'https://www.target.com/c/action-figures/-/N-55da3'
  ],
  [RETAILER_TYPES.BESTBUY]: [
    // Existing
    'https://www.bestbuy.com/site/trading-card-games/pokemon-trading-cards/pcmcat313500050014.c?id=pcmcat313500050014',
    'https://www.bestbuy.com/site/video-games/nintendo-switch/pcmcat1486574754468.c?id=pcmcat1486574754468',
    'https://www.bestbuy.com/site/video-games/playstation-5/pcmcat1582144059518.c?id=pcmcat1582144059518',
    'https://www.bestbuy.com/site/video-games/xbox-series-x/pcmcat1582144744292.c?id=pcmcat1582144744292',
    'https://www.bestbuy.com/site/toys/action-figures/abcat170100.c?id=abcat170100',
    // Preorder discovery pages (new)
    'https://www.bestbuy.com/site/electronics/pc-games/pcmcat143600050187.c?id=pcmcat143600050187'
  ],
  [RETAILER_TYPES.GAMESTOP]: [
    // Existing TCG
    'https://www.gamestop.com/tcg/pokemon',
    'https://www.gamestop.com/tcg/one-piece',
    'https://www.gamestop.com/tcg/magic',
    'https://www.gamestop.com/tcg/yu-gi-oh',
    // Existing gaming
    'https://www.gamestop.com/video-games/nintendo-switch',
    'https://www.gamestop.com/video-games/playstation-5',
    'https://www.gamestop.com/video-games/xbox-series-x',
    // Existing collectibles
    'https://www.gamestop.com/collectibles',
    'https://www.gamestop.com/toys',
    // Preorder-focused pages (new)
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
   * Run a discovery cycle across all supported retailers.
   * Called from MonitoringWorker.runMonitoringCycle().
   *
   * @returns {Array<{ retailer: string, title: string, url: string, reason: string, timestamp: Date }>}
   */
  async discoverProducts() {
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

module.exports = { CategoryDiscovery, PRIORITY_CATEGORIES, CATEGORY_URLS };