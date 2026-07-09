const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/authMiddleware');
const { TrackedProduct, TRACKING_TYPES } = require('../models/TrackedProduct');
const Product = require('../models/Product');
const Signal = require('../models/Signal');
const AlertSignal = require('../models/AlertSignal');
const { RetailerDetector, RETAILER_TYPES } = require('../services/RetailerDetector');
const { ProductMonitor } = require('../services/ProductMonitor');
const { upsertProduct } = require('../services/productUpsert');

const router = express.Router();
const productMonitor = new ProductMonitor();

const TRACKED_PRODUCT_SOURCES = new Set(['auto', 'owner']);
const TRACKED_PRODUCT_CATEGORIES = new Set(['pokemon_tcg', 'one_piece_tcg', 'sports_cards', 'gaming', 'electronics', 'collectibles', 'toys', 'other']);
const TRACKED_PRODUCT_RETAILERS = new Set(Object.values(RETAILER_TYPES));
const TRACKED_PRODUCT_TRACKING_TYPES = new Set(Object.values(TRACKING_TYPES));

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeRetailer(url, requestedRetailer) {
  const detectedRetailer = RetailerDetector.detectRetailer(url);
  const requested = String(requestedRetailer || '').trim().toLowerCase();

  if (TRACKED_PRODUCT_RETAILERS.has(requested)) {
    return requested;
  }

  if (TRACKED_PRODUCT_RETAILERS.has(detectedRetailer)) {
    return detectedRetailer;
  }

  return RETAILER_TYPES.OTHER;
}

function normalizeCategory(category) {
  const normalized = String(category || '').trim().toLowerCase();
  return TRACKED_PRODUCT_CATEGORIES.has(normalized) ? normalized : 'other';
}

function normalizeSource(source) {
  const normalized = String(source || '').trim().toLowerCase();
  return TRACKED_PRODUCT_SOURCES.has(normalized) ? normalized : 'auto';
}

function buildListQuery(query) {
  const filter = {};
  const search = String(query.search || '').trim();
  const source = normalizeSource(query.source);
  const status = String(query.status || 'all').trim().toLowerCase();

  if (source === 'auto' || source === 'owner') {
    filter.source = source;
  }

  if (status === 'active') {
    filter.isActive = true;
  } else if (status === 'inactive') {
    filter.isActive = false;
  }

  if (search) {
    const regex = new RegExp(escapeRegExp(search), 'i');
    filter.$or = [
      { title: regex },
      { url: regex },
      { retailer: regex },
      { category: regex },
      { notes: regex }
    ];
  }

  return filter;
}

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
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 100);
    const skip = (page - 1) * limit;
    const filter = buildListQuery(req.query);

    const [products, total] = await Promise.all([
      TrackedProduct.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      TrackedProduct.countDocuments(filter)
    ]);

    res.json({
      products,
      page,
      limit,
      total,
      pages: Math.max(Math.ceil(total / limit), 1)
    });
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
    const { title, retailer, url, category, source, notes, trackingType } = req.body;

    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      return res.status(400).json({ error: 'url is required' });
    }

    const normalizedUrl = url.trim();
    try {
      new URL(normalizedUrl);
    } catch (err) {
      return res.status(400).json({ error: 'url must be a valid URL' });
    }

    const normalizedRetailer = normalizeRetailer(normalizedUrl, retailer);
    const normalizedCategory = normalizeCategory(category);
    const normalizedSource = normalizeSource(source || 'owner');
    const normalizedTitle = typeof title === 'string' ? title.trim() : '';
    const normalizedTrackingType = TRACKED_PRODUCT_TRACKING_TYPES.has(String(trackingType || '').trim().toLowerCase())
      ? String(trackingType).trim().toLowerCase()
      : undefined;

    const existing = await TrackedProduct.findOne({ url: normalizedUrl });
    if (existing) {
      return res.status(409).json({ error: 'Tracked product already exists for this URL' });
    }

    const trackedProduct = new TrackedProduct({
      title: normalizedTitle,
      source: normalizedSource,
      addedBy: req.user._id,
      retailer: normalizedRetailer,
      url: normalizedUrl,
      category: normalizedCategory,
      trackingType: normalizedTrackingType,
      isActive: true,
      nextCheck: new Date(),
      checkInterval: 5,
      notes: typeof notes === 'string' ? notes.trim() : ''
    });

    await trackedProduct.save();
    res.status(201).json({ trackedProduct });
  } catch (error) {
    console.error('Error creating tracked product:', error);
    res.status(500).json({ error: 'Failed to create tracked product' });
  }
});

/**
 * PATCH /api/tracked-products/:id
 * Update tracked product settings
 */
router.patch('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await TrackedProduct.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Tracked product not found' });
    }

    const update = {};

    if (typeof req.body.title === 'string') {
      update.title = req.body.title.trim();
    }

    if (typeof req.body.url === 'string' && req.body.url.trim()) {
      const normalizedUrl = req.body.url.trim();
      try {
        new URL(normalizedUrl);
      } catch (err) {
        return res.status(400).json({ error: 'url must be a valid URL' });
      }
      const duplicate = await TrackedProduct.findOne({ url: normalizedUrl, _id: { $ne: product._id } });
      if (duplicate) {
        return res.status(409).json({ error: 'Tracked product already exists for this URL' });
      }
      update.url = normalizedUrl;
      if (!req.body.retailer) {
        update.retailer = normalizeRetailer(normalizedUrl, product.retailer);
      }
    }

    if (typeof req.body.retailer === 'string' && req.body.retailer.trim()) {
      update.retailer = normalizeRetailer(update.url || product.url, req.body.retailer);
    }

    if (typeof req.body.category === 'string' && req.body.category.trim()) {
      update.category = normalizeCategory(req.body.category);
    }

    if (typeof req.body.source === 'string' && req.body.source.trim()) {
      update.source = normalizeSource(req.body.source);
    }

    if (typeof req.body.notes === 'string') {
      update.notes = req.body.notes.trim();
    }

    if (typeof req.body.trackingType === 'string' && req.body.trackingType.trim()) {
      const normalized = String(req.body.trackingType).trim().toLowerCase();
      if (TRACKED_PRODUCT_TRACKING_TYPES.has(normalized)) {
        update.trackingType = normalized;
      }
    }

    if (typeof req.body.checkInterval !== 'undefined') {
      const checkInterval = Number(req.body.checkInterval);
      if (!Number.isFinite(checkInterval) || checkInterval < 1) {
        return res.status(400).json({ error: 'checkInterval must be a positive number' });
      }
      update.checkInterval = checkInterval;
    }

    if (typeof req.body.isActive !== 'undefined') {
      update.isActive = !!req.body.isActive;
      if (update.isActive && !product.nextCheck) {
        update.nextCheck = new Date();
      }
    }

    update.updatedAt = new Date();

    const updatedProduct = await TrackedProduct.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean();
    res.json({ trackedProduct: updatedProduct });
  } catch (error) {
    console.error('Error updating tracked product:', error);
    res.status(500).json({ error: 'Failed to update tracked product' });
  }
});

/**
 * POST /api/tracked-products/:id/check
 * Force a monitoring pass for a tracked product
 */
router.post('/:id/check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const trackedProduct = await TrackedProduct.findById(req.params.id);
    if (!trackedProduct) {
      return res.status(404).json({ error: 'Tracked product not found' });
    }

    const result = await productMonitor.monitorProduct(trackedProduct);

    if (result && result.success && result.result && result.result.trackedProduct) {
      const pageType = result.pageType || (result.result.productData && result.result.productData.pageType);
      if (!pageType || pageType === 'product_page' || pageType === 'redirect') {
        await upsertProduct(result.result.trackedProduct);
      }
    }

    res.json({ ok: true, result });
  } catch (error) {
    console.error('Error forcing product check:', error);
    res.status(500).json({ error: 'Failed to force product check' });
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
