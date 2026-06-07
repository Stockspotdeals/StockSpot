const mongoose = require('mongoose');

const affiliateClickSchema = new mongoose.Schema({
  signalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signal',
    required: true,
    index: true
  },
  affiliateUrl: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuthUser'
  },
  ipAddress: {
    type: String,
    trim: true
  },
  userAgent: {
    type: String,
    trim: true
  },
  referrer: {
    type: String,
    trim: true
  },
  clickAt: {
    type: Date,
    default: () => new Date()
  }
}, {
  timestamps: true,
  collection: 'affiliateclicks'
});

affiliateClickSchema.index({ clickAt: -1 });

module.exports = mongoose.model('AffiliateClick', affiliateClickSchema);
