const express = require('express');
const {
  getActiveManualDeals,
  MVP_CATEGORIES
} = require('../services/ManualDealService');

const router = express.Router();

/**
 * GET /api/deals
 *
 * Public, read-only feed of active manually curated deals (newest first).
 * Archived deals are excluded automatically by getActiveManualDeals()
 * ({ archivedAt: null } matches both missing and null — no migration needed).
 *
 * Optional query params:
 *   - category: one of the 8 MVP categories (validated, 400 on invalid)
 *   - limit: 1-50, default 24
 *   - skip: >= 0, default 0
 *
 * Returns raw lean Product docs — no fields are fabricated server-side.
 */
router.get('/', async (req, res) => {
  try {
    const { category } = req.query;
    let normalizedCategory;
    if (typeof category === 'string' && category.trim().length > 0) {
      normalizedCategory = category.trim().toLowerCase();
      if (!MVP_CATEGORIES.includes(normalizedCategory)) {
        return res.status(400).json({
          error: `Invalid category. Must be one of: ${MVP_CATEGORIES.join(', ')}`
        });
      }
    }

    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 24;
    const parsedSkip = parseInt(req.query.skip, 10);
    const skip = Number.isFinite(parsedSkip) && parsedSkip > 0 ? parsedSkip : 0;

    const deals = await getActiveManualDeals({ category: normalizedCategory, limit, skip });

    return res.json({
      success: true,
      count: deals.length,
      deals,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[ManualDeals] Error listing deals:', error);
    return res.status(500).json({ error: 'Failed to load deals' });
  }
});

module.exports = router;