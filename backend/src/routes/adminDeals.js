const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const {
  publishManualDeal,
  MVP_CATEGORIES
} = require('../services/ManualDealService');

const router = express.Router();

/**
 * POST /api/admin/deals
 *
 * Publishes a manually curated deal to the StockSpot MVP feed.
 * Required: dealUrl, category (one of 8 MVP categories)
 * Optional: promoCode (string)
 *
 * Enforces the 20-active-deals-per-category cap by archiving the oldest
 * active deal in that category when a 21st deal is published.
 */
router.post(['/', '/deals'], authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { dealUrl, category, promoCode, ...extra } = req.body || {};

    const rawUrl = dealUrl || req.body?.url;
    if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim().length === 0) {
      return res.status(400).json({
        error: 'dealUrl is required'
      });
    }

    const trimmedUrl = rawUrl.trim();
    try {
      const parsedUrl = new URL(trimmedUrl);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return res.status(400).json({
          error: 'dealUrl must be a valid HTTP or HTTPS URL'
        });
      }
    } catch (err) {
      return res.status(400).json({
        error: 'dealUrl must be a valid URL'
      });
    }

    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({
        error: 'category is required'
      });
    }

    const normalizedCategory = category.trim().toLowerCase();
    if (!MVP_CATEGORIES.includes(normalizedCategory)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${MVP_CATEGORIES.join(', ')}`
      });
    }

    if (promoCode !== undefined && promoCode !== null) {
      if (typeof promoCode !== 'string') {
        return res.status(400).json({
          error: 'promoCode must be a string'
        });
      }
    }

    const trimmedPromoCode = (typeof promoCode === 'string' && promoCode.trim().length > 0)
      ? promoCode.trim()
      : undefined;

    const result = await publishManualDeal({
      dealUrl: trimmedUrl,
      url: trimmedUrl,
      category: normalizedCategory,
      promoCode: trimmedPromoCode,
      title: extra.title,
      name: extra.name,
      price: extra.price,
      originalPrice: extra.originalPrice,
      discountPercent: extra.discountPercent,
      image: extra.image,
      retailer: extra.retailer,
      affiliateLink: extra.affiliateLink
    });

    return res.status(201).json({
      success: true,
      message: 'Deal published successfully',
      deal: result.deal,
      retired: result.retired
    });
  } catch (error) {
    console.error('[AdminDeals] Error publishing deal:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    return res.status(500).json({
      error: 'Failed to publish deal',
      message: error.message
    });
  }
});

module.exports = router;
