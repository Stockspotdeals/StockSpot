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
    this.productId = options.productId || null; // Retailer-specific product ID
    this.title = options.title || null;
    this.imageUrl = options.imageUrl || null;
    
    // Tracking settings
    this.monitoringFrequency = options.monitoringFrequency || MONITORING_FREQUENCY.MEDIUM;
    this.customInterval = options.customInterval || null;
    this.desiredPrice = options.desiredPrice || null;
    this.priceDropThreshold = options.priceDropThreshold || 0.05; // 5% drop
    
    // Current state
    this.status = PRODUCT_STATUS.ACTIVE;
    this.lastKnownStockStatus = STOCK_STATUS.UNKNOWN;
    this.lastKnownPrice = null;
    this.lastChecked = null;
    this.nextCheck = new Date();
    
    // Error tracking
    this.consecutiveErrors = 0;
    this.lastError = null;
    this.lastErrorTime = null;
    
    // Metadata
    this.createdAt = new Date();
    this.updatedAt = new Date();
    this.pausedAt = null;
    this.pausedBy = null;
  }

  updateState(stockStatus, price, title = null, imageUrl = null) {
    const now = new Date();
    const previousStock = this.lastKnownStockStatus;
    const previousPrice = this.lastKnownPrice;
    
    // Update basic info
    if (title) this.title = title;
    if (imageUrl) this.imageUrl = imageUrl;
    
    // Update tracking state
    this.lastKnownStockStatus = stockStatus;
    this.lastKnownPrice = price;
    this.lastChecked = now;
    this.updatedAt = now;
    
    // Calculate next check time
    this.calculateNextCheck();
    
    // Reset error counter on successful check
    this.consecutiveErrors = 0;
    this.lastError = null;
    this.lastErrorTime = null;
    
    // Generate events for significant changes
    const events = [];
    
    // Stock status change events
    if (previousStock && previousStock !== stockStatus) {
      if (previousStock === STOCK_STATUS.OUT_OF_STOCK && stockStatus === STOCK_STATUS.IN_STOCK) {
        events.push(this.createEvent(EVENT_TYPES.RESTOCK, previousStock, stockStatus));
      } else if (stockStatus === STOCK_STATUS.OUT_OF_STOCK) {
        events.push(this.createEvent(EVENT_TYPES.OUT_OF_STOCK, previousStock, stockStatus));
      }
    }
    
    // Price change events
    if (previousPrice && price && previousPrice !== price) {
      const priceChange = (price - previousPrice) / previousPrice;
      
      if (priceChange <= -this.priceDropThreshold) {
        events.push(this.createEvent(EVENT_TYPES.PRICE_DROP, previousPrice, price));
      } else if (priceChange > 0.02) { // 2% increase
        events.push(this.createEvent(EVENT_TYPES.PRICE_INCREASE, previousPrice, price));
      }
    }
    
    return events;
  }

  recordError(error) {
    this.consecutiveErrors++;
    this.lastError = error.message || error.toString();
    this.lastErrorTime = new Date();
    this.updatedAt = new Date();
    
    // Increase monitoring interval on repeated errors
    if (this.consecutiveErrors >= 5) {
      this.status = PRODUCT_STATUS.ERROR;
      this.calculateNextCheck(true); // Use backoff
    } else {
      this.calculateNextCheck();
    }
    
    return this.createEvent(EVENT_TYPES.ERROR, null, this.lastError);
  }

  calculateNextCheck(useBackoff = false) {
    let intervalSeconds = this.monitoringFrequency;
    
    if (this.monitoringFrequency === MONITORING_FREQUENCY.CUSTOM && this.customInterval) {
      intervalSeconds = this.customInterval;
    }
    
    // Apply exponential backoff for errors
    if (useBackoff && this.consecutiveErrors > 0) {
      const backoffMultiplier = Math.min(Math.pow(2, this.consecutiveErrors - 1), 16); // Max 16x
      intervalSeconds *= backoffMultiplier;
    }
    
    this.nextCheck = new Date(Date.now() + intervalSeconds * 1000);
  }

  pause(pausedBy = null) {
    if (this.status === PRODUCT_STATUS.ACTIVE) {
      this.status = PRODUCT_STATUS.PAUSED;
      this.pausedAt = new Date();
      this.pausedBy = pausedBy;
      this.updatedAt = new Date();
      
      return this.createEvent(EVENT_TYPES.PAUSED, PRODUCT_STATUS.ACTIVE, PRODUCT_STATUS.PAUSED);
    }
    return null;
  }

  resume() {
    if (this.status === PRODUCT_STATUS.PAUSED) {
      this.status = PRODUCT_STATUS.ACTIVE;
      this.pausedAt = null;
      this.pausedBy = null;
      this.updatedAt = new Date();
      this.calculateNextCheck();
      
      return this.createEvent(EVENT_TYPES.RESUMED, PRODUCT_STATUS.PAUSED, PRODUCT_STATUS.ACTIVE);
    }
    return null;
  }

  createEvent(type, oldValue, newValue) {
    return new ProductEvent(this.id, type, oldValue, newValue);
  }

  isDueForCheck() {
    return this.status === PRODUCT_STATUS.ACTIVE && new Date() >= this.nextCheck;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      productUrl: this.productUrl,
      retailer: this.retailer,
      productId: this.productId,
      title: this.title,
      imageUrl: this.imageUrl,
      monitoringFrequency: this.monitoringFrequency,
      customInterval: this.customInterval,
      desiredPrice: this.desiredPrice,
      priceDropThreshold: this.priceDropThreshold,
      status: this.status,
      lastKnownStockStatus: this.lastKnownStockStatus,
      lastKnownPrice: this.lastKnownPrice,
      lastChecked: this.lastChecked,
      nextCheck: this.nextCheck,
      consecutiveErrors: this.consecutiveErrors,
      lastError: this.lastError,
      lastErrorTime: this.lastErrorTime,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      pausedAt: this.pausedAt,
      pausedBy: this.pausedBy
    };
  }
}

class ProductEvent {
  constructor(productId, type, oldValue, newValue) {
    this.id = productEventIdCounter++;
    this.productId = productId;
    this.type = type;
    this.oldValue = oldValue;
    this.newValue = newValue;
    this.timestamp = new Date();
    this.metadata = {};
  }

  addMetadata(key, value) {
    this.metadata[key] = value;
  }

  toJSON() {
    return {
      id: this.id,
      productId: this.productId,
      type: this.type,
      oldValue: this.oldValue,
      newValue: this.newValue,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
}

// In-memory operations (replace with database in production)
const TrackedProductModel = {
  create: async (userId, productUrl, options = {}) => {
    const product = new TrackedProduct(userId, productUrl, options);
    trackedProducts.push(product);
    
    // Create initial event
    const createdEvent = product.createEvent(EVENT_TYPES.CREATED, null, 'Product tracking started');
    productEvents.push(createdEvent);
    
    return product;
  },

  findById: async (id) => {
    return trackedProducts.find(p => p.id === parseInt(id)) || null;
  },

  findByUserId: async (userId, options = {}) => {
    let userProducts = trackedProducts.filter(p => p.userId === userId);
    
    if (options.status) {
      userProducts = userProducts.filter(p => p.status === options.status);
    }
    
    if (options.retailer) {
      userProducts = userProducts.filter(p => p.retailer === options.retailer);
    }
    
    // Apply pagination
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const total = userProducts.length;
    const products = userProducts.slice(offset, offset + limit);
    
    return { products, total };
  },

  findDueForCheck: async (limit = 100) => {
    return trackedProducts
      .filter(p => p.isDueForCheck())
      .sort((a, b) => a.nextCheck - b.nextCheck)
      .slice(0, limit);
  },

  findByUrl: async (userId, productUrl) => {
    return trackedProducts.find(p => p.userId === userId && p.productUrl === productUrl) || null;
  },

  update: async (id, updates) => {
    const product = await TrackedProductModel.findById(id);
    if (!product) return null;
    
    Object.keys(updates).forEach(key => {
      if (key !== 'id' && key !== 'userId' && key !== 'createdAt') {
        product[key] = updates[key];
      }
    });
    
    product.updatedAt = new Date();
    return product;
  },

  delete: async (id) => {
    const index = trackedProducts.findIndex(p => p.id === parseInt(id));
    if (index === -1) return null;
    
    const [deletedProduct] = trackedProducts.splice(index, 1);
    
    // Remove associated events
    for (let i = productEvents.length - 1; i >= 0; i--) {
      if (productEvents[i].productId === parseInt(id)) {
        productEvents.splice(i, 1);
      }
    }
    
    return deletedProduct;
  },

  getActiveCount: async (userId) => {
    return trackedProducts.filter(p => p.userId === userId && p.status === PRODUCT_STATUS.ACTIVE).length;
  }
};

const ProductEventModel = {
  create: async (productId, type, oldValue, newValue) => {
    const event = new ProductEvent(productId, type, oldValue, newValue);
    productEvents.push(event);
    return event;
  },

  findByProductId: async (productId, options = {}) => {
    let events = productEvents.filter(e => e.productId === productId);
    
    if (options.type) {
      events = events.filter(e => e.type === options.type);
    }
    
    // Sort by timestamp descending (newest first)
    events.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply pagination
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const total = events.length;
    const results = events.slice(offset, offset + limit);
    
    return { events: results, total };
  },

  findByUserId: async (userId, options = {}) => {
    const userProducts = trackedProducts
      .filter(p => p.userId === userId)
      .map(p => p.id);
    
    let events = productEvents.filter(e => userProducts.includes(e.productId));
    
    if (options.type) {
      events = events.filter(e => e.type === options.type);
    }
    
    if (options.since) {
      events = events.filter(e => e.timestamp >= options.since);
    }
    
    // Sort by timestamp descending
    events.sort((a, b) => b.timestamp - a.timestamp);
    
    // Apply pagination
    const limit = options.limit || 50;
    const offset = options.offset || 0;
    const total = events.length;
    const results = events.slice(offset, offset + limit);
    
    return { events: results, total };
  }
};

module.exports = {
  TrackedProduct,
  ProductEvent,
  TrackedProductModel,
  ProductEventModel,
  RETAILER_TYPES,
  MONITORING_FREQUENCY,
  PRODUCT_STATUS,
  STOCK_STATUS,
  EVENT_TYPES
};