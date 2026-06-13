const mongoose = require('mongoose');

const userValueSummarySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuthUser',
    required: true,
    unique: true
  },
  totalEstimatedSavings: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAffiliateValue: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSignalsViewed: {
    type: Number,
    default: 0,
    min: 0
  },
  totalClicks: {
    type: Number,
    default: 0,
    min: 0
  },
  totalSaves: {
    type: Number,
    default: 0,
    min: 0
  },
  totalAffiliateClicks: {
    type: Number,
    default: 0,
    min: 0
  },
  engagementScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  topSignals: {
    type: [
      {
        signalId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Signal'
        },
        title: String,
        store: String,
        actionType: String,
        value: Number,
        lastInteractedAt: Date
      }
    ],
    default: []
  }
}, {
  timestamps: true,
  collection: 'uservalueSummaries'
});

userValueSummarySchema.index({ engagementScore: -1 });

module.exports = mongoose.models.UserValueSummary || mongoose.model('UserValueSummary', userValueSummarySchema);
