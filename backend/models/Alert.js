const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuthUser',
    required: true
  },
  signalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Signal',
    required: true
  },
  keyword: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  delivered: {
    type: Boolean,
    default: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

alertSchema.index({ userId: 1, signalId: 1, keyword: 1 }, { unique: true });
alertSchema.index({ userId: 1, createdAt: -1 });

const Alert = mongoose.models.Alert || mongoose.model('Alert', alertSchema);
module.exports = Alert;
