const { RetailerDetector, RETAILER_TYPES } = require('./RetailerDetector');
const { TrackedProduct } = require('../models/TrackedProduct');
const { DiscoverySource } = require('../models/DiscoverySource');
const { CategoryDetector } = require('./CategoryDetector');
const { OwnerIntelligence } = require('./OwnerIntelligence');

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
 * Publisher hubs for PART 6 — Publisher Discovery.
 * These are root pages for publisher content that may lead to product pages.
 */
const PUBLISHER_HUBS = {
  'nintendo': 'https://www.nintendo.com/us/games/',
  'playstation': 'https://www.playstation.com/en-us/ps5/games/',
  'xbox': 'https://www.xbox.com/en-US/games/all-games',
  'pokemon': 'https://www.pokemon.com/us/pokemon-tcg',
  'bandai': 'https://www.bandai.com/',
  'lorcana': 'https://www.disneylorcana.com/en-US/cards',
  'one_piece': 'https://onepiece-cardgame.com/en/cards',
  'hasbro': 'https://shop.hasbro.com/en-us',
  'mattel': 'https://shop.mattel.com/',
  'funko': 'https://www.funko.com/shop',
  'lego': 'https://www.lego.com/en-us/themes'
};

/**
 * Maximum number of category pages to visit per retailer per discovery run.
 */
const MAX_PAGES_PER_RETAILER = 3;

/**
 * Maximum number of new products to create per discovery run (rate control).
 */
const MAX_NEW_PRODUCTS_PER_RUN = 25;

/**
 * Maximum number of new sources to discover per run.
 */
const MAX_NEW_SOURCES_PER_RUN = 10;

/**
 * Maximum number of publisher pages to check per run.
 */
const MAX_PUBLISHER_PAGES_PER_RUN = 5;

/**
 * Analytics collection name for PART 8.
 */
const ANALYTICS_COLLECTION = 'discovery_analytics';

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
            crawlPriority: 100,
            crawlWeight: 1.0,
            enabled: true,
            baseCooldownMinutes: 30,
            currentCooldownMinutes: 30
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
   * Calculate a dynamic priority score for a DiscoverySource.
   * Used for sorting crawl order — higher score = crawled earlier.
   *
   * Delegates to the model's static method for consistency.
   */
  static calculateSourceScore(source) {
    return DiscoverySource.calculateDynamicPriority(source);
  }

  /**
   * Get enabled discovery sources sorted by dynamic priority,
   * respecting crawl budget (cooldowns, failure streaks, etc.).
   *
   * Returns the same structure as the legacy CATEGORY_URLS constant:
   *   { retailer1: [url1, url2, ...], retailer2: [...] }
   */
  static async getDiscoveryUrls() {
    const now = new Date();

    // Get all enabled sources that are not in cooldown
    const sources = await DiscoverySource.find({
      enabled: true,
      $or: [
        { cooldownUntil: null },
        { cooldownUntil: { $lte: now } }
      ]
    }).lean();

    // Score each source, sort by highest score first
    sources.forEach(s => {
      s._discoveryScore = DiscoverySource.calculateDynamicPriority(s);
    });
    sources.sort((a, b) => b._discoveryScore - a._discoveryScore);

    // Apply crawl budget: limit to top N sources per run
    const CRAWL_BUDGET = 20;
    const budgeted = sources.slice(0, CRAWL_BUDGET);

    const grouped = {};
    for (const source of budgeted) {
      if (!grouped[source.retailer]) {
        grouped[source.retailer] = [];
      }
      grouped[source.retailer].push(source.url);
    }

    return grouped;
  }

  /**
   * Get all enabled sources with full metadata for admin dashboard.
   */
  static async getAllSources() {
    return await DiscoverySource.find({ enabled: true })
      .sort({ crawlPriority: -1, lastCrawledAt: -1 })
      .lean();
  }

  /**
   * Get disabled sources for admin dashboard.
   */
  static async getDisabledSources() {
    return await DiscoverySource.find({ enabled: false })
      .sort({ disabledAt: -1 })
      .lean();
  }

  /**
   * Manually re-enable a disabled source.
   */
  static async reEnableSource(sourceId) {
    return await DiscoverySource.findByIdAndUpdate(sourceId, {
      $set: {
        enabled: true,
        autoDisabled: false,
        disabledReason: null,
        disabledAt: null,
        manuallyReEnabledAt: new Date(),
        consecutiveFailures: 0,
        cooldownUntil: null,
        currentCooldownMinutes: 30
      }
    }, { new: true });
  }

  /**
   * Manually disable a source.
   */
  static async disableSource(sourceId, reason) {
    return await DiscoverySource.findByIdAndUpdate(sourceId, {
      $set: {
        enabled: false,
        disabledReason: reason || 'Manually disabled',
        disabledAt: new Date()
      }
    }, { new: true });
  }

  /**
   * Manually update source priority.
   */
  static async updateSourcePriority(sourceId, priority) {
    const clamped = Math.max(0, Math.min(1000, priority));
    return await DiscoverySource.findByIdAndUpdate(sourceId, {
      $set: { crawlPriority: clamped, priority: clamped }
    }, { new: true });
  }

  /**
   * Record a successful crawl on a discovery source.
   * Updates health metrics and adjusts cooldown.
   */
  static async recordSuccessfulCrawl(url, responseTimeMs, productsFound) {
    const source = await DiscoverySource.findOne({ url });
    if (!source) return;

    const update = {
      $set: {
        lastCrawledAt: new Date(),
        lastSuccessfulCrawl: new Date(),
        consecutiveFailures: 0,
        lastHttpStatus: 200
      },
      $inc: {
        successfulCrawls: 1,
        crawlCount: 1,
        totalResponseTime: responseTimeMs || 0
      }
    };

    if (productsFound > 0) {
      update.$set.lastProductFoundAt = new Date();
      update.$inc.totalProductsFound = productsFound;
    }

    // Update average response time
    const newCrawlCount = (source.crawlCount || 0) + 1;
    const totalTime = (source.totalResponseTime || 0) + (responseTimeMs || 0);
    update.$set.averageResponseTime = newCrawlCount > 0 ? Math.round(totalTime / newCrawlCount) : 0;

    // Update average products per crawl
    const newTotalProducts = (source.totalProductsFound || 0) + productsFound;
    update.$set.averageProductsPerCrawl = newCrawlCount > 0
      ? Math.round((newTotalProducts / newCrawlCount) * 100) / 100
      : 0;

    // Calculate and set adaptive cooldown
    const updatedSource = { ...source.toObject(), ...update.$set };
    // Merge the $inc values for calculation
    updatedSource.successfulCrawls = (source.successfulCrawls || 0) + 1;
    updatedSource.crawlCount = newCrawlCount;
    updatedSource.totalResponseTime = totalTime;
    updatedSource.totalProductsFound = newTotalProducts;

    const cooldownMs = DiscoverySource.calculateCooldownMs(updatedSource);
    update.$set.cooldownUntil = new Date(Date.now() + cooldownMs);
    update.$set.currentCooldownMinutes = Math.round(cooldownMs / 60000);

    // Update dynamic priority
    const newScore = DiscoverySource.calculateDynamicPriority(updatedSource);
    update.$set.crawlPriority = Math.min(1000, newScore);

    await DiscoverySource.updateOne({ url }, update);
  }

  /**
   * Record a failed crawl on a discovery source.
   * Implements PART 5 — Auto-disable logic.
   */
  static async recordFailedCrawl(url, httpStatus, errorMessage) {
    const source = await DiscoverySource.findOne({ url });
    if (!source) return;

    const newConsecutiveFailures = (source.consecutiveFailures || 0) + 1;
    const update = {
      $set: {
        lastCrawledAt: new Date(),
        consecutiveFailures: newConsecutiveFailures,
        lastHttpStatus: httpStatus || null,
        lastErrorMessage: errorMessage || null
      },
      $inc: {
        failedCrawls: 1,
        crawlCount: 1
      }
    };

    // Auto-disable logic
    let shouldDisable = false;
    let disableReason = null;

    // 404 repeatedly
    if (httpStatus === 404 && newConsecutiveFailures >= 3) {
      shouldDisable = true;
      disableReason = 'Page not found (404) after 3 attempts';
    }

    // Blocked repeatedly
    if ((httpStatus === 403 || httpStatus === 429) && newConsecutiveFailures >= 3) {
      shouldDisable = true;
      disableReason = httpStatus === 403 ? 'Access blocked (403) after 3 attempts' : 'Rate limited (429) after 3 attempts';
    }

    // No products after many crawls
    if (newConsecutiveFailures >= 10 && (source.totalProductsFound || 0) === 0) {
      shouldDisable = true;
      disableReason = 'No products found after 10 failed crawls';
    }

    // Permanent redirect
    if (httpStatus >= 300 && httpStatus < 400 && newConsecutiveFailures >= 3) {
      shouldDisable = true;
      disableReason = `Permanent redirect (${httpStatus}) after 3 attempts`;
    }

    // General failure threshold
    if (newConsecutiveFailures >= 15) {
      shouldDisable = true;
      disableReason = `Exceeded maximum consecutive failures (${newConsecutiveFailures})`;
    }

    if (shouldDisable) {
      update.$set.enabled = false;
      update.$set.autoDisabled = true;
      update.$set.disabledReason = disableReason;
      update.$set.disabledAt = new Date();
      console.log(`[CategoryDiscovery] 🚫 Auto-disabled source: ${url} — ${disableReason}`);
    } else {
      // Set longer cooldown on failure
      const cooldownMs = DiscoverySource.calculateCooldownMs({
        ...source.toObject(),
        consecutiveFailures: newConsecutiveFailures
      });
      update.$set.cooldownUntil = new Date(Date.now() + cooldownMs);
      update.$set.currentCooldownMinutes = Math.round(cooldownMs / 60000);
    }

    // Update dynamic priority (will decrease due to failures)
    const updatedSource = {
      ...source.toObject(),
      ...update.$set,
      failedCrawls: (source.failedCrawls || 0) + 1,
      crawlCount: (source.crawlCount || 0) + 1
    };
    const newScore = DiscoverySource.calculateDynamicPriority(updatedSource);
    update.$set.crawlPriority = Math.min(1000, newScore);

    await DiscoverySource.updateOne({ url }, update);
  }

  /**
   * Record a product creation from a discovery source.
   */
  static async recordProductCreated(url) {
    await DiscoverySource.updateOne({ url }, {
      $inc: { totalProductsCreated: 1 }
    });
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
      /\/trading-cards\//i,                  // TCG landing
      /\/collection\//i,                     // Collection pages
      /\/shop\//i                            // Shop pages
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
      if (newSourceCount >= MAX_NEW_SOURCES_PER_RUN) break;

      const existingRetailerCount = existingSources.filter(u => {
        try { return RetailerDetector.detectRetailer(u) === retailer; } catch { return false; }
      }).length;

      // Only discover if retailer has fewer than 20 sources — enough coverage
      if (existingRetailerCount >= 20) {
        console.log(`[CategoryDiscovery] ${retailer} already has ${existingRetailerCount} sources, skipping`);
        continue;
      }

      for (let page = 0; page < MAX_ROOT_PAGES; page++) {
        if (newSourceCount >= MAX_NEW_SOURCES_PER_RUN) break;

        const fetchUrl = page === 0 ? rootUrl : `${rootUrl}/s?k=pokemon`;
        const config = RetailerDetector.getRetailerConfig(retailer);

        try {
          const cheerioLib = getCheerio();
          if (!cheerioLib) continue;

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
            if (newSourceCount >= MAX_NEW_SOURCES_PER_RUN) break;
            if (existingSources.includes(candidateUrl)) continue;

            try {
              await DiscoverySource.create({
                url: candidateUrl,
                retailer,
                sourceType: 'category',
                priority: 200,
                crawlPriority: 200,
                crawlWeight: 1.0,
                enabled: true,
                baseCooldownMinutes: 30,
                currentCooldownMinutes: 30
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
    return newSourceCount;
  }

  /**
   * PART 6 — Publisher Discovery.
   * Discover product pages from publisher hubs.
   * Only discovers pages that lead to products, never hardcodes product URLs.
   */
  static async discoverPublisherSources() {
    let newSourceCount = 0;
    const existingSources = await DiscoverySource.distinct('url');

    console.log('[CategoryDiscovery] Starting publisher discovery...');

    for (const [publisher, hubUrl] of Object.entries(PUBLISHER_HUBS)) {
      if (newSourceCount >= MAX_PUBLISHER_PAGES_PER_RUN) break;

      // Check if we already have sources for this publisher
      const existingPublisherCount = await DiscoverySource.countDocuments({
        publisherName: publisher,
        enabled: true
      });

      // Limit to 5 sources per publisher
      if (existingPublisherCount >= 5) {
        console.log(`[CategoryDiscovery] Publisher ${publisher} already has ${existingPublisherCount} sources, skipping`);
        continue;
      }

      try {
        const axios = require('axios');
        const response = await axios.get(hubUrl, {
          timeout: 15000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        });

        if (response.status !== 200 || !response.data) continue;

        const cheerioLib = getCheerio();
        if (!cheerioLib) continue;

        const $ = cheerioLib.load(response.data);
        const candidateUrls = new Set();

        // Extract links that look like they lead to product/category pages
        $('a[href]').each((i, el) => {
          const href = $(el).attr('href');
          if (!href) return;

          const fullUrl = href.startsWith('http')
            ? href
            : `${hubUrl}${href.startsWith('/') ? href : '/' + href}`;

          try {
            const canonicalUrl = CategoryDiscovery.canonicalizeDiscoveryUrl(fullUrl);

            // Skip if already known
            if (existingSources.includes(canonicalUrl)) return;

            // Must look like a discovery/category page, not a product page
            const isCategory = /\/games\//i.test(canonicalUrl) ||
              /\/category\//i.test(canonicalUrl) ||
              /\/collection\//i.test(canonicalUrl) ||
              /\/shop\//i.test(canonicalUrl) ||
              /\/browse\//i.test(canonicalUrl) ||
              /\/tcg\//i.test(canonicalUrl) ||
              /\/cards\//i.test(canonicalUrl) ||
              /\/themes\//i.test(canonicalUrl) ||
              /\/products\//i.test(canonicalUrl);

            // Skip product pages
            const isProduct = /\/product\/[^/]+\/[A-Z0-9]+/i.test(canonicalUrl) ||
              /\/dp\//i.test(canonicalUrl);

            if (isCategory && !isProduct) {
              candidateUrls.add(canonicalUrl);
            }
          } catch {
            // Invalid URL — skip
          }
        });

        for (const candidateUrl of candidateUrls) {
          if (newSourceCount >= MAX_PUBLISHER_PAGES_PER_RUN) break;
          if (existingSources.includes(candidateUrl)) continue;

          try {
            await DiscoverySource.create({
              url: candidateUrl,
              retailer: RETAILER_TYPES.OTHER,
              sourceType: 'publisher',
              priority: 150,
              crawlPriority: 150,
              crawlWeight: 1.0,
              enabled: true,
              publisherName: publisher,
              publisherHub: hubUrl,
              baseCooldownMinutes: 60,
              currentCooldownMinutes: 60
            });
            existingSources.push(candidateUrl);
            newSourceCount++;
            console.log(`[CategoryDiscovery] ✅ New publisher source: [${publisher}] ${candidateUrl}`);
          } catch (err) {
            if (err.code !== 11000) {
              console.warn(`[CategoryDiscovery] Failed to save publisher source ${candidateUrl}:`, err.message);
            }
          }
        }
      } catch (error) {
        console.warn(`[CategoryDiscovery] Publisher discovery failed for ${publisher}:`, error.message);
      }

      // Polite delay between publisher hub fetches
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(`[CategoryDiscovery] Publisher discovery complete: ${newSourceCount} new sources`);
    return newSourceCount;
  }

  /**
   * PART 7 — Sitemap Discovery.
   * If a retailer sitemap exists, parse it and extract discovery pages.
   * Ignores product URLs, feeds discovered pages into DiscoverySource.
   */
  static async discoverFromSitemaps() {
    const sitemapUrls = {
      [RETAILER_TYPES.AMAZON]: 'https://www.amazon.com/sitemap_index.xml',
      [RETAILER_TYPES.WALMART]: 'https://www.walmart.com/sitemap_index.xml',
      [RETAILER_TYPES.TARGET]: 'https://www.target.com/sitemap_index.xml',
      [RETAILER_TYPES.BESTBUY]: 'https://www.bestbuy.com/sitemap_index.xml',
      [RETAILER_TYPES.GAMESTOP]: 'https://www.gamestop.com/sitemap_index.xml'
    };

    let newSourceCount = 0;
    const existingSources = await DiscoverySource.distinct('url');

    console.log('[CategoryDiscovery] Starting sitemap discovery...');

    for (const [retailer, sitemapUrl] of Object.entries(sitemapUrls)) {
      if (newSourceCount >= MAX_NEW_SOURCES_PER_RUN) break;

      try {
        const axios = require('axios');
        const response = await axios.get(sitemapUrl, {
          timeout: 20000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/xml, text/xml, */*'
          },
          // Don't throw on non-200 — sitemaps may not exist
          validateStatus: status => status < 500
        });

        if (response.status !== 200 || !response.data) {
          console.log(`[CategoryDiscovery] No sitemap found for ${retailer} (status ${response.status})`);
          continue;
        }

        const cheerioLib = getCheerio();
        if (!cheerioLib) continue;

        const $ = cheerioLib.load(response.data, { xmlMode: true });

        // Extract all <loc> elements from the sitemap
        const urls = [];
        $('loc').each((i, el) => {
          const loc = $(el).text().trim();
          if (loc) urls.push(loc);
        });

        // Also check for sitemap index (nested sitemaps)
        const sitemapLocs = [];
        $('sitemap loc').each((i, el) => {
          const loc = $(el).text().trim();
          if (loc) sitemapLocs.push(loc);
        });

        console.log(`[CategoryDiscovery] Sitemap for ${retailer}: ${urls.length} URLs, ${sitemapLocs.length} sub-sitemaps`);

        // Filter URLs to find discovery pages (not product pages)
        const discoveryUrls = urls.filter(url => {
          // Must belong to the same retailer
          if (RetailerDetector.detectRetailer(url) !== retailer) return false;

          // Must look like a discovery/category/search page
          const isDiscovery = /\/s\?/i.test(url) ||
            /\/browse\//i.test(url) ||
            /\/c\//i.test(url) ||
            /\/site\//i.test(url) ||
            /\/category\//i.test(url) ||
            /\/collection\//i.test(url) ||
            /\/search\//i.test(url) ||
            /\/deals\//i.test(url) ||
            /\/new-releases\//i.test(url) ||
            /\/preorder/i.test(url) ||
            /\/coming-soon/i.test(url) ||
            /\/tcg\//i.test(url) ||
            /\/collectibles\//i.test(url) ||
            /\/video-games\//i.test(url) ||
            /\/toys\//i.test(url) ||
            /\/trading-cards\//i.test(url) ||
            /\/landing-page\//i.test(url);

          // Must NOT be a product page
          const isProduct = /\/dp\/[A-Z0-9]{10}/i.test(url) ||
            /\/gp\/product\//i.test(url) ||
            /\/product\//i.test(url) ||
            /\/products\/[^/]+\/\d+/i.test(url) ||
            /\/ip\/[^/]+\/\d+/i.test(url) ||
            /\/p\//i.test(url);

          return isDiscovery && !isProduct;
        });

        // Save discovered URLs
        for (const discoveryUrl of discoveryUrls) {
          if (newSourceCount >= MAX_NEW_SOURCES_PER_RUN) break;
          if (existingSources.includes(discoveryUrl)) continue;

          const canonicalUrl = CategoryDiscovery.canonicalizeDiscoveryUrl(discoveryUrl);

          try {
            await DiscoverySource.create({
              url: canonicalUrl,
              retailer,
              sourceType: 'sitemap',
              priority: 150,
              crawlPriority: 150,
              crawlWeight: 1.0,
              enabled: true,
              lastSitemapParse: new Date(),
              baseCooldownMinutes: 45,
              currentCooldownMinutes: 45
            });
            existingSources.push(canonicalUrl);
            newSourceCount++;
            console.log(`[CategoryDiscovery] ✅ New sitemap source: [${retailer}] ${canonicalUrl}`);
          } catch (err) {
            if (err.code !== 11000) {
              console.warn(`[CategoryDiscovery] Failed to save sitemap source ${canonicalUrl}:`, err.message);
            }
          }
        }

        // Update sitemap metadata on existing sources
        if (discoveryUrls.length > 0) {
          await DiscoverySource.updateMany(
            { retailer, sourceType: 'sitemap' },
            { $set: { lastSitemapParse: new Date(), sitemapUrlsFound: discoveryUrls.length } }
          );
        }
      } catch (error) {
        console.warn(`[CategoryDiscovery] Sitemap discovery failed for ${retailer}:`, error.message);
      }

      // Polite delay between sitemap fetches
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`[CategoryDiscovery] Sitemap discovery complete: ${newSourceCount} new sources`);
    return newSourceCount;
  }

  /**
   * PART 8 — Record lightweight discovery analytics.
   */
  static async recordAnalytics(metrics) {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return;

      const collection = db.collection(ANALYTICS_COLLECTION);
      await collection.insertOne({
        ...metrics,
        timestamp: new Date()
      });

      // Keep only last 1000 analytics records to prevent history explosion
      const count = await collection.countDocuments();
      if (count > 1000) {
        const oldest = await collection.find()
          .sort({ timestamp: 1 })
          .limit(count - 1000)
          .toArray();
        if (oldest.length > 0) {
          await collection.deleteMany({
            _id: { $in: oldest.map(o => o._id) }
          });
        }
      }
    } catch (error) {
      // Analytics failures are non-fatal
      console.warn('[CategoryDiscovery] Failed to record analytics:', error.message);
    }
  }

  /**
   * Get discovery analytics summary.
   */
  static async getAnalyticsSummary(days = 7) {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return null;

      const collection = db.collection(ANALYTICS_COLLECTION);
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const pipeline = [
        { $match: { timestamp: { $gte: since } } },
        {
          $group: {
            _id: null,
            totalRuns: { $sum: 1 },
            totalProductsDiscovered: { $sum: '$productsDiscovered' },
            totalNewSources: { $sum: '$newSources' },
            totalPublisherSources: { $sum: '$publisherSources' },
            totalSitemapSources: { $sum: '$sitemapSources' },
            avgDuration: { $avg: '$durationMs' },
            avgSuccessRate: { $avg: '$successRate' },
            maxProductsInRun: { $max: '$productsDiscovered' }
          }
        }
      ];

      const results = await collection.aggregate(pipeline).toArray();
      return results[0] || null;
    } catch (error) {
      console.warn('[CategoryDiscovery] Failed to get analytics:', error.message);
      return null;
    }
  }

  /**
   * Get source health summary for dashboard.
   */
  static async getSourceHealthSummary() {
    try {
      const total = await DiscoverySource.countDocuments();
      const enabled = await DiscoverySource.countDocuments({ enabled: true });
      const disabled = await DiscoverySource.countDocuments({ enabled: false });
      const autoDisabled = await DiscoverySource.countDocuments({ autoDisabled: true });
      const productive = await DiscoverySource.countDocuments({
        enabled: true,
        totalProductsFound: { $gt: 0 }
      });
      const dead = await DiscoverySource.countDocuments({
        enabled: true,
        consecutiveFailures: { $gte: 5 }
      });
      const inCooldown = await DiscoverySource.countDocuments({
        enabled: true,
        cooldownUntil: { $gt: new Date() }
      });

      // Retailer breakdown
      const retailerBreakdown = await DiscoverySource.aggregate([
        { $group: { _id: '$retailer', count: { $sum: 1 }, enabled: { $sum: { $cond: ['$enabled', 1, 0] } } } },
        { $sort: { count: -1 } }
      ]);

      // Source type breakdown
      const typeBreakdown = await DiscoverySource.aggregate([
        { $group: { _id: '$sourceType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]);

      return {
        total,
        enabled,
        disabled,
        autoDisabled,
        productive,
        dead,
        inCooldown,
        retailerBreakdown,
        typeBreakdown
      };
    } catch (error) {
      console.warn('[CategoryDiscovery] Failed to get source health:', error.message);
      return null;
    }
  }

  /**
   * Run a discovery cycle across all supported retailers.
   * Called from MonitoringWorker.runMonitoringCycle().
   *
   * @returns {Array<{ retailer: string, title: string, url: string, reason: string, timestamp: Date }>}
   */
  async discoverProducts() {
    const startTime = Date.now();
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

        // Crawl cooldown: skip if this source was crawled within the cooldown period
        const sourceRecord = await DiscoverySource.findOne({ url: categoryUrl, enabled: true }).lean();
        if (sourceRecord && sourceRecord.cooldownUntil) {
          const cooldownTime = new Date(sourceRecord.cooldownUntil).getTime();
          if (Date.now() < cooldownTime) {
            const remainingMin = Math.round((cooldownTime - Date.now()) / 60000);
            console.log(`[CategoryDiscovery] Skipping ${categoryUrl} — cooldown ${remainingMin}m remaining`);
            continue;
          }
        }

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
    let newSources = 0;
    try {
      newSources = await CategoryDiscovery.discoverNewSources();
    } catch (sourceError) {
      console.warn('[CategoryDiscovery] Source discovery error (non-fatal):', sourceError.message);
    }

    // Phase 3: Publisher Discovery
    let publisherSources = 0;
    try {
      publisherSources = await CategoryDiscovery.discoverPublisherSources();
    } catch (publisherError) {
      console.warn('[CategoryDiscovery] Publisher discovery error (non-fatal):', publisherError.message);
    }

    // Phase 4: Sitemap Discovery (runs less frequently — once per hour)
    let sitemapSources = 0;
    try {
      const lastSitemapRun = await CategoryDiscovery.getLastSitemapRun();
      const hoursSinceSitemap = lastSitemapRun
        ? (Date.now() - lastSitemapRun.getTime()) / (60 * 60 * 1000)
        : 999;
      if (hoursSinceSitemap >= 1) {
        sitemapSources = await CategoryDiscovery.discoverFromSitemaps();
      }
    } catch (sitemapError) {
      console.warn('[CategoryDiscovery] Sitemap discovery error (non-fatal):', sitemapError.message);
    }

    // Phase 5: Owner Intelligence — process discoveries for learning
    try {
      // Group discoveries by source URL and retailer for Owner Intelligence processing
      const discoveriesBySource = {};
      for (const d of discoveries) {
        const key = d._sourceUrl || 'unknown';
        if (!discoveriesBySource[key]) {
          discoveriesBySource[key] = { retailer: d.retailer, products: [] };
        }
        discoveriesBySource[key].products.push(d);
      }

      for (const [sourceUrl, group] of Object.entries(discoveriesBySource)) {
        await OwnerIntelligence.processDiscoveries(
          group.products,
          sourceUrl,
          group.retailer
        );
      }
    } catch (oiError) {
      console.warn('[CategoryDiscovery] Owner Intelligence processing error (non-fatal):', oiError.message);
    }

    // Phase 6: Record analytics
    const durationMs = Date.now() - startTime;
    try {
      await CategoryDiscovery.recordAnalytics({
        productsDiscovered: discoveries.length,
        newSources,
        publisherSources,
        sitemapSources,
        durationMs,
        successRate: discoveries.length > 0 ? 1.0 : 0,
        retailersScanned: retailerKeys.length
      });
    } catch (analyticsError) {
      console.warn('[CategoryDiscovery] Analytics recording error (non-fatal):', analyticsError.message);
    }

    return discoveries;
  }

  /**
   * Get the timestamp of the last sitemap run.
   */
  static async getLastSitemapRun() {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return null;

      const collection = db.collection(ANALYTICS_COLLECTION);
      const last = await collection.findOne(
        { sitemapSources: { $gt: 0 } },
        { sort: { timestamp: -1 } }
      );
      return last ? last.timestamp : null;
    } catch {
      return null;
    }
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
    const fetchStartTime = Date.now();
    const page = await this.productMonitor.fetchHtmlWithRetry(categoryUrl, config);
    const responseTimeMs = Date.now() - fetchStartTime;

    if (!page || page.pageType === 'blocked' || page.pageType === 'bot_interstitial' || !page.html) {
      console.warn(`[CategoryDiscovery] Could not fetch category page: ${retailer} ${categoryUrl} (${page?.pageType || 'no response'})`);

      // Determine HTTP status from page response
      const httpStatus = page?.statusCode || (page?.pageType === 'blocked' ? 403 : 0);

      // Record failed crawl with auto-disable logic
      await CategoryDiscovery.recordFailedCrawl(
        categoryUrl,
        httpStatus,
        page?.pageType || 'No response'
      );
      return [];
    }

    // Record successful crawl with health metrics
    const $ = cheerioLib.load(page.html);
    const productLinks = this.extractProductLinks($, retailer);
    await CategoryDiscovery.recordSuccessfulCrawl(categoryUrl, responseTimeMs, productLinks.length);

    if (productLinks.length === 0) {
      console.log(`[CategoryDiscovery] No product links found on ${retailer} ${categoryUrl}`);
      return [];
    }

    console.log(`[CategoryDiscovery] Found ${productLinks.length} potential product links on ${retailer}`);

    const discovered = [];

    for (const link of productLinks) {
      if (discovered.length >= MAX_NEW_PRODUCTS_PER_RUN) break;

      try {
        const result = await this.processProductLink(retailer, link, categoryUrl);
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
  async processProductLink(retailer, link, originatingSourceUrl = null) {
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
        timestamp: new Date(),
        _sourceUrl: originatingSourceUrl
      };

      // Track product yield on the originating discovery source
      if (originatingSourceUrl) {
        await CategoryDiscovery.recordProductCreated(originatingSourceUrl);
      }

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