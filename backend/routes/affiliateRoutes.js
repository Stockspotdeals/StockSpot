const express = require('express');
const router = express.Router();
const { optionalAuthentication } = require('../middleware/authMiddleware');
const AffiliateClick = require('../models/AffiliateClick');
const AffiliateRevenue = require('../models/AffiliateRevenue');
const Signal = require('../models/Signal');
const { recordInteraction } = require('../services/userValueEngine');

router.post('/click', optionalAuthentication, async (req, res) => {
  try {
    const { signalId, affiliateUrl } = req.body;

    if (!signalId || !affiliateUrl) {
      return res.status(400).json({
        success: false,
        error: 'signalId and affiliateUrl are required for click tracking'
      });
    }

    const clickRecord = await AffiliateClick.create({
      signalId,
      affiliateUrl,
      userId: req.user ? req.user._id : undefined,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      referrer: req.get('Referrer') || req.get('Referer') || null,
      clickAt: new Date()
    });

    const signal = await Signal.findById(signalId).lean();
    if (signal) {
      const estimatedCommission = Number(signal.estimatedCommission || 0);
      await AffiliateRevenue.findOneAndUpdate(
        { signalId: signal._id },
        {
          $set: {
            productId: signal.productId,
            productName: signal.productName,
            affiliateUrl: affiliateUrl,
            estimatedCommission,
            commissionRate: Number(signal.metadata?.affiliate?.commissionRate || 0),
            lastClickedAt: new Date(),
            status: 'tracked'
          },
          $inc: {
            clickCount: 1,
            estimatedRevenueTotal: estimatedCommission
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (req.user) {
        await recordInteraction({
          userId: req.user._id,
          signalId: signal._id,
          actionType: 'affiliateClick',
          estimatedValue: estimatedCommission,
          metadata: { affiliateUrl }
        });
      }
    }

    return res.json({ success: true, clickId: clickRecord._id });
  } catch (error) {
    console.error('Affiliate click tracking failed:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to track affiliate click' });
  }
});

module.exports = router;
