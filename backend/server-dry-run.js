/**
 * Dry-Run Server
 * Express server for dry-run mode testing
 * No real credentials required - uses multi-retailer feeds
 */

const express = require('express');
const cors = require('cors');
const FeedGenerator = require('./feeds/FeedGenerator');
const MockDataGenerator = require('./tests/MockDataGenerator');
const TierManager = require('./tiers/TierManager');
const { MultiRetailerFeed } = require('./services/MultiRetailerFeed');

const app = express();

// Initialize multi-retailer feed system
const multiRetailerFeed = new MultiRetailerFeed();


// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================================================
// HEALTH & STATUS ENDPOINTS
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'dry-run',
    timestamp: new Date().toISOString(),
    environment: 'test',
  });
});

app.get('/status', (req, res) => {
  res.json({
    app: 'StockSpot',
    version: '2.0.0',
    mode: 'DRY_RUN',
    tiers: ['free', 'paid', 'yearly'],
    retailers: ['amazon', 'walmart', 'target', 'bestbuy', 'gamestop', 'ebay'],
    categories: [
      'pokemon-tcg',
      'one-piece-tcg',
      'sports-cards',
      'limited-exclusive',
      'hype-items',
    ],
  });
});

// ============================================================================
// FEED ENDPOINTS
// ============================================================================

/**
 * GET /api/feed
 * Get feed based on tier
 * Query params: tier (free|paid|yearly), retailer (optional), category (optional)
 */
app.get('/api/feed', (req, res) => {
  try {
    const tier = req.query.tier || 'free';
    const retailerFilter = req.query.retailer;
    const categoryFilter = req.query.category;

    // Validate tier
    if (!TierManager.isValidTier(tier)) {
      return res.status(400).json({ error: `Invalid tier: ${tier}` });
    }

    // Get mock data
    let items = MockDataGenerator.generateMockItems();

    // Apply filters
    if (retailerFilter) {
      items = items.filter((i) => i.retailer.toLowerCase() === retailerFilter.toLowerCase());
    }
    if (categoryFilter) {
      items = items.filter((i) => i.category.toLowerCase() === categoryFilter.toLowerCase());
    }

    // Process for tier
    const feed = FeedGenerator.processFeedItems(items, tier);

    // Filter visible items
    const visibleFeed = feed.filter((i) => i.visible);

    res.json({
      tier,
      retailerFilter: retailerFilter || 'all',
      categoryFilter: categoryFilter || 'all',
      totalItems: visibleFeed.length,
      items: visibleFeed,
    });
  } catch (error) {
    console.error('Error fetching feed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/retailers
 * Get available retailers and their config
 */
app.get('/api/retailers', (req, res) => {
  try {
    const retailers = MockDataGenerator.getRetailerConfig();
    res.json({
      retailers,
      count: Object.keys(retailers).length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/categories
 * Get available categories
 */
app.get('/api/categories', (req, res) => {
  try {
    const RetailerMonitor = require('./monitors/RetailerMonitor');
    const categories = Object.values(RetailerMonitor.CATEGORIES);
    res.json({
      categories,
      count: categories.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// RSS FEED ENDPOINT
// ============================================================================

/**
 * GET /rss.xml
 * Generate RSS feed
 * Query params: tier (free|paid|yearly), limit (default 20)
 */
app.get('/rss.xml', (req, res) => {
  try {
    const tier = req.query.tier || 'free';
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    // Get mock data
    const items = MockDataGenerator.generateMockItems();
    const feed = FeedGenerator.processFeedItems(items, tier);
    const visibleFeed = feed.filter((i) => i.visible).slice(0, limit);

    // Generate RSS
    const rss = FeedGenerator.generateRSSFeed(visibleFeed, {
      title: `StockSpot - ${tier} Tier Feed`,
      description: `Real-time product alerts (${tier} tier)`,
      link: 'http://localhost:3000',
    });

    res.type('application/rss+xml').send(rss);
  } catch (error) {
    console.error('Error generating RSS:', error);
    res.status(500).type('text/plain').send(`Error: ${error.message}`);
  }
});

// ============================================================================
// TIER ENDPOINTS
// ============================================================================

/**
 * GET /api/tiers
 * Get all tier information
 */
app.get('/api/tiers', (req, res) => {
  try {
    res.json({
      tiers: TierManager.TIERS,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tier/check
 * Check user tier features
 * Body: { tier: "free|paid|yearly", features: ["manualInput", "emailNotifications", ...] }
 */
app.post('/api/tier/check', (req, res) => {
  try {
    const { tier, features } = req.body;

    if (!tier) {
      return res.status(400).json({ error: 'Missing tier' });
    }

    if (!TierManager.isValidTier(tier)) {
      return res.status(400).json({ error: `Invalid tier: ${tier}` });
    }

    const access = {};
    if (features && Array.isArray(features)) {
      features.forEach((feature) => {
        access[feature] = TierManager.canAccess(tier, feature);
      });
    }

    res.json({
      tier,
      access,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MANUAL INPUT ENDPOINTS (Yearly Tier Only)
// ============================================================================

// In-memory storage for dry-run
const manualItems = {};

/**
 * POST /api/manual-items
 * Add manual item to monitor (yearly tier only)
 * Body: { tier: "yearly", retailer: "amazon|walmart|...", url: "...", name: "..." }
 */
app.post('/api/manual-items', (req, res) => {
  try {
    const { tier, retailer, url, name } = req.body;

    if (!tier || !TierManager.canManualInput(tier)) {
      return res.status(403).json({
        error: 'Manual input only available for yearly tier',
      });
    }

    if (!retailer || !url) {
      return res.status(400).json({
        error: 'Missing retailer or url',
      });
    }

    const id = `manual-${Date.now()}`;
    manualItems[id] = {
      id,
      tier,
      retailer,
      url,
      name: name || 'Custom Monitor',
      createdAt: new Date().toISOString(),
    };

    res.json({
      success: true,
      item: manualItems[id],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/manual-items
 * Get all manual items for a tier
 * Query params: tier
 */
app.get('/api/manual-items', (req, res) => {
  try {
    const { tier } = req.query;

    if (!tier || !TierManager.canManualInput(tier)) {
      return res.status(403).json({
        error: 'Manual input only available for yearly tier',
      });
    }

    const items = Object.values(manualItems).filter((i) => i.tier === tier);
    res.json({
      tier,
      items,
      count: items.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/manual-items/:id
 * Remove manual item
 */
app.delete('/api/manual-items/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { tier } = req.query;

    if (!tier || !TierManager.canManualInput(tier)) {
      return res.status(403).json({
        error: 'Manual input only available for yearly tier',
      });
    }

    if (manualItems[id]) {
      delete manualItems[id];
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Item not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// MOCK USERS ENDPOINT (for testing)
// ============================================================================

/**
 * GET /api/demo-users
 * Get mock user data for testing
 */
app.get('/api/demo-users', (req, res) => {
  try {
    const users = MockDataGenerator.generateMockUsers();
    res.json({
      users,
      count: users.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// 404 Handler
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    method: req.method,
  });
});

// ============================================================================
// Error Handler
// ============================================================================

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: err.message,
  });
});

// ============================================================================
// START SERVER
// ============================================================================

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 STOCKSPOT DRY-RUN SERVER');
  console.log('='.repeat(60));
  console.log(`📍 Running on: http://localhost:${PORT}`);
  console.log('🔧 Mode: DRY-RUN (no credentials required)');
  console.log('\nAvailable Endpoints:');
  console.log('  GET  /health               - Health check');
  console.log('  GET  /status               - Server status');
  console.log('  GET  /api/feed             - Get feed items');
  console.log('  GET  /api/retailers        - Get retailers');
  console.log('  GET  /api/categories       - Get categories');
  console.log('  GET  /api/tiers            - Get tier info');
  console.log('  POST /api/tier/check       - Check tier access');
  console.log('  GET  /rss.xml              - RSS feed');
  console.log('  POST /api/manual-items     - Add manual item (yearly only)');
  console.log('  GET  /api/manual-items     - Get manual items (yearly only)');
  console.log('  GET  /api/demo-users       - Get demo users');
  console.log('='.repeat(60) + '\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');
  server.close(() => {
    console.log('✓ Server closed');
    process.exit(0);
  });
});

module.exports = app;
