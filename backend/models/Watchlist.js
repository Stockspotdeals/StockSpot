const mongoose = require('mongoose');

const watchlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AuthUser',
    required: true
  },
  keyword: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

watchlistSchema.index({ userId: 1, keyword: 1 }, { unique: true });

const Watchlist = mongoose.models.Watchlist || mongoose.model('Watchlist', watchlistSchema);
module.exports = Watchlist;
