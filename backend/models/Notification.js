const mongoose = require('mongoose');

const CHANNEL_TYPES = {
  REDDIT: 'reddit'
};

const DELIVERY_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

const EVENT_TYPES = {
  RESTOCK: 'restock',
  PRICE_DROP: 'price_drop',
  TARGET_PRICE: 'target_price',
  ERROR: 'error'
};

const notificationChannelSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  channelType: {
    type: String,
    enum: Object.values(CHANNEL_TYPES),
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  displayName: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  verificationToken: String,
  verificationExpires: Date,
  configuration: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lastUsed: Date,
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

notificationChannelSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

notificationChannelSchema.index({ userId: 1, channelType: 1 });
notificationChannelSchema.index({ userId: 1, isActive: 1 });

const notificationEventSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TrackedProduct',
    required: true,
    index: true
  },
  channelId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'NotificationChannel',
    required: true
  },
  eventType: {
    type: String,
    enum: Object.values(EVENT_TYPES),
    required: true,
    index: true
  },
  deliveryStatus: {
    type: String,
    enum: Object.values(DELIVERY_STATUS),
    default: DELIVERY_STATUS.PENDING,
    index: true
  },
  message: {
    subject: String,
    body: String,
    html: String,
    metadata: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  deliveryAttempts: {
    type: Number,
    default: 0
  },
  lastAttempt: Date,
  sentAt: Date,
  failureReason: String,
  externalId: String,
  deduplicationKey: {
    type: String,
    unique: true,
    sparse: true
  },
  scheduledFor: {
    type: Date,
    default: Date.now,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

notificationEventSchema.index({ userId: 1, eventType: 1, createdAt: -1 });
notificationEventSchema.index({ deliveryStatus: 1, scheduledFor: 1 });
notificationEventSchema.index({ productId: 1, eventType: 1, createdAt: -1 });
notificationEventSchema.index({ deduplicationKey: 1 }, { unique: true, sparse: true });

notificationEventSchema.methods.generateDeduplicationKey = function() {
  return `${this.userId}_${this.productId}_${this.eventType}_${this.channelId}_${new Date().toISOString().split('T')[0]}`;
};

notificationEventSchema.methods.markSent = function(externalId = null) {
  this.deliveryStatus = DELIVERY_STATUS.SENT;
  this.sentAt = new Date();
  this.externalId = externalId;
  return this.save();
};

notificationEventSchema.methods.markFailed = function(reason) {
  this.deliveryStatus = DELIVERY_STATUS.FAILED;
  this.failureReason = reason;
  this.lastAttempt = new Date();
  this.deliveryAttempts += 1;
  return this.save();
};

const NotificationChannel = mongoose.model('NotificationChannel', notificationChannelSchema);
const NotificationEvent = mongoose.model('NotificationEvent', notificationEventSchema);

module.exports = {
  NotificationChannel,
  NotificationEvent,
  CHANNEL_TYPES,
  DELIVERY_STATUS,
  EVENT_TYPES
};