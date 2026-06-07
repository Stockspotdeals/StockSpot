const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const Watchlist = require('../models/Watchlist');

// GET /api/watchlist - Current user's watchlist keywords
router.get('/', authenticateToken, async (req, res) => {
  try {
    const list = await Watchlist.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, watchlist: list });
  } catch (error) {
    console.error('Failed to load watchlist:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load watchlist' });
  }
});

// POST /api/watchlist - Add new watchlist keyword
router.post('/', authenticateToken, async (req, res) => {
  try {
    const keyword = String(req.body.keyword || '').trim().toLowerCase();
    if (!keyword) {
      return res.status(400).json({ success: false, error: 'Keyword is required' });
    }

    const watchlistCount = await Watchlist.countDocuments({ userId: req.user._id });
    const isFreeUser = req.user.subscriptionStatus !== 'premium';
    if (isFreeUser && watchlistCount >= 5) {
      return res.status(403).json({
        success: false,
        error: 'Free users can only save up to 5 watchlist keywords. Upgrade to premium for unlimited watchlists.'
      });
    }

    const existing = await Watchlist.findOne({
      userId: req.user._id,
      keyword
    });

    if (existing) {
      return res.status(409).json({ success: false, error: 'Keyword already exists in your watchlist' });
    }

    const item = await Watchlist.create({
      userId: req.user._id,
      keyword
    });

    res.status(201).json({ success: true, watchlist: item });
  } catch (error) {
    console.error('Failed to add watchlist keyword:', error.message);
    res.status(500).json({ success: false, error: 'Failed to add watchlist keyword' });
  }
});

// DELETE /api/watchlist/:id - Remove a watchlist keyword
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const item = await Watchlist.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Watchlist item not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove watchlist item:', error.message);
    res.status(500).json({ success: false, error: 'Failed to remove watchlist item' });
  }
});

module.exports = router;
