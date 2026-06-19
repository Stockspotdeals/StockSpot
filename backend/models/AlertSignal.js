const mongoose = require('mongoose');

const alertSignalSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true,
    trim: true
  },
  store: {
    type: String,
    required: true,
    enum: ['Amazon', 'Best Buy', 'Target', 'Walmart', 'Newegg', 'Micro Center', 'Other']
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  originalPrice: {
    type: Number,
    min: 0
  },
  signalType: {
    type: String,
    required: true,
    enum: ['restock', 'price-drop', 'reseller']
  },
  affiliateUrl: {
    type: String,
    trim: true
  },
  premiumOnly: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    trim: true
  },
  score: {
    type: Number,
    default: 50,
    min: 0,
    max: 100,
    index: true
  },
  tier: {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    default: 'MEDIUM',
    index: true
  },
  confidence: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  reasoning: {
    type: String,
    trim: true,
    default: ''
  },
  imageUrl: {
    type: String,
    trim: true
  },
  sourceSignalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signal',
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  plan: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    default: 'free',
    index: true
  },
  queueLane: {
    type: String,
    enum: ['high', 'medium', 'low', 'none'],
    default: 'none',
    index: true
  },
  deliveryMode: {
    type: String,
    enum: ['immediate', 'batched', 'suppressed'],
    default: 'batched'
  },
  dispatchStatus: {
    type: String,
    enum: ['pending', 'processing', 'dispatched', 'suppressed', 'failed'],
    default: 'pending',
    index: true
  },
  dispatchedChannels: [{
    type: String,
    enum: ['email', 'dashboard', 'webhook']
  }],
  lastDispatchedAt: {
    type: Date,
    default: null
  },
  nextDispatchAt: {
    type: Date,
    default: null,
    index: true
  },
  lastDispatchError: {
    type: String,
    trim: true,
    default: null
  },
  dispatchAttemptCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastDispatchKey: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  dispatchLockedAt: {
    type: Date,
    default: null,
    index: true
  },
  dispatchLeaseExpiresAt: {
    type: Date,
    default: null,
    index: true
  },
  dedupeWindowStart: {
    type: Date,
    index: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now
  }
}, {
  timestamps: true,
  collection: 'alert_signals'
});

// Indexes for performance
alertSignalSchema.index({ signalType: 1, premiumOnly: 1 });
alertSignalSchema.index({ store: 1 });
alertSignalSchema.index({ createdAt: -1 });
alertSignalSchema.index({ expiresAt: 1 });
alertSignalSchema.index({ dispatchStatus: 1, nextDispatchAt: 1 });
alertSignalSchema.index({ queueLane: 1, dispatchStatus: 1, nextDispatchAt: 1 });
alertSignalSchema.index({ userId: 1, plan: 1, createdAt: -1 });
alertSignalSchema.index({ productName: 1, store: 1, signalType: 1, dedupeWindowStart: 1 }, { unique: true });

// Virtual for discount percentage
alertSignalSchema.virtual('discountPercent').get(function() {
  if (this.originalPrice && this.originalPrice > this.price) {
    return Math.round(((this.originalPrice - this.price) / this.originalPrice) * 100);
  }
  return 0;
});

// Method to check if signal is expired
alertSignalSchema.methods.isExpired = function() {
  return new Date() > this.expiresAt;
};

// Static method to clean expired signals
alertSignalSchema.statics.cleanExpired = async function() {
  const result = await this.deleteMany({ expiresAt: { $lt: new Date() } });
  return result.deletedCount;
};

module.exports = mongoose.model('AlertSignal', alertSignalSchema);