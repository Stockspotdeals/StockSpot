/**
 * StockSpot Backend Server
 * Production-ready Express.js server with authentication for the StockSpot platform
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

// Import auth components
const authRoutes = require('./backend/routes/authRoutes');
const userRoutes = require('./backend/routes/userRoutes');
const { globalRateLimit, createPlanBasedRateLimit, featureUsageLimit } = require('./backend/middleware/rateLimitMiddleware');
const { authenticateToken, optionalAuthentication, requirePlan } = require('./backend/middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      connectSrc: ["'self'", "https://api.twitter.com", "https://webservices.amazon.com"]
    }
  }
}));

// Rate limiting
app.use('/api/', globalRateLimit);

// Middleware
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Environment variables validation
const requiredEnvVars = [
  'NODE_ENV',
  'JWT_SECRET'
];

const optionalEnvVars = [
  'TWITTER_API_KEY',
  'TWITTER_API_SECRET',
  'TWITTER_ACCESS_TOKEN',
  'TWITTER_ACCESS_TOKEN_SECRET',
  'TWITTER_BEARER_TOKEN',
  'AMAZON_ACCESS_KEY',
  'AMAZON_SECRET_KEY',
  'AMAZON_ASSOCIATE_ID',
  'URLGENIUS_API_KEY',
  'FRONTEND_URL',
  'DATABASE_URL',
  'REDIS_URL'
];

console.log('🔧 Environment Configuration:');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`PORT: ${PORT}`);

// Authentication Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// API Routes with Authentication
// =============================================================================

/**
 * Health Check Endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version,
    auth: 'enabled'
  });
});

/**
 * API Info Endpoint
 */
app.get('/api/info', (req, res) => {
  res.json({
    name: 'StockSpot API',
    version: require('./package.json').version,
    description: 'Smart Deal Discovery and Affiliate Marketing Platform with Authentication',
    endpoints: {
      'POST /api/auth/register': 'Register new user',
      'POST /api/auth/login': 'User login',
      'POST /api/auth/refresh': 'Refresh access token',
      'POST /api/auth/logout': 'User logout',
      'GET /api/auth/profile': 'Get user profile',
      'PUT /api/auth/profile': 'Update user profile',
      'GET /api/users': 'Get all users (admin)',
      'GET /api/users/:id': 'Get user by ID',
      'GET /api/health': 'Health check endpoint',
      'GET /api/info': 'API information',
      'GET /api/deals': 'Get latest deals (authenticated)',
      'POST /api/deals': 'Create new deal (authenticated)',
      'GET /api/analytics': 'Get analytics data (authenticated)',
      'POST /api/twitter/post': 'Post to Twitter (authenticated)',
      'GET /api/amazon/products': 'Search Amazon products (authenticated)'
    }
  });
});

// =============================================================================
// TODO: Add StockSpot API endpoints here
// =============================================================================

/**
 * Deals Management API (Protected Routes)
 */
app.get('/api/deals', authenticateToken, createPlanBasedRateLimit(), async (req, res) => {
  try {
    const { page = 1, limit = 20, category, minPrice, maxPrice } = req.query;
    
    // Increment API usage
    req.user.incrementApiCall();
    
    // TODO: Implement deal fetching logic with user context
    // - Connect to database/storage
    // - Apply user-specific filters
    // - Apply plan-based limits
    // - Return formatted deal data
    
    res.json({
      deals: [],
      total: 0,
      page: parseInt(page),
      limit: parseInt(limit),
      user: {
        id: req.user.id,
        plan: req.user.plan
      },
      message: 'Deal fetching not yet implemented (authenticated)'
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/deals', authenticateToken, featureUsageLimit('create_deal'), async (req, res) => {
  try {
    const { title, description, price, url, category } = req.body;
    
    // Increment usage counters
    req.user.incrementApiCall();
    req.user.incrementDeal();
    
    // TODO: Implement deal creation logic
    // - Validate deal data
    // - Save to database with user ID
    // - Apply plan-based limits
    // - Trigger affiliate link processing
    // - Queue for social media posting
    
    res.status(201).json({
      message: 'Deal creation not yet implemented (authenticated)',
      receivedData: { title, description, price, url, category },
      user: {
        id: req.user.id,
        plan: req.user.plan,
        usage: req.user.usage
      }
    });
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Analytics API (Protected Route)
 */
app.get('/api/analytics', authenticateToken, createPlanBasedRateLimit(), async (req, res) => {
  try {
    const { timeframe = '30d' } = req.query;
    
    // Increment API usage
    req.user.incrementApiCall();
    
    // TODO: Implement analytics logic with user context
    // - Fetch user-specific click tracking data
    // - Calculate conversion rates for user's deals
    // - Generate revenue reports
    // - Apply plan-based access to advanced metrics
    // - Return dashboard metrics
    
    const isPremium = req.user.plan === 'paid' || req.user.plan === 'admin';
    
    res.json({
      totalClicks: 0,
      totalRevenue: 0,
      conversionRate: 0,
      topDeals: [],
      timeframe,
      user: {
        id: req.user.id,
        plan: req.user.plan
      },
      premiumFeatures: isPremium ? {
        detailedMetrics: [],
        customReports: [],
        exportData: true
      } : null,
      message: 'Analytics not yet implemented (authenticated)'
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Twitter API Integration (Protected Route)
 */
app.post('/api/twitter/post', authenticateToken, featureUsageLimit('create_alert'), async (req, res) => {
  try {
    const { content, dealId } = req.body;
    
    if (!process.env.TWITTER_API_KEY) {
      return res.status(400).json({ error: 'Twitter credentials not configured' });
    }
    
    // Increment usage counters
    req.user.incrementApiCall();
    req.user.incrementAlert();
    
    // TODO: Implement Twitter posting logic
    // - Validate Twitter credentials
    // - Format deal content for Twitter
    // - Post to Twitter API with user attribution
    // - Store posting results linked to user
    // - Apply plan-based posting limits
    
    res.json({
      message: 'Twitter posting not yet implemented (authenticated)',
      receivedData: { content, dealId },
      user: {
        id: req.user.id,
        plan: req.user.plan,
        usage: req.user.usage
      }
    });
  } catch (error) {
    console.error('Error posting to Twitter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Amazon API Integration (Protected Route)
 */
app.get('/api/amazon/products', authenticateToken, createPlanBasedRateLimit(), async (req, res) => {
  try {
    const { query, category, minPrice, maxPrice } = req.query;
    
    if (!process.env.AMAZON_ACCESS_KEY) {
      return res.status(400).json({ error: 'Amazon API credentials not configured' });
    }
    
    // Increment API usage
    req.user.incrementApiCall();
    
    // TODO: Implement Amazon product search with user context
    // - Validate Amazon API credentials
    // - Search products using Amazon PA-API
    // - Generate affiliate links with user tracking
    // - Apply plan-based search limits
    // - Return product data with affiliate links
    
    res.json({
      products: [],
      total: 0,
      query,
      user: {
        id: req.user.id,
        plan: req.user.plan
      },
      message: 'Amazon product search not yet implemented (authenticated)'
    });
  } catch (error) {
    console.error('Error searching Amazon products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * URL Shortening API Integration (Protected Route)
 */
app.post('/api/links/shorten', authenticateToken, createPlanBasedRateLimit(), async (req, res) => {
  try {
    const { originalUrl, campaignName } = req.body;
    
    if (!process.env.URLGENIUS_API_KEY) {
      return res.status(400).json({ error: 'URL Genius API key not configured' });
    }
    
    // Increment API usage
    req.user.incrementApiCall();
    
    // TODO: Implement URL shortening with user context
    // - Validate URL Genius API key
    // - Shorten and track links with user attribution
    // - Store shortened URLs linked to user
    // - Apply plan-based link limits
    // - Return tracking data
    
    res.json({
      shortenedUrl: originalUrl, // Placeholder
      trackingId: 'temp-' + Date.now(),
      user: {
        id: req.user.id,
        plan: req.user.plan
      },
      message: 'URL shortening not yet implemented (authenticated)'
    });
  } catch (error) {
    console.error('Error shortening URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =============================================================================
// Frontend Serving
// =============================================================================

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, 'frontend/build')));

// Serve legacy static files for backward compatibility
app.use('/static', express.static(path.join(__dirname, 'static')));

// Handle client-side routing - send all non-API requests to React app
app.get('*', (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  res.sendFile(path.join(__dirname, 'frontend/build/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 StockSpot Backend Server Started');
  console.log(`📍 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📚 API info: http://localhost:${PORT}/api/info`);
  console.log('');
  
  // Environment variables check
  const missingRequired = requiredEnvVars.filter(v => !process.env[v]);
  if (missingRequired.length > 0) {
    console.warn('⚠️  Missing required environment variables:', missingRequired.join(', '));
    console.warn('   Authentication system requires these variables to function properly.');
  }
  
  const missingOptional = optionalEnvVars.filter(v => !process.env[v]);
  if (missingOptional.length > 0) {
    console.warn('💡 Optional environment variables not set:', missingOptional.join(', '));
    console.warn('   Some features may not work until these are configured.');
  }
  
  console.log('✅ StockSpot Backend Server with Authentication ready');
  console.log('🔐 Authentication endpoints available at /api/auth/*');
  console.log('👥 User management endpoints available at /api/users/*');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully');
  process.exit(0);
});