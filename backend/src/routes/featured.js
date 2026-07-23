/**
 * Featured Deals API Routes
 *
 * GET /api/featured             — All sections for homepage
 * GET /api/featured/hot         — Hot deals
 * GET /api/featured/restocks    — Restock signals
 * GET /api/featured/trending    — Trending products
 * GET /api/featured/category/:category — By category
 */

const express = require('express');
const router = express.Router();
const { getFeaturedDealsEngine } = require('../services/FeaturedDealsEngine');
const FeaturedProduct = require('../models/FeaturedProduct');

const engine = getFeaturedDealsEngine();

/**
 * GET /api/featured
 * Returns all sections for homepage rendering.
 */
router.get('/', async (req, res) => {
  try {
    const data = await engine.getAllSections();
    res.json({
      success: true,
      ...data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[FeaturedAPI] Error getting all sections:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/featured/hot
 * Returns highest-scoring featured products.
 */
router.get('/hot', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 24;
    const items = await engine.getBySection('hot', limit);
    res.json({ success: true, count: items.length, items, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/featured/restocks
 * Returns products with active restock signals.
 */
router.get('/restocks', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 24;
    const items = await engine.getBySection('restocks', limit);
    res.json({ success: true, count: items.length, items, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/featured/trending
 * Returns trending products.
 */
router.get('/trending', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 24;
    const items = await engine.getBySection('trending', limit);
    res.json({ success: true, count: items.length, items, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/featured/category/:category
 * Returns featured products filtered by category.
 */
router.get('/category/:category', async (req, res) => {
  try {
    const { category } = req.params;
    const limit = parseInt(req.query.limit) || 24;
    const items = await FeaturedProduct.find({
      category: { $regex: new RegExp(category, 'i') },
      expiresAt: { $gt: new Date() }
    })
      .sort({ featuredScore: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, count: items.length, items, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/featured/stats
 * Returns engine stats.
 */
router.get('/stats', async (req, res) => {
  try {
    res.json({ success: true, stats: engine.getStats(), timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/featured/refresh
 * Admin-only: manually trigger feed refresh.
 */
router.post('/refresh', async (req, res) => {
  try {
    const count = await engine.refreshFeaturedFeed();
    res.json({ success: true, refreshed: count, timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;