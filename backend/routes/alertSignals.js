const express = require('express');
const router = express.Router();
const AlertSignal = require('../models/AlertSignal');
const { authenticateToken } = require('../middleware/authMiddleware');

// GET /api/alert-signals - Get latest signals for dashboard
router.get('/', authenticateToken, async (req, res) => {
  try {
    const user = req.user;
    const isPremium = user && user.subscriptionStatus === 'premium';

    // Build query based on user status
    const query = {
      expiresAt: { $gt: new Date() }, // Only non-expired signals
      tier: { $in: ['HIGH', 'MEDIUM'] }
    };

    // If not premium, only show non-premium signals
    if (!isPremium) {
      query.premiumOnly = false;
    }

    const signals = await AlertSignal.find(query)
      .sort({ createdAt: -1 })
      .limit(25)
      .lean(); // Use lean for better performance

    // Transform to dashboard format
    const formattedSignals = signals.map(signal => ({
      id: signal._id,
      name: signal.productName,
      productName: signal.productName,
      store: signal.store,
      price: signal.price,
      originalPrice: signal.originalPrice,
      signalType: signal.signalType,
      type: signal.signalType,
      affiliateUrl: signal.affiliateUrl,
      premiumOnly: signal.premiumOnly,
      description: signal.description,
      score: signal.score,
      tier: signal.tier,
      confidence: signal.confidence,
      reasoning: signal.reasoning,
      imageUrl: signal.imageUrl,
      dispatchStatus: signal.dispatchStatus,
      discountPercent: signal.originalPrice ?
        Math.round(((signal.originalPrice - signal.price) / signal.originalPrice) * 100) : 0,
      createdAt: signal.createdAt
    }));

    res.json(formattedSignals);

  } catch (error) {
    console.error('Error fetching alert signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch signals'
    });
  }
});

// POST /api/alert-signals/mock-seed - Create mock signals for testing
router.post('/mock-seed', async (req, res) => {
  try {
    // Clean expired signals first
    const expiredCount = await AlertSignal.cleanExpired();

    // Mock signal data
    const mockSignals = [
      {
        productName: 'NVIDIA RTX 4080 Super Graphics Card',
        store: 'Best Buy',
        price: 899.99,
        originalPrice: 999.99,
        signalType: 'price-drop',
        affiliateUrl: 'https://bestbuy.com/rtx4080',
        premiumOnly: false,
        description: 'Major price drop on flagship GPU'
      },
      {
        productName: 'Sony WH-1000XM5 Wireless Headphones',
        store: 'Amazon',
        price: 299.99,
        originalPrice: 399.99,
        signalType: 'price-drop',
        affiliateUrl: 'https://amazon.com/sony-headphones',
        premiumOnly: false,
        description: 'Premium noise-canceling headphones at discount'
      },
      {
        productName: 'MacBook Pro M3 14-inch',
        store: 'Best Buy',
        price: 1999.99,
        originalPrice: 1999.99,
        signalType: 'restock',
        affiliateUrl: 'https://bestbuy.com/macbook-pro',
        premiumOnly: true,
        description: 'Back in stock - limited availability'
      },
      {
        productName: 'Samsung 990 EVO 2TB NVMe SSD',
        store: 'Newegg',
        price: 149.99,
        originalPrice: 179.99,
        signalType: 'price-drop',
        affiliateUrl: 'https://newegg.com/samsung-ssd',
        premiumOnly: false,
        description: 'Fast SSD at great price'
      },
      {
        productName: 'Logitech MX Master 3S Mouse',
        store: 'Amazon',
        price: 79.99,
        originalPrice: 99.99,
        signalType: 'reseller',
        affiliateUrl: 'https://amazon.com/logitech-mouse',
        premiumOnly: true,
        description: 'Authorized reseller deal'
      },
      {
        productName: 'ASUS ROG Strix Gaming Monitor 27"',
        store: 'Best Buy',
        price: 449.99,
        originalPrice: 549.99,
        signalType: 'price-drop',
        affiliateUrl: 'https://bestbuy.com/asus-monitor',
        premiumOnly: false,
        description: '144Hz gaming monitor on sale'
      }
    ];

    // Insert mock signals
    const insertedSignals = await AlertSignal.insertMany(mockSignals);

    res.json({
      success: true,
      message: `Created ${insertedSignals.length} mock signals, cleaned ${expiredCount} expired signals`,
      signals: insertedSignals.map(s => ({
        id: s._id,
        productName: s.productName,
        signalType: s.signalType,
        premiumOnly: s.premiumOnly
      }))
    });

  } catch (error) {
    console.error('Error seeding mock signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed mock signals',
      details: error.message
    });
  }
});

// POST /api/alert-signals - Create new alert signal (admin/internal use)
router.post('/', async (req, res) => {
  try {
    const signalData = req.body;

    // Validate required fields
    const requiredFields = ['productName', 'store', 'price', 'signalType'];
    for (const field of requiredFields) {
      if (!signalData[field]) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`
        });
      }
    }

    const newSignal = new AlertSignal(signalData);
    await newSignal.save();

    res.status(201).json({
      success: true,
      signal: newSignal
    });

  } catch (error) {
    console.error('Error creating alert signal:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create signal'
    });
  }
});

// DELETE /api/alert-signals/expired - Clean expired signals
router.delete('/expired', async (req, res) => {
  try {
    const deletedCount = await AlertSignal.cleanExpired();

    res.json({
      success: true,
      message: `Cleaned ${deletedCount} expired signals`
    });

  } catch (error) {
    console.error('Error cleaning expired signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clean expired signals'
    });
  }
});

module.exports = router;