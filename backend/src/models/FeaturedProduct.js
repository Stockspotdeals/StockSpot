const mongoose = require('mongoose');

const featuredProductSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    unique: true,
    index: true
  },
  // Snapshot of core product data (no duplication of full Product doc)
  name: { type: String, trim: true },
  title: { type: String, trim: true },
  price: { type: Number, default: null },
  originalPrice: { type: Number, default: null },
  estimatedMSRP: { type: Number, default: null },
  savings: { type: Number, default: 0 },
  savingsPercent: { type: Number, default: 0 },
  retailer: { type: String, trim: true },
  category: { type: String, trim: true, index: true },
  image: { type: String, trim: true },
  affiliateUrl: { type: String, trim: true },
  inStock: { type: Boolean, default: false },

  // Intelligence scores
  demandScore: { type: Number, default: 0 },
  scarcityScore: { type: Number, default: 0 },
  flipScore: { type: Number, default: 0 },
  confidenceScore: { type: Number, default: 0 },

  // Featured score (computed)
  featuredScore: { type: Number, default: 0, index: true },

  // Categories populated by the engine
  sections: [{ type: String, trim: true }], // 'hot', 'trending', 'restocks', etc.

  // Badges
  badges: [{
    type: String,
    enum: ['HOT', 'RESTOCK', 'PRICE_DROP', 'COLLECTIBLE', 'LIMITED', 'PREORDER', 'HIGH_FLIP']
  }],

  // Signal context (from latest associated Signal)
  hasRestockSignal: { type: Boolean, default: false },
  hasPriceDropSignal: { type: Boolean, default: false },
  lastSignalType: { type: String, default: null },
  lastSignalAt: { type: Date, default: null },

  // Tracking
  isCollectible: { type: Boolean, default: false },
  isPreorder: { type: Boolean, default: false },
  isTrending: { type: Boolean, default: false },

  // Freshness
  lastMonitoredAt: { type: Date, default: null },
  featuredAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
}, {
  timestamps: true,
  collection: 'featured_products'
});

featuredProductSchema.index({ featuredScore: -1 });
featuredProductSchema.index({ sections: 1, featuredScore: -1 });
featuredProductSchema.index({ category: 1, featuredScore: -1 });
featuredProductSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FeaturedProduct', featuredProductSchema);