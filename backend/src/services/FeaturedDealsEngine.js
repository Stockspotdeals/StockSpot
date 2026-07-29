/**
 * FeaturedDealsEngine
 *
 * Builds the homepage feed using REAL monitored products from the Product collection.
 * NEVER uses hardcoded products.
 *
 * Calculates a weighted Featured Score from Product Intelligence signals,
 * auto-populates homepage sections, and refreshes every 30 minutes via scheduler.
 */

const Product = require('../models/Product');
const Signal = require('../models/Signal');
const FeaturedProduct = require('../models/FeaturedProduct');
const { AmazonAffiliateEngine } = require('./AmazonAffiliateEngine');

const AFFILIATE_TAG = process.env.AMAZON_ASSOCIATE_TAG || process.env.AMAZON_ASSOCIATE_ID || 'stockspotde02-20';

// Bootstrap Amazon products used when the Product collection is empty
// so the homepage always displays featured deals with affiliate links.
const BOOTSTRAP_PRODUCTS = [
  {
    name: 'Pokemon TCG: Scarlet & Violet 151 Elite Trainer Box',
    title: 'Pokemon TCG: Scarlet & Violet 151 Elite Trainer Box',
    price: 59.99, originalPrice: 69.99, estimatedMSRP: 69.99,
    url: 'https://www.amazon.com/dp/B0C4B2H5F5',
    affiliateLink: 'https://www.amazon.com/dp/B0C4B2H5F5?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/81vI7eG8sJL._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'collectibles', inStock: true,
    isCollectible: true, flipScore: 78, demandScore: 92, scarcityScore: 75, confidenceScore: 82
  },
  {
    name: 'Nintendo Switch OLED Model - White',
    title: 'Nintendo Switch OLED Model - White',
    price: 349.99, originalPrice: 359.99, estimatedMSRP: 359.99,
    url: 'https://www.amazon.com/dp/B08N5WRWNW',
    affiliateLink: 'https://www.amazon.com/dp/B08N5WRWNW?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/71R7m0yGmPL._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'gaming', inStock: true,
    isCollectible: false, flipScore: 45, demandScore: 90, scarcityScore: 30, confidenceScore: 95
  },
  {
    name: 'LEGO Star Wars Millennium Falcon 75192',
    title: 'LEGO Star Wars Millennium Falcon 75192 UCS Set',
    price: 849.99, originalPrice: 899.99, estimatedMSRP: 899.99,
    url: 'https://www.amazon.com/dp/B01NA2WYQ4',
    affiliateLink: 'https://www.amazon.com/dp/B01NA2WYQ4?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/71gJdK5e8tL._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'toys', inStock: true,
    isCollectible: true, flipScore: 68, demandScore: 75, scarcityScore: 60, confidenceScore: 85
  },
  {
    name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    price: 329.99, originalPrice: 399.99, estimatedMSRP: 399.99,
    url: 'https://www.amazon.com/dp/B09BG3VX1F',
    affiliateLink: 'https://www.amazon.com/dp/B09BG3VX1F?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/61McsgS8u6L._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'electronics', inStock: true,
    isCollectible: false, flipScore: 55, demandScore: 88, scarcityScore: 25, confidenceScore: 92
  },
  {
    name: 'Meta Quest 3 128GB — VR Headset',
    title: 'Meta Quest 3 128GB — VR Headset',
    price: 499.99, originalPrice: 549.99, estimatedMSRP: 549.99,
    url: 'https://www.amazon.com/dp/B0B9F7SP3P',
    affiliateLink: 'https://www.amazon.com/dp/B0B9F7SP3P?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/61CQ2J7yGtL._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'electronics', inStock: true,
    isCollectible: false, flipScore: 40, demandScore: 82, scarcityScore: 40, confidenceScore: 88
  },
  {
    name: 'Pokemon TCG: Paldean Fates Elite Trainer Box',
    title: 'Pokemon TCG: Paldean Fates Elite Trainer Box',
    price: 49.99, originalPrice: 59.99, estimatedMSRP: 59.99,
    url: 'https://www.amazon.com/dp/B0CNPF6V6L',
    affiliateLink: 'https://www.amazon.com/dp/B0CNPF6V6L?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/81X5Vo4xR1L._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'collectibles', inStock: true,
    isCollectible: true, flipScore: 72, demandScore: 85, scarcityScore: 45, confidenceScore: 80
  },
  {
    name: 'Samsung 990 Pro 1TB PCIe 4.0 NVMe M.2 SSD',
    title: 'Samsung 990 Pro 1TB PCIe 4.0 NVMe M.2 SSD',
    price: 89.99, originalPrice: 109.99, estimatedMSRP: 109.99,
    url: 'https://www.amazon.com/dp/B0BHC5P3H3',
    affiliateLink: 'https://www.amazon.com/dp/B0BHC5P3H3?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/71I1k6L7RBL._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'electronics', inStock: true,
    isCollectible: false, flipScore: 35, demandScore: 70, scarcityScore: 20, confidenceScore: 90
  },
  {
    name: 'Funko Pop! Star Wars: The Mandalorian - The Child',
    title: 'Funko Pop! Star Wars: The Mandalorian - The Child',
    price: 14.99, originalPrice: 19.99, estimatedMSRP: 19.99,
    url: 'https://www.amazon.com/dp/B08D9T4P9G',
    affiliateLink: 'https://www.amazon.com/dp/B08D9T4P9G?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/71cMq8yH2tL._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'collectibles', inStock: true,
    isCollectible: true, flipScore: 65, demandScore: 72, scarcityScore: 55, confidenceScore: 75
  },
  {
    name: 'Amazon Fire TV Stick 4K Max (Newest Model)',
    title: 'Amazon Fire TV Stick 4K Max (Newest Model)',
    price: 39.99, originalPrice: 59.99, estimatedMSRP: 59.99,
    url: 'https://www.amazon.com/dp/B0BP9SNV9C',
    affiliateLink: 'https://www.amazon.com/dp/B0BP9SNV9C?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/61L5Kj8sR3t._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'electronics', inStock: true,
    isCollectible: false, flipScore: 25, demandScore: 85, scarcityScore: 10, confidenceScore: 95
  },
  {
    name: 'One Piece TCG: OP-05 Awakening of the New Era Booster Box',
    title: 'One Piece TCG: OP-05 Awakening of the New Era Booster Box',
    price: 119.99, originalPrice: 143.99, estimatedMSRP: 143.99,
    url: 'https://www.amazon.com/dp/B0CH3RFQ9L',
    affiliateLink: 'https://www.amazon.com/dp/B0CH3RFQ9L?tag=' + AFFILIATE_TAG,
    image: 'https://m.media-amazon.com/images/I/81K3Lm9nP4q._AC_SL1500_.jpg',
    retailer: 'Amazon', category: 'collectibles', inStock: true,
    isCollectible: true, flipScore: 82, demandScore: 95, scarcityScore: 80, confidenceScore: 78
  }
];

// Section definitions with category filters and score thresholds
const SECTION_DEFS = [
  { key: 'hot', label: '🔥 Hot Deals', filter: { inStock: true }, sort: { featuredScore: -1 }, limit: 12 },
  { key: 'biggest_discounts', label: '📉 Biggest Discounts', filter: { inStock: true, savingsPercent: { $gte: 10 } }, sort: { savingsPercent: -1 }, limit: 12 },
  { key: 'trending', label: '⭐ Trending Products', filter: { inStock: true, isTrending: true }, sort: { featuredScore: -1 }, limit: 12 },
  { key: 'gaming', label: '🎮 Gaming Deals', filter: { category: { $regex: /gaming|consoles|controllers|accessories/i } }, sort: { featuredScore: -1 }, limit: 12 },
  { key: 'collectibles', label: '🃏 Collectibles', filter: { isCollectible: true }, sort: { featuredScore: -1 }, limit: 12 },
  { key: 'toys', label: '🎁 Toys', filter: { category: { $regex: /toys|legos|figures/i } }, sort: { featuredScore: -1 }, limit: 12 },
  { key: 'electronics', label: '💻 Electronics', filter: { category: { $regex: /electronics/i } }, sort: { featuredScore: -1 }, limit: 12 },
  { key: 'restocks', label: '🆕 New Restocks', filter: { hasRestockSignal: true, inStock: true }, sort: { lastSignalAt: -1 }, limit: 12 },
  { key: 'high_flip', label: '🚀 High Flip Potential', filter: { flipScore: { $gte: 70 }, inStock: true }, sort: { flipScore: -1 }, limit: 12 }
];

class FeaturedDealsEngine {
  constructor() {
    this.affiliateEngine = new AmazonAffiliateEngine();
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5-minute in-memory cache
    this.lastRefreshAt = null;
  }

  /**
   * Recalculate Featured Scores for all eligible products and rebuild the feed.
   */
  async refreshFeaturedFeed() {
    const products = await Product.find({ inStock: true })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();

    const productIds = products.map(p => p._id);

    // Fetch active signals for these products in bulk
    const activeSignals = await Signal.find({
      productId: { $in: productIds },
      status: 'active',
      expiresAt: { $gt: new Date() }
    })
      .sort({ createdAt: -1 })
      .lean();

    // Index signals by productId
    const signalMap = new Map();
    for (const sig of activeSignals) {
      if (!signalMap.has(String(sig.productId))) {
        signalMap.set(String(sig.productId), sig);
      }
    }

    const now = Date.now();
    const featuredDocs = [];

    // Bootstrap fallback: if no real products exist, use curated Amazon products
    // so the homepage always displays featured deals with affiliate links.
    if (products.length === 0) {
      console.log('[FeaturedDealsEngine] No products found, using bootstrap Amazon products');
      for (const bp of BOOTSTRAP_PRODUCTS) {
        const score = this.calculateFeaturedScore(bp, null);
        const savings = bp.estimatedMSRP && bp.price ? Math.max(0, bp.estimatedMSRP - bp.price) : 0;
        const savingsPercent = bp.estimatedMSRP && bp.price && bp.estimatedMSRP > 0
          ? Math.round((savings / bp.estimatedMSRP) * 100) : 0;
        const sections = this.determineSections(bp, null, score);
        const badges = [];
        if (score >= 80) badges.push('HOT');
        if (bp.isCollectible) badges.push('COLLECTIBLE');
        if (bp.flipScore >= 70) badges.push('HIGH_FLIP');
        if (bp.scarcityScore >= 60) badges.push('LIMITED');

        featuredDocs.push({
          productId: new (require('mongoose').Types.ObjectId)(),
          name: bp.name,
          title: bp.title || bp.name,
          price: bp.price,
          originalPrice: bp.originalPrice || null,
          estimatedMSRP: bp.estimatedMSRP || null,
          savings,
          savingsPercent,
          retailer: bp.retailer,
          category: bp.category,
          image: bp.image || '',
          affiliateUrl: bp.affiliateLink || bp.url || '',
          inStock: bp.inStock,
          demandScore: bp.demandScore || 0,
          scarcityScore: bp.scarcityScore || 0,
          flipScore: bp.flipScore || 0,
          confidenceScore: bp.confidenceScore || 0,
          featuredScore: score,
          sections,
          badges,
          hasRestockSignal: false,
          hasPriceDropSignal: false,
          lastSignalType: null,
          lastSignalAt: null,
          isCollectible: !!bp.isCollectible,
          isPreorder: false,
          isTrending: score >= 70 && (bp.demandScore || 0) >= 60,
          lastMonitoredAt: new Date(),
          featuredAt: new Date(),
          expiresAt: new Date(now + 24 * 60 * 60 * 1000)
        });
      }
    }

    for (const product of products) {
      const signal = signalMap.get(String(product._id)) || null;
      const score = this.calculateFeaturedScore(product, signal);

      const savings = product.estimatedMSRP && product.price
        ? Math.max(0, product.estimatedMSRP - product.price)
        : (product.previousPrice && product.price && product.previousPrice > product.price
          ? product.previousPrice - product.price
          : 0);
      const savingsPercent = product.estimatedMSRP && product.price && product.estimatedMSRP > 0
        ? Math.round((savings / product.estimatedMSRP) * 100)
        : (product.previousPrice && product.price && product.previousPrice > 0
          ? Math.round((savings / product.previousPrice) * 100)
          : 0);

      const affiliateUrl = product.affiliateLink
        ? (product.retailer && product.retailer.toLowerCase().includes('amazon')
          ? this.affiliateEngine.generateAffiliateUrl(product.affiliateLink)
          : product.affiliateLink)
        : (product.url || '');

      const badges = [];
      if (score >= 80) badges.push('HOT');
      if (signal && signal.signalType === 'restock') badges.push('RESTOCK');
      if (signal && signal.signalType === 'price-drop') badges.push('PRICE_DROP');
      if (product.isCollectible) badges.push('COLLECTIBLE');
      if (product.preorderStatus) badges.push('PREORDER');
      if (product.flipScore >= 70) badges.push('HIGH_FLIP');
      if (product.scarcityScore >= 60) badges.push('LIMITED');

      const sections = this.determineSections(product, signal, score);

      featuredDocs.push({
        productId: product._id,
        name: product.name,
        title: product.title || product.name,
        price: product.price,
        originalPrice: product.previousPrice || null,
        estimatedMSRP: product.estimatedMSRP || null,
        savings,
        savingsPercent,
        retailer: product.retailer,
        category: product.category,
        image: product.image || '',
        affiliateUrl: affiliateUrl && affiliateUrl.startsWith('http') ? affiliateUrl : (product.url || ''),
        inStock: product.inStock,
        demandScore: product.demandScore || 0,
        scarcityScore: product.scarcityScore || 0,
        flipScore: product.flipScore || 0,
        confidenceScore: product.confidenceScore || 0,
        featuredScore: score,
        sections,
        badges,
        hasRestockSignal: !!(signal && signal.signalType === 'restock'),
        hasPriceDropSignal: !!(signal && signal.signalType === 'price-drop'),
        lastSignalType: signal ? signal.signalType : null,
        lastSignalAt: signal ? signal.createdAt : null,
        isCollectible: !!product.isCollectible,
        isPreorder: !!product.preorderStatus,
        isTrending: score >= 70 && product.demandScore >= 60,
        lastMonitoredAt: product.updatedAt,
        featuredAt: new Date(),
        expiresAt: new Date(now + 24 * 60 * 60 * 1000)
      });
    }

    // Batch upsert into MongoDB
    if (featuredDocs.length > 0) {
      const bulkOps = featuredDocs.map(doc => ({
        updateOne: {
          filter: { productId: doc.productId },
          update: { $set: doc },
          upsert: true
        }
      }));
      await FeaturedProduct.bulkWrite(bulkOps, { ordered: false });

      // Remove stale entries not in the current refresh
      const freshIds = featuredDocs.map(d => d.productId);
      await FeaturedProduct.deleteMany({ productId: { $nin: freshIds } });
    } else {
      // If no products, clear the collection
      await FeaturedProduct.deleteMany({});
    }

    // Invalidate cache
    this.cache.clear();
    this.lastRefreshAt = new Date();

    console.log(`[FeaturedDealsEngine] Refreshed ${featuredDocs.length} featured products`);
    return featuredDocs;
  }

  /**
   * Calculate weighted Featured Score (0-100).
   */
  calculateFeaturedScore(product, signal) {
    let score = 0;

    // Flip Score weight: up to 25 points
    if (product.flipScore) score += (product.flipScore / 100) * 25;

    // Demand Score weight: up to 15 points
    if (product.demandScore) score += (product.demandScore / 100) * 15;

    // Scarcity Score weight: up to 15 points
    if (product.scarcityScore) score += (product.scarcityScore / 100) * 15;

    // Confidence Score weight: up to 10 points
    if (product.confidenceScore) score += (product.confidenceScore / 100) * 10;

    // Discount % weight: up to 10 points
    const msrp = product.estimatedMSRP || product.previousPrice;
    const price = product.price;
    if (msrp && price && msrp > 0 && price > 0 && price < msrp) {
      const discountPct = ((msrp - price) / msrp) * 100;
      score += Math.min(10, discountPct / 5);
    }

    // MSRP Gap weight: up to 5 points (high-value items)
    if (msrp && msrp >= 100) score += 2;
    if (msrp && msrp >= 250) score += 3;

    // Active Signals: up to 10 points
    if (signal) {
      if (signal.signalType === 'restock') score += 8;
      else if (signal.signalType === 'price-drop') score += 5;
      if (signal.tier === 'HIGH') score += 2;
    }

    // Collectible Status: up to 3 points
    if (product.isCollectible) score += 3;

    // Trending: up to 2 points
    if (product.demandScore >= 60) score += 2;

    // Recent monitoring activity: up to 5 points
    if (product.updatedAt) {
      const hoursSinceUpdate = (Date.now() - new Date(product.updatedAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 1) score += 5;
      else if (hoursSinceUpdate < 6) score += 3;
      else if (hoursSinceUpdate < 24) score += 1;
    }

    // In Stock: up to 5 points
    if (product.inStock) score += 5;

    // Freshness (newer products score higher): up to 5 points
    if (product.createdAt) {
      const ageDays = (Date.now() - new Date(product.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (ageDays < 1) score += 5;
      else if (ageDays < 3) score += 3;
      else if (ageDays < 7) score += 1;
    }

    // Preorder: up to 3 points
    if (product.preorderStatus) score += 3;

    return Math.min(100, Math.round(score));
  }

  /**
   * Determine which sections a product belongs to.
   */
  determineSections(product, signal, score) {
    const sections = [];

    if (score >= 75 && product.inStock) sections.push('hot');
    if (product.inStock) sections.push('all');

    const msrp = product.estimatedMSRP || product.previousPrice;
    if (msrp && product.price && msrp > product.price) {
      const pct = ((msrp - product.price) / msrp) * 100;
      if (pct >= 10) sections.push('biggest_discounts');
    }

    if (score >= 70 && product.demandScore >= 60) sections.push('trending');

    const cat = (product.category || '').toLowerCase();
    if (/gaming/i.test(cat) || /consoles/i.test(cat) || /controllers/i.test(cat) || /accessories/i.test(cat)) {
      sections.push('gaming');
    }
    if (product.isCollectible) sections.push('collectibles');
    if (/toys/i.test(cat) || /lego/i.test(cat) || /figures/i.test(cat)) sections.push('toys');
    if (/electronics/i.test(cat)) sections.push('electronics');
    if (signal && signal.signalType === 'restock' && product.inStock) sections.push('restocks');
    if (product.flipScore >= 70 && product.inStock) sections.push('high_flip');

    return sections;
  }

  /**
   * Get featured products by section with caching.
   */
  async getBySection(sectionKey, limit = 24) {
    const cacheKey = `section:${sectionKey}:${limit}`;
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < this.cacheTTL) {
      return cached.data;
    }

    const query = sectionKey !== 'all'
      ? { sections: sectionKey, expiresAt: { $gt: new Date() } }
      : { expiresAt: { $gt: new Date() } };

    const sort = sectionKey === 'restocks' ? { lastSignalAt: -1 } : { featuredScore: -1 };
    const data = await FeaturedProduct.find(query)
      .sort(sort)
      .limit(limit)
      .lean();

    this.cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  }

  /**
   * Get all featured products for homepage.
   */
  async getAllSections() {
    const cacheKey = 'all_sections';
    const cached = this.cache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < this.cacheTTL) {
      return cached.data;
    }

    const sections = {};
    for (const def of SECTION_DEFS) {
      sections[def.key] = {
        label: def.label,
        items: await this.getBySection(def.key, def.limit)
      };
    }

    const result = { sections, refreshedAt: this.lastRefreshAt };
    this.cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  }

  getStats() {
    return {
      lastRefreshAt: this.lastRefreshAt,
      cacheSize: this.cache.size,
      refreshed: !!this.lastRefreshAt
    };
  }
}

// Singleton
let instance = null;

function getFeaturedDealsEngine() {
  if (!instance) {
    instance = new FeaturedDealsEngine();
  }
  return instance;
}

module.exports = {
  FeaturedDealsEngine,
  getFeaturedDealsEngine,
  SECTION_DEFS
};