const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { getUserValueSummary } = require('../services/userValueEngine');

router.get('/value-summary', authenticateToken, async (req, res) => {
  try {
    const summary = await getUserValueSummary(req.user._id);
    const response = {
      success: true,
      totalEstimatedSavings: summary.totalEstimatedSavings || 0,
      totalAffiliateValue: summary.totalAffiliateValue || 0,
      totalSignalsViewed: summary.totalSignalsViewed || 0,
      topPerformingSignals: summary.topSignals || [],
      engagementScore: summary.engagementScore || 0,
      premiumInsights: null
    };

    if (req.user.subscriptionStatus === 'premium') {
      response.premiumInsights = {
        projectedEarnings: Number(((summary.totalAffiliateValue || 0) * 1.2).toFixed(2)),
        actionBreakdown: {
          views: summary.totalSignalsViewed || 0,
          clicks: summary.totalClicks || 0,
          saves: summary.totalSaves || 0,
          affiliateClicks: summary.totalAffiliateClicks || 0
        }
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Failed to fetch user value summary:', error.message);
    res.status(500).json({ success: false, error: 'Failed to fetch value summary' });
  }
});

module.exports = router;
