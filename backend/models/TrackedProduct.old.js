const mongoose = require('mongoose');

const RETAILER_TYPES = {
  AMAZON: 'amazon',
  WALMART: 'walmart',
  TARGET: 'target',
  BESTBUY: 'bestbuy',
  UNKNOWN: 'unknown'
};

const PRODUCT_STATUSES = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  FAILED: 'failed',
  DELETED: 'deleted'
};

const CATEGORY_TYPES = {
  POKEMON_TCG: 'pokemon-tcg',
  ONE_PIECE_TCG: 'one-piece-tcg',
  SPORTS_CARDS: 'sports-cards',
  GENERAL: 'general'
};

const trackedProductSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    index: true
  },
  originalUrl: {
    type: String,
    required: true
  },
  productId: {
    type: String,
    required: true,
    index: true
  },
  retailer: {
    type: String,
    enum: Object.values(RETAILER_TYPES),
    required: true,
    index: true
  },
  category: {
    type: String,
    enum: Object.values(CATEGORY_TYPES),
    default: CATEGORY_TYPES.GENERAL,
    index: true
  },
  productName: {
    type: String,
    default: 'Unknown Product'
  },
  currentPrice: {
    type: Number,
    index: true
  },
  previousPrice: Number,
  targetPrice: Number,
  affiliateLink: String,
  availability: {
    type: String,
    default: 'Unknown'
  },
  isAvailable: {
    type: Boolean,
    default: false,
    index: true
  },
  checkInterval: {
    type: Number,
    default: 60,
    min: 15
  },
  status: {
    type: String,
    enum: Object.values(PRODUCT_STATUSES),
    default: PRODUCT_STATUSES.ACTIVE,
    index: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  lastChecked: Date,
  nextCheck: {
    type: Date,
    index: true
  },
  errorCount: {
    type: Number,
    default: 0
  },
  lastError: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

trackedProductSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

trackedProductSchema.index({ retailer: 1, isActive: 1 });
trackedProductSchema.index({ status: 1, nextCheck: 1 });
trackedProductSchema.index({ category: 1, isAvailable: 1 });

const productEventSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrackedProduct',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    required: true,
    index: true
  },
  description: String,
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  posted: {
    type: Boolean,
    default: false,
    index: true
  },
  telegramMessageId: String,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

productEventSchema.index({ eventType: 1, posted: 1, createdAt: -1 });

const TrackedProduct = mongoose.model('TrackedProduct', trackedProductSchema);
const ProductEvent = mongoose.model('ProductEvent', productEventSchema);

module.exports = {
  TrackedProduct,
  ProductEvent,
  RETAILER_TYPES,
  PRODUCT_STATUSES,
  CATEGORY_TYPES
};

