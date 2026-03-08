const mongoose = require('mongoose');

const signalSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  signalType: {
    type: String,
    required: true,
    enum: ['restock', 'price-drop', 'price-increase', 'out-of-stock'],
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'sent', 'expired', 'cancelled'],
    default: 'active'
  },
  priority: {
    type: Number,
    enum: [0, 1, 2, 3], // 0=standard, 1=heavy discount, 2=restock high demand, 3=manual
    default: 0
  },
  threshold: {
    type: Number,
    default: 0
  },
  triggered: {
    type: Boolean,
    default: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: {
    previousPrice: Number,
    currentPrice: Number,
    percentChange: Number,
    previousStock: Number,
    currentStock: Number
  },
  sentAt: Date,
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
    index: true
  }
}, {
  timestamps: true,
  collection: 'signals'
});

// Indexes for performance
signalSchema.index({ status: 1 });
signalSchema.index({ productId: 1 });
signalSchema.index({ userId: 1, createdAt: -1 });
signalSchema.index({ signalType: 1, status: 1 });
signalSchema.index({ createdAt: -1 });

// Pre-save middleware to set expiration
// signalSchema.pre('save', function(next) {
//   if (this.isNew && !this.expiresAt) {
//     // Signals expire after 24 hours by default
//     this.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
//   }
//   next();
// });

module.exports = mongoose.model('Signal', signalSchema);