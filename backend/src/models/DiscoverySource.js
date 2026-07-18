const mongoose = require('mongoose');

/**
 * DiscoverySource Schema
 *
 * Represents a single discovery page URL that CategoryDiscovery
 * crawls to find new products. This is the single source of truth
 * for discovery URLs, replacing the hardcoded CATEGORY_URLS constant.
 *
 * Fields are intentionally minimal — no analytics, counters, or history.
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
    enum: ['category', 'search', 'preorder', 'publisher', 'landing', 'sitemap'],
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
  }
}, {
  timestamps: true,
  collection: 'discovery_sources'
});

// Compound index for the query used by CategoryDiscovery
DiscoverySourceSchema.index({ enabled: 1, priority: 1, createdAt: 1 });

const DiscoverySource = mongoose.model('DiscoverySource', DiscoverySourceSchema);

module.exports = { DiscoverySource };