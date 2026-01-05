const mongoose = require('mongoose');

// Retailer constants
const RETAILER_TYPES = {
  AMAZON: 'amazon',
  BESTBUY: 'bestbuy',
  WALMART: 'walmart',
  TARGET: 'target',
  GAMESTOP: 'gamestop',
  POKEMONCENTER: 'pokemoncenter',
  OTHER: 'other'
};

// Product event types
const EVENT_TYPES = {
  RESTOCK: 'restock',
  PRICE_DROP: 'price_drop',
  PRICE_INCREASE: 'price_increase',
  TARGET_PRICE: 'target_price_reached',
  OUT_OF_STOCK: 'out_of_stock',
  ERROR: 'error',
  CREATED: 'created'
};

/**
 * Tracked Product Schema - Simplified for Autonomous Bot
 */
const TrackedProductSchema = new mongoose.Schema({
  // Basic product info
  url: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  title: {
    type: String,
    default: ''
  },
  retailer: {
    type: String,
    enum: Object.values(RETAILER_TYPES),
    required: true,
    default: RETAILER_TYPES.OTHER
  },
  
  // Category and monetization
  category: {
    type: String,
    enum: ['pokemon_tcg', 'one_piece_tcg', 'sports_cards', 'gaming', 'electronics', 'collectibles', 'toys', 'other'],
    default: 'other'
  },
  affiliateLink: {
    type: String,
    default: ''
  },
  
  // Current state
  price: {
    type: Number,
    default: null
  },
  availability: {
    type: String,
    default: 'Unknown'
  },
  isAvailable: {
    type: Boolean,
    default: false
  },
  
  // Monitoring settings
  targetPrice: {
    type: Number,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  checkInterval: {
    type: Number,
    default: 5 // minutes
  },
  
  // Tracking metadata
  lastCheckedAt: {
    type: Date,
    default: null
  },
  nextCheck: {
    type: Date,
    default: Date.now,
    index: true
  },
  errorCount: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: null
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Optional metadata
  notes: {
    type: String,
    default: ''
  },
  tags: [{
    type: String
  }]
}, {
  timestamps: true,
  collection: 'tracked_products'
});

// Indexes for efficient queries
TrackedProductSchema.index({ isActive: 1, nextCheck: 1 });
TrackedProductSchema.index({ retailer: 1, category: 1 });
TrackedProductSchema.index({ createdAt: -1 });

/**
 * Product Event Schema - For tracking changes
 */
const ProductEventSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrackedProduct',
    required: true,
    index: true
  },
  eventType: {
    type: String,
    enum: Object.values(EVENT_TYPES),
    required: true
  },
  oldValue: mongoose.Schema.Types.Mixed,
  newValue: mongoose.Schema.Types.Mixed,
  description: {
    type: String,
    default: ''
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  collection: 'product_events'
});

// Indexes
ProductEventSchema.index({ productId: 1, createdAt: -1 });
ProductEventSchema.index({ eventType: 1, createdAt: -1 });

// Create models
const TrackedProduct = mongoose.model('TrackedProduct', TrackedProductSchema);
const ProductEvent = mongoose.model('ProductEvent', ProductEventSchema);

// Instance methods for TrackedProduct
TrackedProductSchema.methods.updateNextCheck = function(intervalMinutes = null) {
  const interval = intervalMinutes || this.checkInterval || 5;
  this.nextCheck = new Date(Date.now() + interval * 60 * 1000);
  this.updatedAt = new Date();
  return this.save();
};

TrackedProductSchema.methods.recordError = function(errorMessage) {
  this.errorCount += 1;
  this.lastError = errorMessage;
  this.lastCheckedAt = new Date();
  this.updatedAt = new Date();
  
  // Exponential backoff for errors
  const backoffMinutes = Math.min(Math.pow(2, this.errorCount) * 5, 60); // Max 1 hour
  this.nextCheck = new Date(Date.now() + backoffMinutes * 60 * 1000);
  
  // Deactivate after too many errors
  if (this.errorCount >= 10) {
    this.isActive = false;
  }
  
  return this.save();
};

TrackedProductSchema.methods.recordSuccess = function(productData = {}) {
  // Reset error tracking
  this.errorCount = 0;
  this.lastError = null;
  this.lastCheckedAt = new Date();
  this.updatedAt = new Date();
  
  // Update product data
  if (productData.title) this.title = productData.title;
  if (productData.price !== undefined) this.price = productData.price;
  if (productData.availability) this.availability = productData.availability;
  if (productData.isAvailable !== undefined) this.isAvailable = productData.isAvailable;
  if (productData.category) this.category = productData.category;
  if (productData.affiliateLink) this.affiliateLink = productData.affiliateLink;
  
  // Schedule next check
  this.nextCheck = new Date(Date.now() + (this.checkInterval || 5) * 60 * 1000);
  
  return this.save();
};

// Static methods
TrackedProductSchema.statics.getProductsDueForCheck = function() {
  return this.find({
    isActive: true,
    $or: [
      { nextCheck: { $lte: new Date() } },
      { nextCheck: { $exists: false } }
    ]
  });
};

TrackedProductSchema.statics.getActiveProductsByCategory = function(category) {
  return this.find({
    isActive: true,
    category: category
  }).sort({ createdAt: -1 });
};

TrackedProductSchema.statics.getActiveProductsByRetailer = function(retailer) {
  return this.find({
    isActive: true,
    retailer: retailer
  }).sort({ createdAt: -1 });
};

// Virtual for display name
TrackedProductSchema.virtual('displayName').get(function() {
  return this.title || `Product ${this._id}`;
});

// Virtual for time since last check
TrackedProductSchema.virtual('timeSinceLastCheck').get(function() {
  if (!this.lastCheckedAt) return null;
  return Date.now() - this.lastCheckedAt.getTime();
});

module.exports = {
  TrackedProduct,
  ProductEvent,
  RETAILER_TYPES,
  EVENT_TYPES
};