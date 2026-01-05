const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const { RetailerDetector } = require('../services/RetailerDetector');
const { ProductMonitor } = require('../services/ProductMonitor');
const { TrackedProduct, ProductEvent, PRODUCT_STATUSES } = require('../models/TrackedProduct');

const router = express.Router();

/**
 * GET /api/products - Get user's tracked products
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, retailer, sort = '-createdAt' } = req.query;
    
    const filter = { userId: req.user.userId };
    
    if (status) {
      filter.status = status;
    }
    
    if (retailer) {
      filter.retailer = retailer;
    }
    
    const products = await TrackedProduct.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    const total = await TrackedProduct.countDocuments(filter);
    
    res.json({
      products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * POST /api/products - Add a new product to track
 */
router.post('/', authenticateToken, rateLimiter, async (req, res) => {
  try {
    const { url, targetPrice, checkInterval = 60, notificationPreferences } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Product URL is required' });
    }
    
    // Detect retailer
    const retailer = RetailerDetector.detectRetailer(url);
    
    // Validate URL format
    if (!RetailerDetector.isValidProductUrl(url, retailer)) {
      return res.status(400).json({ error: 'Invalid product URL format' });
    }
    
    // Normalize URL
    const normalizedUrl = RetailerDetector.normalizeUrl(url, retailer);
    const productId = RetailerDetector.extractProductId(normalizedUrl, retailer);
    
    // Check if product is already being tracked by this user
    const existingProduct = await TrackedProduct.findOne({
      userId: req.user.userId,
      productId,
      retailer
    });
    
    if (existingProduct) {
      return res.status(409).json({ 
        error: 'Product is already being tracked',
        existingProduct: existingProduct._id
      });
    }
    
    // Check user's plan limits
    const userProductCount = await TrackedProduct.countDocuments({ 
      userId: req.user.userId, 
      isActive: true 
    });
    
    const limits = {
      free: 5,
      paid: 50,
      admin: 1000
    };
    
    const userLimit = limits[req.user.plan] || limits.free;
    
    if (userProductCount >= userLimit) {
      return res.status(429).json({ 
        error: `Plan limit reached. ${req.user.plan} plan allows ${userLimit} products.`,
        currentCount: userProductCount,
        limit: userLimit
      });
    }
    
    // Initial product scrape to get current data
    const productMonitor = new ProductMonitor();
    let initialData = null;
    
    try {
      const retailerConfig = RetailerDetector.getRetailerConfig(retailer);
      initialData = await productMonitor.scrapeProduct(normalizedUrl, retailerConfig);
    } catch (error) {
      console.log('Initial scrape failed, will retry later:', error.message);
    }
    
    // Create tracked product
    const trackedProduct = new TrackedProduct({
      userId: req.user.userId,
      url: normalizedUrl,
      originalUrl: url,
      productId,
      retailer,
      targetPrice: targetPrice || null,
      checkInterval: Math.max(checkInterval, 15), // Minimum 15 minutes
      productName: initialData?.title || 'Unknown Product',
      currentPrice: initialData?.price || null,
      availability: initialData?.availability || 'Unknown',
      isAvailable: initialData?.isAvailable || false,
      status: PRODUCT_STATUSES.ACTIVE,
      isActive: true,
      lastChecked: initialData ? new Date() : null,
      nextCheck: new Date(Date.now() + checkInterval * 60 * 1000),
      notificationPreferences: {
        restock: notificationPreferences?.restock !== false,
        priceChange: notificationPreferences?.priceChange !== false,
        targetPrice: notificationPreferences?.targetPrice !== false,
        ...notificationPreferences
      }
    });
    
    await trackedProduct.save();
    
    // Create initial event if we got data
    if (initialData) {
      await ProductEvent.create({
        productId: trackedProduct._id,
        eventType: 'product_added',
        description: 'Product added to tracking',
        metadata: {
          initialPrice: initialData.price,
          initialAvailability: initialData.isAvailable,
          retailer
        }
      });
    }
    
    res.status(201).json({
      message: 'Product added to tracking',
      product: trackedProduct,
      initialData
    });
    
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Failed to add product to tracking' });
  }
});

/**
 * GET /api/products/:id - Get specific tracked product
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await TrackedProduct.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Get recent events for this product
    const events = await ProductEvent.find({ productId: product._id })
      .sort('-createdAt')
      .limit(20)
      .lean();
    
    res.json({
      product,
      events
    });
    
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

/**
 * PATCH /api/products/:id - Update tracked product settings
 */
router.patch('/:id', authenticateToken, rateLimiter, async (req, res) => {
  try {
    const { targetPrice, checkInterval, notificationPreferences, isActive } = req.body;
    
    const product = await TrackedProduct.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const updates = {};
    
    if (targetPrice !== undefined) {
      updates.targetPrice = targetPrice;
    }
    
    if (checkInterval !== undefined) {
      updates.checkInterval = Math.max(checkInterval, 15);
      // Recalculate next check
      updates.nextCheck = new Date(Date.now() + updates.checkInterval * 60 * 1000);
    }
    
    if (notificationPreferences) {
      updates.notificationPreferences = {
        ...product.notificationPreferences,
        ...notificationPreferences
      };
    }
    
    if (isActive !== undefined) {
      updates.isActive = isActive;
      if (!isActive) {
        updates.status = PRODUCT_STATUSES.PAUSED;
      } else if (product.status === PRODUCT_STATUSES.PAUSED) {
        updates.status = PRODUCT_STATUSES.ACTIVE;
      }
    }
    
    const updatedProduct = await TrackedProduct.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );
    
    // Log update event
    await ProductEvent.create({
      productId: product._id,
      eventType: 'settings_updated',
      description: 'Product settings updated',
      metadata: { updates }
    });
    
    res.json({
      message: 'Product updated successfully',
      product: updatedProduct
    });
    
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

/**
 * DELETE /api/products/:id - Remove product from tracking
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const product = await TrackedProduct.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Soft delete - mark as inactive instead of removing
    await TrackedProduct.findByIdAndUpdate(req.params.id, {
      isActive: false,
      status: PRODUCT_STATUSES.DELETED,
      deletedAt: new Date()
    });
    
    // Log deletion event
    await ProductEvent.create({
      productId: product._id,
      eventType: 'product_deleted',
      description: 'Product removed from tracking'
    });
    
    res.json({ message: 'Product removed from tracking' });
    
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to remove product' });
  }
});

/**
 * POST /api/products/:id/check - Force check a specific product
 */
router.post('/:id/check', authenticateToken, rateLimiter, async (req, res) => {
  try {
    const product = await TrackedProduct.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    if (!product.isActive) {
      return res.status(400).json({ error: 'Product is not active' });
    }
    
    const productMonitor = new ProductMonitor();
    const result = await productMonitor.monitorProduct(product);
    
    res.json({
      message: 'Product checked successfully',
      changes: result.changes,
      productData: result.productData,
      product: result.trackedProduct
    });
    
  } catch (error) {
    console.error('Error checking product:', error);
    res.status(500).json({ error: 'Failed to check product' });
  }
});

/**
 * GET /api/products/:id/events - Get product event history
 */
router.get('/:id/events', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, eventType } = req.query;
    
    // Verify user owns the product
    const product = await TrackedProduct.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const filter = { productId: req.params.id };
    if (eventType) {
      filter.eventType = eventType;
    }
    
    const events = await ProductEvent.find(filter)
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();
    
    const total = await ProductEvent.countDocuments(filter);
    
    res.json({
      events,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/products/stats - Get user's tracking statistics
 */
router.get('/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const [
      totalProducts,
      activeProducts,
      inStockProducts,
      recentEvents
    ] = await Promise.all([
      TrackedProduct.countDocuments({ userId }),
      TrackedProduct.countDocuments({ userId, isActive: true }),
      TrackedProduct.countDocuments({ userId, isActive: true, isAvailable: true }),
      ProductEvent.aggregate([
        {
          $lookup: {
            from: 'trackedproducts',
            localField: 'productId',
            foreignField: '_id',
            as: 'product'
          }
        },
        {
          $match: {
            'product.userId': req.user.userId,
            eventType: { $in: ['restock', 'target_price_reached', 'price_change'] }
          }
        },
        {
          $sort: { createdAt: -1 }
        },
        {
          $limit: 10
        }
      ])
    ]);
    
    // Get retailer breakdown
    const retailerStats = await TrackedProduct.aggregate([
      { $match: { userId: req.user.userId, isActive: true } },
      { $group: { _id: '$retailer', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      stats: {
        totalProducts,
        activeProducts,
        inactiveProducts: totalProducts - activeProducts,
        inStockProducts,
        outOfStockProducts: activeProducts - inStockProducts
      },
      retailerBreakdown: retailerStats,
      recentEvents,
      planLimits: {
        free: 5,
        paid: 50,
        admin: 1000
      },
      currentPlan: req.user.plan,
      remaining: {
        free: 5,
        paid: 50,
        admin: 1000
      }[req.user.plan] - activeProducts
    });
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

module.exports = router;