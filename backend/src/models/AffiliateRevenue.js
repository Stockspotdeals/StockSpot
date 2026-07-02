const mongoose = require('mongoose');

const affiliateRevenueSchema = new mongoose.Schema({
  signalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signal',
    required: true,
    unique: true,
    index: true
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product'
  },
  productName: {
    type: String,
    trim: true
  },
  affiliateUrl: {
    type: String,
    trim: true
  },
  estimatedCommission: {
    type: Number,
    default: 0,
    min: 0
  },
  commissionRate: {
    type: Number,
    default: 0,
    min: 0
  },
  clickCount: {
    type: Number,
    default: 0,
    min: 0
  },
  estimatedRevenueTotal: {
    type: Number,
    default: 0,
    min: 0
  },
  status: {
    type: String,
    enum: ['pending', 'tracked', 'confirmed'],
    default: 'pending'
  },
  lastClickedAt: Date,
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'affiliaterevenues'
});

affiliateRevenueSchema.index({ estimatedRevenueTotal: -1 });

module.exports = mongoose.model('AffiliateRevenue', affiliateRevenueSchema);
