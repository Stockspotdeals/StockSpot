const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { TrackedProduct } = require('../models/TrackedProduct');
const Product = require('../models/Product');
const Signal = require('../models/Signal');
const AlertSignal = require('../models/AlertSignal');

const router = express.Router();

/**
 * GET /api/tracked-products/status
 * Pipeline counts for owner dashboard status panel
 */
router.get('/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [trackedProductCount, productCount, signalCount, alertSignalCount] = await Promise.all([
      TrackedProduct.countDocuments(),
      Product.countDocuments(),
      Signal.countDocuments(),
      AlertSignal.countDocuments({ expiresAt: { $gt: new Date() } })
    ]);
    res.json({ trackedProductCount, productCount, signalCount, alertSignalCount });
  } catch (error) {
    console.error('Error fetching pipeline status:', error);
    res.status(500).json({ error: 'Failed to fetch pipeline status' });
  }
});

/**
 * GET /api/tracked-products
 * List tracked products for admin review
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const products = await TrackedProduct.find().sort({ createdAt: -1 }).lean();
    res.json({ products });
  } catch (error) {
    console.error('Error listing tracked products:', error);
    res.status(500).json({ error: 'Failed to list tracked products' });
  }
});

/**
 * POST /api/tracked-products
 * Add a new tracked product
 */
router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, retailer, url, category } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'title is required' });
    }
    if (!retailer || typeof retailer !== 'string' || retailer.trim().length === 0) {
      return res.status(400).json({ error: 'retailer is required' });
    }
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return res.status(400).json({ error: 'url is required' });
    }
    if (!category || typeof category !== 'string' || category.trim().length === 0) {
      return res.status(400).json({ error: 'category is required' });
    }

    const normalizedUrl = url.trim();
    try {
      new URL(normalizedUrl);
    } catch (err) {
      return res.status(400).json({ error: 'url must be a valid URL' });
    }

    const existing = await TrackedProduct.findOne({ url: normalizedUrl });
    if (existing) {
      return res.status(409).json({ error: 'Tracked product already exists for this URL' });
    }

    const trackedProduct = new TrackedProduct({
      title: title.trim(),
      retailer: retailer.trim(),
      url: normalizedUrl,
      category: category.trim(),
      isActive: true,
      nextCheck: new Date(),
      checkInterval: 5
    });

    await trackedProduct.save();
    res.status(201).json({ trackedProduct });
  } catch (error) {
    console.error('Error creating tracked product:', error);
    res.status(500).json({ error: 'Failed to create tracked product' });
  }
});

/**
 * DELETE /api/tracked-products/:id
 * Remove a tracked product
 */
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await TrackedProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Tracked product not found' });
    }

    await TrackedProduct.findByIdAndDelete(req.params.id);
    res.json({ message: 'Tracked product deleted successfully' });
  } catch (error) {
    console.error('Error deleting tracked product:', error);
    res.status(500).json({ error: 'Failed to delete tracked product' });
  }
});

module.exports = router;
