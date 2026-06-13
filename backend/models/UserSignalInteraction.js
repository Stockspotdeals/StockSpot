const mongoose = require('mongoose');

const userSignalInteractionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuthUser'
  },
  signalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signal'
  },
  actionType: {
    type: String,
    required: true,
    enum: ['view', 'click', 'save', 'affiliateClick'],
    index: true
  },
  timestamp: {
    type: Date,
    default: () => new Date(),
    index: true
  },
  estimatedValue: {
    type: Number,
    default: 0,
    min: 0
  },
  metadata: {
    type: Object,
    default: {}
  }
}, {
  timestamps: true,
  collection: 'usersignalinteractions'
});

userSignalInteractionSchema.index({ userId: 1, actionType: 1, timestamp: -1 });
userSignalInteractionSchema.index({ signalId: 1 });

module.exports = mongoose.models.UserSignalInteraction || mongoose.model('UserSignalInteraction', userSignalInteractionSchema);
