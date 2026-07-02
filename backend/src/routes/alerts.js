const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const Alert = require('../models/Alert');

// GET /api/alerts - Recent alert history for the authenticated user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

    const alerts = await Alert.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('signalId');

    const formatted = alerts.map(alert => ({
      id: alert._id,
      keyword: alert.keyword,
      delivered: alert.delivered,
      createdAt: alert.createdAt,
      signal: alert.signalId ? {
        id: alert.signalId._id,
        productName: alert.signalId.productName || alert.signalId.title,
        price: alert.signalId.price,
        originalPrice: alert.signalId.originalPrice,
        store: alert.signalId.store,
        signalType: alert.signalId.signalType,
        affiliateUrl: alert.signalId.affiliateUrl,
        description: alert.signalId.description,
        score: alert.signalId.score
      } : null
    }));

    res.json({ success: true, alerts: formatted });
  } catch (error) {
    console.error('Failed to load alerts:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load alerts' });
  }
});

module.exports = router;
