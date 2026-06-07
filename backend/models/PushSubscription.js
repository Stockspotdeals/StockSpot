const mongoose = require('mongoose');

const pushSubscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuthUser',
    required: true
  },
  endpoint: {
    type: String,
    required: true,
    trim: true
  },
  keys: {
    p256dh: {
      type: String,
      required: true
    },
    auth: {
      type: String,
      required: true
    }
  },
  expirationTime: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

pushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

const PushSubscription = mongoose.models.PushSubscription || mongoose.model('PushSubscription', pushSubscriptionSchema);
module.exports = PushSubscription;
