/**
 * Owner Intelligence Engine — Campaign C
 *
 * Automatically improves discovery efficiency over time.
 * All logic is deterministic. No AI APIs. No paid services.
 *
 * Determines:
 *   - Which DiscoverySources deserve higher priority
 *   - Which retailers deserve more crawl budget
 *   - Which categories consistently produce valuable products
 *   - Which sources should be deprioritized
 *
 * Integrates into existing pipeline:
 *   Discovery → Owner Intelligence → Tracked Products → Product Intelligence → Signals
 */

const { DiscoverySource } = require('../models/DiscoverySource');
const { TrackedProduct } = require('../models/TrackedProduct');
const { ProductIntelligence } = require('./ProductIntelligence');

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const PRIORITY_MIN = 0;
const PRIORITY_MAX = 1000;
const PRIORITY_DEFAULT = 100;

const CRAWL_WEIGHT_MIN = 0.1;
const CRAWL_WEIGHT_MAX = 10.0;
const CRAWL_WEIGHT_DEFAULT = 1.0;

const RETAILER_HEALTH_COLLECTION = 'retailer_health';
const CATEGORY_PERFORMANCE_COLLECTION = 'category_performance';

// ──────────────────────────────────────────────
// Part 3 — Retailer Health
// ──────────────────────────────────────────────

class RetailerHealth {
  /**
   * Get or create retailer health record.
   */
  static async getHealth(retailer) {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return null;

      const collection = db.collection(RETAILER_HEALTH_COLLECTION);
      const record = await collection.findOne({ retailer });
      if (record) return record;

      // Create default record
      const defaultRecord = {
        retailer,
        crawlSuccess: 0,
        crawlFailures: 0,
        totalProductsDiscovered: 0,
        totalCollectiblesDiscovered: 0,
        averageProductsPerCrawl: 0,
        averageCollectiblesPerCrawl: 0,
        lastCrawlAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await collection.insertOne(defaultRecord);
      return defaultRecord;
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to get retailer health:', error.message);
      return null;
    }
  }

  /**
   * Record a successful crawl for a retailer.
   * Updates rolling averages for products and collectibles discovered.
   */
  static async recordCrawlSuccess(retailer, productsFound, collectiblesFound) {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return;

      const collection = db.collection(RETAILER_HEALTH_COLLECTION);
      const current = await collection.findOne({ retailer });

      const newCrawlSuccess = (current?.crawlSuccess || 0) + 1;
      const newTotalProducts = (current?.totalProductsDiscovered || 0) + productsFound;
      const newTotalCollectibles = (current?.totalCollectiblesDiscovered || 0) + collectiblesFound;
      const totalCrawls = newCrawlSuccess + (current?.crawlFailures || 0);

      await collection.updateOne(
        { retailer },
        {
          $set: {
            crawlSuccess: newCrawlSuccess,
            totalProductsDiscovered: newTotalProducts,
            totalCollectiblesDiscovered: newTotalCollectibles,
            averageProductsPerCrawl: totalCrawls > 0 ? Math.round((newTotalProducts / totalCrawls) * 100) / 100 : 0,
            averageCollectiblesPerCrawl: totalCrawls > 0 ? Math.round((newTotalCollectibles / totalCrawls) * 100) / 100 : 0,
            lastCrawlAt: new Date(),
            updatedAt: new Date()
          },
          $setOnInsert: {
            retailer,
            createdAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to record crawl success:', error.message);
    }
  }

  /**
   * Record a crawl failure for a retailer.
   */
  static async recordCrawlFailure(retailer) {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return;

      const collection = db.collection(RETAILER_HEALTH_COLLECTION);
      const current = await collection.findOne({ retailer });
      const newFailures = (current?.crawlFailures || 0) + 1;
      const totalCrawls = (current?.crawlSuccess || 0) + newFailures;

      await collection.updateOne(
        { retailer },
        {
          $set: {
            crawlFailures: newFailures,
            averageProductsPerCrawl: totalCrawls > 0
              ? Math.round(((current?.totalProductsDiscovered || 0) / totalCrawls) * 100) / 100
              : 0,
            averageCollectiblesPerCrawl: totalCrawls > 0
              ? Math.round(((current?.totalCollectiblesDiscovered || 0) / totalCrawls) * 100) / 100
              : 0,
            lastCrawlAt: new Date(),
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to record crawl failure:', error.message);
    }
  }

  /**
   * Get all retailer health records sorted by performance.
   */
  static async getAllHealth() {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return [];

      const collection = db.collection(RETAILER_HEALTH_COLLECTION);
      return await collection.find()
        .sort({ averageProductsPerCrawl: -1 })
        .toArray();
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to get all retailer health:', error.message);
      return [];
    }
  }

  /**
   * Calculate crawl budget allocation for each retailer.
   * High-performing retailers get more budget.
   * Returns a map of retailer -> weight (0.0 to 1.0).
   */
  static async calculateCrawlBudget() {
    try {
      const allHealth = await RetailerHealth.getAllHealth();
      if (allHealth.length === 0) {
        // Equal distribution if no data yet
        return {};
      }

      // Calculate performance score for each retailer
      const scores = {};
      for (const h of allHealth) {
        const totalCrawls = (h.crawlSuccess || 0) + (h.crawlFailures || 0);
        let score = 1.0; // baseline

        if (totalCrawls > 0) {
          // Success rate (0-1)
          const successRate = (h.crawlSuccess || 0) / totalCrawls;
          score += successRate * 3;

          // Products per crawl (0-5 bonus)
          const productsPerCrawl = h.averageProductsPerCrawl || 0;
          score += Math.min(productsPerCrawl, 5);

          // Collectibles per crawl (0-3 bonus)
          const collectiblesPerCrawl = h.averageCollectiblesPerCrawl || 0;
          score += Math.min(collectiblesPerCrawl, 3);
        }

        scores[h.retailer] = score;
      }

      // Normalize to weights that sum to 1.0
      const totalScore = Object.values(scores).reduce((sum, s) => sum + s, 0);
      const weights = {};
      for (const [retailer, score] of Object.entries(scores)) {
        weights[retailer] = totalScore > 0 ? score / totalScore : 1 / allHealth.length;
      }

      return weights;
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to calculate crawl budget:', error.message);
      return {};
    }
  }
}

// ──────────────────────────────────────────────
// Part 5 — Category Performance
// ──────────────────────────────────────────────

class CategoryPerformance {
  /**
   * Record a product discovery for category performance tracking.
   */
  static async recordProduct(category, demandScore, flipScore, isCollectible) {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return;

      const collection = db.collection(CATEGORY_PERFORMANCE_COLLECTION);
      const current = await collection.findOne({ category });

      const newCount = (current?.totalProducts || 0) + 1;
      const newDemandTotal = (current?.totalDemandScore || 0) + (demandScore || 0);
      const newFlipTotal = (current?.totalFlipScore || 0) + (flipScore || 0);
      const newCollectibles = (current?.totalCollectibles || 0) + (isCollectible ? 1 : 0);

      await collection.updateOne(
        { category },
        {
          $set: {
            totalProducts: newCount,
            totalDemandScore: newDemandTotal,
            totalFlipScore: newFlipTotal,
            totalCollectibles: newCollectibles,
            averageDemand: newCount > 0 ? Math.round((newDemandTotal / newCount) * 100) / 100 : 0,
            averageFlip: newCount > 0 ? Math.round((newFlipTotal / newCount) * 100) / 100 : 0,
            collectibleRate: newCount > 0 ? Math.round((newCollectibles / newCount) * 10000) / 100 : 0,
            updatedAt: new Date()
          },
          $setOnInsert: {
            category,
            createdAt: new Date()
          }
        },
        { upsert: true }
      );
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to record category performance:', error.message);
    }
  }

  /**
   * Get all category performance records sorted by value.
   */
  static async getAllPerformance() {
    try {
      const mongoose = require('mongoose');
      const db = mongoose.connection.db;
      if (!db) return [];

      const collection = db.collection(CATEGORY_PERFORMANCE_COLLECTION);
      return await collection.find()
        .sort({ averageFlip: -1, averageDemand: -1 })
        .toArray();
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to get category performance:', error.message);
      return [];
    }
  }

  /**
   * Get top-performing categories.
   */
  static async getTopCategories(limit = 5) {
    try {
      const all = await CategoryPerformance.getAllPerformance();
      return all.slice(0, limit);
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to get top categories:', error.message);
      return [];
    }
  }
}

// ──────────────────────────────────────────────
// Part 2 — Automatic Priority Adjustment
// ──────────────────────────────────────────────

class PriorityAdjuster {
  /**
   * Increase a DiscoverySource's priority based on positive signals.
   *
   * Called when:
   *   - products are found on the source
   *   - collectible products are found
   *   - high flip score products are found
   *   - preorder products are found
   */
  static async increasePriority(sourceUrl, signals = {}) {
    try {
      const source = await DiscoverySource.findOne({ url: sourceUrl });
      if (!source) return;

      let boost = 0;

      // Base: products found
      if (signals.productsFound) {
        boost += 5;
      }

      // Collectible products found
      if (signals.collectiblesFound) {
        boost += 10;
      }

      // High flip score products found (flipScore >= 60)
      if (signals.highFlipProducts) {
        boost += 15;
      }

      // Preorder products found
      if (signals.preorderProducts) {
        boost += 10;
      }

      if (boost === 0) return;

      const newPriority = Math.min(PRIORITY_MAX, (source.crawlPriority || PRIORITY_DEFAULT) + boost);
      await DiscoverySource.updateOne(
        { url: sourceUrl },
        { $set: { crawlPriority: newPriority } }
      );
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to increase priority:', error.message);
    }
  }

  /**
   * Decrease a DiscoverySource's priority based on negative signals.
   *
   * Called when:
   *   - repeated failures
   *   - empty crawls (no products found)
   *   - blocked pages
   *   - repeated timeouts
   */
  static async decreasePriority(sourceUrl, signals = {}) {
    try {
      const source = await DiscoverySource.findOne({ url: sourceUrl });
      if (!source) return;

      let penalty = 0;

      // Repeated failures
      if (signals.consecutiveFailures) {
        penalty += signals.consecutiveFailures * 15;
      }

      // Empty crawl (no products found on a successful fetch)
      if (signals.emptyCrawl) {
        penalty += 10;
      }

      // Blocked page
      if (signals.blocked) {
        penalty += 50;
      }

      // Timeout
      if (signals.timeout) {
        penalty += 30;
      }

      if (penalty === 0) return;

      const newPriority = Math.max(PRIORITY_MIN, (source.crawlPriority || PRIORITY_DEFAULT) - penalty);
      await DiscoverySource.updateOne(
        { url: sourceUrl },
        { $set: { crawlPriority: newPriority } }
      );
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to decrease priority:', error.message);
    }
  }
}

// ──────────────────────────────────────────────
// Part 6 — Discovery Learning
// ──────────────────────────────────────────────

class DiscoveryLearning {
  /**
   * Process a product that was just discovered and analyzed by Product Intelligence.
   *
   * When high-value products are identified:
   *   - Increase the DiscoverySource priority
   *
   * When many low-value products are found:
   *   - Reduce priority slightly
   *
   * Learning is deterministic — based on Product Intelligence scores.
   */
  static async processProduct(sourceUrl, intelligence) {
    if (!sourceUrl || !intelligence) return;

    const flipScore = intelligence.flipScore || 0;
    const demandScore = intelligence.demandScore || 0;
    const isCollectible = intelligence.isCollectible || false;
    const isPreorder = intelligence.preorderStatus || false;

    // High-value signals
    const signals = {
      productsFound: true,
      collectiblesFound: isCollectible,
      highFlipProducts: flipScore >= 60,
      preorderProducts: isPreorder
    };

    // Check if this is a high-value product
    const isHighValue = flipScore >= 60 || demandScore >= 70 || isCollectible;

    if (isHighValue) {
      await PriorityAdjuster.increasePriority(sourceUrl, signals);
    } else if (flipScore < 20 && demandScore < 30) {
      // Low-value product — slight penalty
      await PriorityAdjuster.decreasePriority(sourceUrl, { emptyCrawl: true });
    }
  }

  /**
   * Process a batch of products discovered from a single source.
   */
  static async processBatch(sourceUrl, products) {
    if (!sourceUrl || !products || products.length === 0) return;

    let highValueCount = 0;
    let lowValueCount = 0;
    let collectibleCount = 0;
    let preorderCount = 0;

    for (const p of products) {
      const intelligence = p._intelligence || {};
      if (intelligence.flipScore >= 60) highValueCount++;
      if (intelligence.flipScore < 20 && intelligence.demandScore < 30) lowValueCount++;
      if (intelligence.isCollectible) collectibleCount++;
      if (intelligence.preorderStatus) preorderCount++;
    }

    // Net effect: high-value products increase priority, low-value decrease
    if (highValueCount > 0) {
      await PriorityAdjuster.increasePriority(sourceUrl, {
        productsFound: true,
        collectiblesFound: collectibleCount > 0,
        highFlipProducts: highValueCount > 0,
        preorderProducts: preorderCount > 0
      });
    }

    // If low-value significantly outnumbers high-value, decrease
    if (lowValueCount > highValueCount * 2 && lowValueCount >= 3) {
      await PriorityAdjuster.decreasePriority(sourceUrl, { emptyCrawl: true });
    }
  }
}

// ──────────────────────────────────────────────
// Part 4 — Crawl Budget (Weighted Allocation)
// ──────────────────────────────────────────────

class CrawlBudgetAllocator {
  /**
   * Get weighted crawl budget for each retailer.
   * Replaces equal allocation with performance-based allocation.
   *
   * @param {number} totalBudget - Total number of sources to crawl per run
   * @returns {Object} Map of retailer -> number of sources to crawl
   */
  static async allocateBudget(totalBudget = 20) {
    try {
      const weights = await RetailerHealth.calculateCrawlBudget();
      const retailers = Object.keys(weights);

      if (retailers.length === 0) {
        // Fallback: equal distribution
        return {};
      }

      // Allocate budget proportionally
      const allocation = {};
      let allocated = 0;

      for (const retailer of retailers) {
        const share = Math.max(1, Math.round(weights[retailer] * totalBudget));
        allocation[retailer] = share;
        allocated += share;
      }

      // If we overallocated, trim from the lowest-performing retailer
      if (allocated > totalBudget) {
        const sorted = retailers.sort((a, b) => weights[a] - weights[b]);
        let excess = allocated - totalBudget;
        for (const retailer of sorted) {
          const reduction = Math.min(allocation[retailer] - 1, excess);
          allocation[retailer] -= reduction;
          excess -= reduction;
          if (excess <= 0) break;
        }
      }

      // If we underallocated, give extra to the highest-performing retailer
      if (allocated < totalBudget) {
        const sorted = retailers.sort((a, b) => weights[b] - weights[a]);
        allocation[sorted[0]] = (allocation[sorted[0]] || 0) + (totalBudget - allocated);
      }

      return allocation;
    } catch (error) {
      console.warn('[OwnerIntelligence] Failed to allocate crawl budget:', error.message);
      return {};
    }
  }
}

// ──────────────────────────────────────────────
// Part 7 — Dashboard / Summary
// ──────────────────────────────────────────────

class OwnerIntelligenceDashboard {
  /**
   * Get top retailers by performance.
   */
  static async getTopRetailers(limit = 5) {
    const health = await RetailerHealth.getAllHealth();
    return health.slice(0, limit).map(h => ({
      retailer: h.retailer,
      crawlSuccess: h.crawlSuccess || 0,
      crawlFailures: h.crawlFailures || 0,
      averageProductsPerCrawl: h.averageProductsPerCrawl || 0,
      averageCollectiblesPerCrawl: h.averageCollectiblesPerCrawl || 0,
      totalProductsDiscovered: h.totalProductsDiscovered || 0
    }));
  }

  /**
   * Get top categories by performance.
   */
  static async getTopCategories(limit = 5) {
    return await CategoryPerformance.getTopCategories(limit);
  }

  /**
   * Get top discovery sources by performance.
   */
  static async getTopSources(limit = 10) {
    return await DiscoverySource.find({ enabled: true })
      .sort({ totalProductsFound: -1, crawlPriority: -1 })
      .limit(limit)
      .lean();
  }

  /**
   * Get discovery success rates.
   */
  static async getSuccessRates() {
    const sources = await DiscoverySource.find({ enabled: true }).lean();
    const total = sources.length;
    const withProducts = sources.filter(s => (s.totalProductsFound || 0) > 0).length;
    const healthy = sources.filter(s => (s.consecutiveFailures || 0) < 3).length;
    const struggling = sources.filter(s => (s.consecutiveFailures || 0) >= 3).length;

    return {
      totalSources: total,
      productiveSources: withProducts,
      healthySources: healthy,
      strugglingSources: struggling,
      productivityRate: total > 0 ? Math.round((withProducts / total) * 100) : 0,
      healthRate: total > 0 ? Math.round((healthy / total) * 100) : 0
    };
  }

  /**
   * Get priority distribution across all sources.
   */
  static async getPriorityDistribution() {
    const sources = await DiscoverySource.find({ enabled: true }).lean();
    const distribution = {
      high: 0,    // priority >= 500
      medium: 0,  // priority >= 200
      low: 0,     // priority >= 50
      minimal: 0  // priority < 50
    };

    for (const s of sources) {
      const p = s.crawlPriority || 0;
      if (p >= 500) distribution.high++;
      else if (p >= 200) distribution.medium++;
      else if (p >= 50) distribution.low++;
      else distribution.minimal++;
    }

    return distribution;
  }

  /**
   * Get full health summary.
   */
  static async getHealthSummary() {
    const [topRetailers, topCategories, topSources, successRates, priorityDist] = await Promise.all([
      OwnerIntelligenceDashboard.getTopRetailers(),
      OwnerIntelligenceDashboard.getTopCategories(),
      OwnerIntelligenceDashboard.getTopSources(),
      OwnerIntelligenceDashboard.getSuccessRates(),
      OwnerIntelligenceDashboard.getPriorityDistribution()
    ]);

    return {
      topRetailers,
      topCategories,
      topSources,
      successRates,
      priorityDistribution: priorityDist,
      timestamp: new Date()
    };
  }
}

// ──────────────────────────────────────────────
// Part 8 — Integration Entry Point
// ──────────────────────────────────────────────

class OwnerIntelligence {
  /**
   * Process a batch of discovered products through the Owner Intelligence Engine.
   *
   * Called from CategoryDiscovery after products are discovered.
   * Updates:
   *   - DiscoverySource priority (via DiscoveryLearning)
   *   - Retailer health (via RetailerHealth)
   *   - Category performance (via CategoryPerformance)
   *
   * @param {Array} discoveries - Array of discovery results
   * @param {string} sourceUrl - The discovery source URL that produced these products
   * @param {string} retailer - The retailer name
   */
  static async processDiscoveries(discoveries, sourceUrl, retailer) {
    if (!discoveries || discoveries.length === 0) {
      // Empty crawl — record as a crawl with 0 products
      if (retailer) {
        await RetailerHealth.recordCrawlSuccess(retailer, 0, 0);
      }
      return;
    }

    let totalProducts = 0;
    let totalCollectibles = 0;

    // Attach intelligence to each discovery and track metrics
    const enrichedProducts = [];
    for (const d of discoveries) {
      // Create a minimal product object for intelligence analysis
      const productData = {
        title: d.title || '',
        url: d.url || '',
        retailer: d.retailer || retailer || '',
        category: d.category || 'other',
        price: d.price || null
      };

      const intelligence = ProductIntelligence.analyze(productData, d.pageText || '');
      d._intelligence = intelligence;
      enrichedProducts.push(d);

      totalProducts++;

      if (intelligence.isCollectible) {
        totalCollectibles++;
      }

      // Track category performance
      if (d.category) {
        await CategoryPerformance.recordProduct(
          d.category,
          intelligence.demandScore,
          intelligence.flipScore,
          intelligence.isCollectible
        );
      }
    }

    // Update retailer health
    if (retailer) {
      await RetailerHealth.recordCrawlSuccess(retailer, totalProducts, totalCollectibles);
    }

    // Apply discovery learning to the source
    if (sourceUrl) {
      await DiscoveryLearning.processBatch(sourceUrl, enrichedProducts);
    }
  }

  /**
   * Process a single product through the Owner Intelligence Engine.
   * Called from productUpsert when Product Intelligence analysis completes.
   *
   * @param {Object} trackedProduct - The tracked product that was analyzed
   * @param {Object} intelligence - The Product Intelligence result
   */
  static async processProduct(trackedProduct, intelligence) {
    if (!trackedProduct || !intelligence) return;

    // Track category performance
    if (trackedProduct.category) {
      await CategoryPerformance.recordProduct(
        trackedProduct.category,
        intelligence.demandScore,
        intelligence.flipScore,
        intelligence.isCollectible
      );
    }

    // If this product was auto-discovered, apply discovery learning
    if (trackedProduct.source === 'auto' && trackedProduct._discoverySourceUrl) {
      await DiscoveryLearning.processProduct(
        trackedProduct._discoverySourceUrl,
        intelligence
      );
    }
  }

  /**
   * Get the full Owner Intelligence dashboard data.
   */
  static async getDashboard() {
    return await OwnerIntelligenceDashboard.getHealthSummary();
  }
}

module.exports = {
  OwnerIntelligence,
  RetailerHealth,
  CategoryPerformance,
  PriorityAdjuster,
  DiscoveryLearning,
  CrawlBudgetAllocator,
  OwnerIntelligenceDashboard
};