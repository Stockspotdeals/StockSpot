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