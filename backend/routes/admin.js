const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { getMonitoringWorker } = require('../services/MonitoringWorker');
const { TrackedProduct, ProductEvent } = require('../models/TrackedProduct');

const router = express.Router();

/**
 * GET /api/admin/worker/status - Get worker status
 */
router.get('/worker/status', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const worker = getMonitoringWorker();
    const status = worker.getStatus();
    
    // Get additional stats from database
    const [
      totalProducts,
      activeProducts,
      failedProducts,
      totalEvents,
      recentEvents
    ] = await Promise.all([
      TrackedProduct.countDocuments(),
      TrackedProduct.countDocuments({ isActive: true, status: 'active' }),
      TrackedProduct.countDocuments({ status: 'failed' }),
      ProductEvent.countDocuments(),
      ProductEvent.find()
        .sort('-createdAt')
        .limit(10)
        .populate('productId', 'productName url')
        .lean()
    ]);
    
    res.json({
      worker: status,
      database: {
        totalProducts,
        activeProducts,
        failedProducts,
        totalEvents
      },
      recentEvents
    });
    
  } catch (error) {
    console.error('Error fetching worker status:', error);
    res.status(500).json({ error: 'Failed to fetch worker status' });
  }
});

/**
 * POST /api/admin/worker/start - Start the monitoring worker
 */
router.post('/worker/start', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const worker = getMonitoringWorker();
    
    if (worker.getStatus().hasJob) {
      return res.status(400).json({ error: 'Worker is already running' });
    }
    
    worker.start();
    
    res.json({ 
      message: 'Monitoring worker started successfully',
      status: worker.getStatus()
    });
    
  } catch (error) {
    console.error('Error starting worker:', error);
    res.status(500).json({ error: 'Failed to start worker' });
  }
});

/**
 * POST /api/admin/worker/stop - Stop the monitoring worker
 */
router.post('/worker/stop', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const worker = getMonitoringWorker();
    
    if (!worker.getStatus().hasJob) {
      return res.status(400).json({ error: 'Worker is not running' });
    }
    
    worker.stop();
    
    res.json({ 
      message: 'Monitoring worker stopped successfully',
      status: worker.getStatus()
    });
    
  } catch (error) {
    console.error('Error stopping worker:', error);
    res.status(500).json({ error: 'Failed to stop worker' });
  }
});

/**
 * POST /api/admin/worker/force-run - Force run a monitoring cycle
 */
router.post('/worker/force-run', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const worker = getMonitoringWorker();
    
    if (worker.getStatus().isRunning) {
      return res.status(400).json({ error: 'Worker is already running a cycle' });
    }
    
    // Run in background and return immediately
    worker.forceRun().catch(error => {
      console.error('Force run failed:', error);
    });
    
    res.json({ 
      message: 'Monitoring cycle started',
      status: worker.getStatus()
    });
    
  } catch (error) {
    console.error('Error forcing worker run:', error);
    res.status(500).json({ error: 'Failed to start monitoring cycle' });
  }
});

/**
 * POST /api/admin/worker/reset-stats - Reset worker statistics
 */
router.post('/worker/reset-stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const worker = getMonitoringWorker();
    worker.resetStats();
    
    res.json({ 
      message: 'Worker statistics reset successfully',
      status: worker.getStatus()
    });
    
  } catch (error) {
    console.error('Error resetting stats:', error);
    res.status(500).json({ error: 'Failed to reset statistics' });
  }
});

/**
 * GET /api/admin/products - Get all products (admin view)
 */
router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      status, 
      retailer, 
      userId, 
      sort = '-createdAt' 
    } = req.query;
    
    const filter = {};
    
    if (status) filter.status = status;
    if (retailer) filter.retailer = retailer;
    if (userId) filter.userId = userId;
    
    const products = await TrackedProduct.find(filter)
      .populate('userId', 'email plan')
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
    console.error('Error fetching admin products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/admin/stats - Get system statistics
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [
      // Product stats
      productStats,
      retailerStats,
      statusStats,
      
      // Event stats
      eventStats,
      recentEvents,
      
      // User stats
      userStats
    ] = await Promise.all([
      // Product aggregations
      TrackedProduct.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
            inStock: { $sum: { $cond: ['$isAvailable', 1, 0] } },
            withTargetPrice: { $sum: { $cond: [{ $ne: ['$targetPrice', null] }, 1, 0] } },
            avgCheckInterval: { $avg: '$checkInterval' },
            avgPrice: { $avg: '$currentPrice' }
          }
        }
      ]),
      
      // Retailer breakdown
      TrackedProduct.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$retailer', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Status breakdown
      TrackedProduct.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Event type breakdown
      ProductEvent.aggregate([
        { $group: { _id: '$eventType', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      // Recent significant events
      ProductEvent.find({ 
        eventType: { $in: ['restock', 'target_price_reached'] } 
      })
      .sort('-createdAt')
      .limit(20)
      .populate('productId', 'productName url userId')
      .lean(),
      
      // User plan breakdown (would need User model)
      TrackedProduct.aggregate([
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'user'
          }
        },
        { $unwind: '$user' },
        { $group: { _id: '$user.plan', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
    ]);
    
    res.json({
      products: productStats[0] || {
        total: 0,
        active: 0,
        inStock: 0,
        withTargetPrice: 0,
        avgCheckInterval: 0,
        avgPrice: 0
      },
      retailers: retailerStats,
      statuses: statusStats,
      events: {
        byType: eventStats,
        recent: recentEvents,
        total: await ProductEvent.countDocuments()
      },
      users: {
        byPlan: userStats,
        total: await TrackedProduct.distinct('userId').then(users => users.length)
      }
    });
    
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * POST /api/admin/products/:id/force-check - Force check any product (admin)
 */
router.post('/products/:id/force-check', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await TrackedProduct.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const { ProductMonitor } = require('../services/ProductMonitor');
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
 * DELETE /api/admin/products/:id - Delete product (admin)
 */
router.delete('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const product = await TrackedProduct.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Hard delete for admin
    await TrackedProduct.findByIdAndDelete(req.params.id);
    await ProductEvent.deleteMany({ productId: req.params.id });
    
    res.json({ message: 'Product and all events deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

/**
 * POST /api/admin/cleanup - Run cleanup operations
 */
router.post('/cleanup', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { days = 30, dryRun = false } = req.body;
    
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Count what would be cleaned
    const oldEventsCount = await ProductEvent.countDocuments({
      createdAt: { $lt: cutoffDate }
    });
    
    const inactiveProductsCount = await TrackedProduct.countDocuments({
      isActive: false,
      status: 'failed',
      lastChecked: { $lt: cutoffDate }
    });
    
    if (dryRun) {
      return res.json({
        message: 'Dry run complete',
        wouldDelete: {
          events: oldEventsCount,
          inactiveProducts: inactiveProductsCount
        }
      });
    }
    
    // Perform cleanup
    const deletedEvents = await ProductEvent.deleteMany({
      createdAt: { $lt: cutoffDate }
    });
    
    const updatedProducts = await TrackedProduct.deleteMany({
      isActive: false,
      status: 'failed',
      lastChecked: { $lt: cutoffDate }
    });
    
    res.json({
      message: 'Cleanup completed',
      deleted: {
        events: deletedEvents.deletedCount,
        products: updatedProducts.deletedCount
      }
    });
    
  } catch (error) {
    console.error('Error during cleanup:', error);
    res.status(500).json({ error: 'Failed to perform cleanup' });
  }
});

module.exports = router;