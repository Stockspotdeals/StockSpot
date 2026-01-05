const express = require('express');
const cors = require('cors');
const { TrackedProduct } = require('./models/TrackedProduct');
const { getWorkerInstance } = require('./workers/AutonomousMonitoringWorker');
const { CategoryDetector } = require('./services/CategoryDetector');
const { RetailerDetector } = require('./services/RetailerDetector');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Get worker instance
const worker = getWorkerInstance();

/**
 * Health check endpoint
 */
app.get('/health', async (req, res) => {
  try {
    const health = await worker.healthCheck();
    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

/**
 * Get monitoring statistics
 */
app.get('/api/stats', (req, res) => {
  try {
    const stats = worker.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get stats',
      message: error.message
    });
  }
});

/**
 * Get all tracked products
 */
app.get('/api/products', async (req, res) => {
  try {
    const products = await TrackedProduct.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100);
    
    res.json({
      products,
      count: products.length
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch products',
      message: error.message
    });
  }
});

/**
 * Add a new product to monitor
 */
app.post('/api/products', async (req, res) => {
  try {
    const { url, targetPrice, notes } = req.body;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL is required'
      });
    }

    // Detect retailer
    const retailer = RetailerDetector.detectRetailer(url);
    if (!retailer) {
      return res.status(400).json({
        error: 'Unsupported retailer'
      });
    }

    // Check if product already exists
    const existingProduct = await TrackedProduct.findOne({ url });
    if (existingProduct) {
      return res.status(400).json({
        error: 'Product is already being monitored'
      });
    }

    const product = await worker.addProduct(url, {
      retailer,
      targetPrice: targetPrice || null,
      notes: notes || ''
    });

    res.status(201).json({
      message: 'Product added successfully',
      product
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to add product',
      message: error.message
    });
  }
});

/**
 * Update a tracked product
 */
app.put('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.createdAt;
    delete updates.lastCheckedAt;
    
    const product = await TrackedProduct.findByIdAndUpdate(
      id, 
      updates, 
      { new: true }
    );

    if (!product) {
      return res.status(404).json({
        error: 'Product not found'
      });
    }

    res.json({
      message: 'Product updated successfully',
      product
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to update product',
      message: error.message
    });
  }
});

/**
 * Remove a product from monitoring
 */
app.delete('/api/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const success = await worker.removeProduct(id);
    
    if (success) {
      res.json({
        message: 'Product removed successfully'
      });
    } else {
      res.status(404).json({
        error: 'Product not found'
      });
    }

  } catch (error) {
    res.status(500).json({
      error: 'Failed to remove product',
      message: error.message
    });
  }
});

/**
 * Start monitoring system
 */
app.post('/api/monitoring/start', async (req, res) => {
  try {
    await worker.start();
    res.json({
      message: 'Monitoring started successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to start monitoring',
      message: error.message
    });
  }
});

/**
 * Stop monitoring system
 */
app.post('/api/monitoring/stop', (req, res) => {
  try {
    worker.stop();
    res.json({
      message: 'Monitoring stopped successfully'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to stop monitoring',
      message: error.message
    });
  }
});

/**
 * Force a monitoring cycle
 */
app.post('/api/monitoring/check', async (req, res) => {
  try {
    await worker.runMonitoringCycle();
    res.json({
      message: 'Monitoring cycle completed'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to run monitoring cycle',
      message: error.message
    });
  }
});

/**
 * Get supported retailers
 */
app.get('/api/retailers', (req, res) => {
  const retailers = RetailerDetector.getSupportedRetailers();
  res.json({ retailers });
});

/**
 * Get supported categories
 */
app.get('/api/categories', (req, res) => {
  const categories = CategoryDetector.getSupportedCategories();
  res.json({ categories });
});

/**
 * Analyze a URL for category and retailer
 */
app.post('/api/analyze', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({
        error: 'URL is required'
      });
    }

    const retailer = RetailerDetector.detectRetailer(url);
    const category = CategoryDetector.detectCategory('', url, '');

    res.json({
      url,
      retailer: retailer || 'unknown',
      category: category || 'other',
      supported: !!retailer
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to analyze URL',
      message: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found'
  });
});

// Start server
async function startServer() {
  try {
    // Connect to database
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/stockspot');
    console.log('✅ Connected to MongoDB');

    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 StockSpot API server running on port ${PORT}`);
    });

    // Start monitoring worker
    await worker.start();

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  worker.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down gracefully...');
  worker.stop();
  process.exit(0);
});

// Start if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app;