const mongoose = require('mongoose');

/**
 * DiscoverySource Schema
 *
 * Represents a single discovery page URL that CategoryDiscovery
 * crawls to find new products. This is the single source of truth
 * for discovery URLs, replacing the hardcoded CATEGORY_URLS constant.
 *
 * Tracks crawl health for automatic prioritization and disabling
 * of unproductive sources.
 */
const DiscoverySourceSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  retailer: {
    type: String,
    required: true,
    index: true
  },
  sourceType: {
    type: String,
    enum: ['category', 'search', 'preorder', 'publisher', 'landing', 'sitemap', 'collection'],
    default: 'category'
  },
  priority: {
    type: Number,
    default: 100,
    min: 0,
    max: 1000
  },
  enabled: {
    type: Boolean,
    default: true,
    index: true
  },

  // === PART 1: Health tracking fields ===
  lastCrawledAt: {
    type: Date,
    default: null
  },
  lastSuccessfulCrawl: {
    type: Date,
    default: null
  },
  lastProductFoundAt: {
    type: Date,
    default: null
  },
  totalProductsFound: {
    type: Number,
    default: 0,
    min: 0
  },
  totalProductsCreated: {
    type: Number,
    default: 0,
    min: 0
  },
  successfulCrawls: {
    type: Number,
    default: 0,
    min: 0
  },
  failedCrawls: {
    type: Number,
    default: 0,
    min: 0
  },
  consecutiveFailures: {
    type: Number,
    default: 0,
    min: 0
  },
  averageProductsPerCrawl: {
    type: Number,
    default: 0,
    min: 0
  },
  averageResponseTime: {
    type: Number,
    default: 0,
    min: 0
  },
  totalResponseTime: {
    type: Number,
    default: 0,
    min: 0
  },
  crawlCount: {
    type: Number,
    default: 0,
    min: 0
  },

  // === PART 5: Auto-disable metadata ===
  disabledReason: {
    type: String,
    default: null
  },
  autoDisabled: {
    type: Boolean,
    default: false
  },
  disabledAt: {
    type: Date,
    default: null
  },
  manuallyReEnabledAt: {
    type: Date,
    default: null
  },

  // === PART 2: Dynamic priority fields ===
  crawlPriority: {
    type: Number,
    default: 100,
    min: 0,
    max: 1000
  },
  crawlWeight: {
    type: Number,
    default: 1.0,
    min: 0.1,
    max: 10.0
  },

  // === PART 7: Sitemap metadata ===
  lastSitemapParse: {
    type: Date,
    default: null
  },
  sitemapUrlsFound: {
    type: Number,
    default: 0,
    min: 0
  },

  // === PART 6: Publisher metadata ===
  publisherName: {
    type: String,
    default: null,
    index: true
  },
  publisherHub: {
    type: String,
    default: null
  },

  // === PART 4: Cooldown ===
  cooldownUntil: {
    type: Date,
    default: null
  },
  baseCooldownMinutes: {
    type: Number,
    default: 30,
    min: 1
  },
  currentCooldownMinutes: {
    type: Number,
    default: 30,
    min: 1
  },

  // Source metadata
  notes: {
    type: String,
    default: null
  },
  lastHttpStatus: {
    type: Number,
    default: null
  },
  lastErrorMessage: {
    type: String,
    default: null
  },
  redirectTarget: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'discovery_sources'
});

// Indexes for health-based queries
DiscoverySourceSchema.index({ enabled: 1, priority: 1, createdAt: 1 });
DiscoverySourceSchema.index({ enabled: 1, lastCrawledAt: 1 });
DiscoverySourceSchema.index({ enabled: 1, crawlPriority: -1, lastCrawledAt: 1 });
DiscoverySourceSchema.index({ enabled: 1, consecutiveFailures: -1 });
DiscoverySourceSchema.index({ retailer: 1, enabled: 1 });
DiscoverySourceSchema.index({ publisherName: 1, enabled: 1 });
DiscoverySourceSchema.index({ autoDisabled: 1, enabled: 1 });
DiscoverySourceSchema.index({ cooldownUntil: 1 }, { sparse: true });

/**
 * Calculate dynamic priority score for sorting crawl order.
 * Used by the crawl budget system.
 */
DiscoverySourceSchema.statics.calculateDynamicPriority = function(source) {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  let score = source.crawlPriority || source.priority || 100;

  // Product yield bonus: each product found adds weight
  score += (source.totalProductsFound || 0) * 5;

  // Recent product bonus: +300 if product found in last 7 days
  if (source.lastProductFoundAt) {
    const daysSince = (now - new Date(source.lastProductFoundAt).getTime()) / DAY_MS;
    if (daysSince <= 7) {
      score += 300;
    } else if (daysSince <= 30) {
      score += 150;
    }
    // Stale penalty: -100 per week since last product
    const staleWeeks = Math.max(0, Math.floor(daysSince / 7) - 1);
    score -= Math.min(staleWeeks * 100, 800);
  }

  // Success rate bonus: high success rate = higher score
  const totalCrawls = (source.successfulCrawls || 0) + (source.failedCrawls || 0);
  if (totalCrawls > 5) {
    const successRate = (source.successfulCrawls || 0) / totalCrawls;
    score += Math.round(successRate * 200);
    // Failure penalty: low success rate penalizes heavily
    if (successRate < 0.3) {
      score -= 300;
    }
  }

  // Consecutive failure penalty
  score -= (source.consecutiveFailures || 0) * 75;

  // Freshness bonus: recently crawled sources get a slight boost
  // (they're more likely to have fresh data)
  if (source.lastCrawledAt) {
    const hoursSince = (now - new Date(source.lastCrawledAt).getTime()) / (60 * 60 * 1000);
    if (hoursSince < 1) {
      // Just crawled — don't crawl again soon (this is handled by cooldown)
      // But don't penalize either
    }
  }

  // Crawl weight multiplier (applied at the end)
  score = Math.round(score * (source.crawlWeight || 1.0));

  // Clamp to reasonable range
  return Math.max(0, Math.min(score, 2000));
};

/**
 * Calculate adaptive cooldown in milliseconds based on source history.
 * Productive sources get shorter cooldowns, unproductive get longer.
 */
DiscoverySourceSchema.statics.calculateCooldownMs = function(source) {
  const baseMinutes = source.currentCooldownMinutes || source.baseCooldownMinutes || 30;
  let cooldownMinutes = baseMinutes;

  // Productive sources deserve shorter cooldowns
  if ((source.totalProductsFound || 0) > 10) {
    cooldownMinutes = Math.max(5, cooldownMinutes * 0.7);
  } else if ((source.totalProductsFound || 0) > 5) {
    cooldownMinutes = Math.max(10, cooldownMinutes * 0.85);
  }

  // Failure streaks increase cooldown
  const failures = source.consecutiveFailures || 0;
  if (failures >= 5) {
    cooldownMinutes *= 4; // Dead source — long cooldown
  } else if (failures >= 3) {
    cooldownMinutes *= 2.5;
  } else if (failures >= 1) {
    cooldownMinutes *= 1.5;
  }

  // Very slow pages get longer cooldowns
  if (source.averageResponseTime > 10000) {
    cooldownMinutes *= 2;
  } else if (source.averageResponseTime > 5000) {
    cooldownMinutes *= 1.5;
  }

  // Fast, productive pages get short cooldowns
  if (source.averageResponseTime > 0 && source.averageResponseTime < 2000 &&
      (source.totalProductsFound || 0) > 3) {
    cooldownMinutes *= 0.5;
  }

  // Clamp: min 2 minutes, max 24 hours
  cooldownMinutes = Math.max(2, Math.min(cooldownMinutes, 24 * 60));

  return Math.round(cooldownMinutes * 60 * 1000);
};

const DiscoverySource = mongoose.model('DiscoverySource', DiscoverySourceSchema);

module.exports = { DiscoverySource };