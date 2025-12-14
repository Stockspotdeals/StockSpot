/**
 * StockSpot Backend Server
 * Production-ready Express.js server for serving the React frontend
 * and handling API calls for the StockSpot deal discovery platform.
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

// Load environment variables
dotenv.config();

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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

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
];

const optionalEnvVars = [
  'TWITTER_CLIENT_ID',
  'TWITTER_CLIENT_SECRET',
  'AMAZON_ACCESS_KEY',
  'AMAZON_SECRET_KEY',
  'URLGENIUS_API_KEY',
  'JWT_SECRET',
  'FRONTEND_URL',
  'DATABASE_URL',
  'REDIS_URL'
];

console.log('🔧 Environment Configuration:');
console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
console.log(`PORT: ${PORT}`);

// API Routes
// =============================================================================

/**
 * Health Check Endpoint
 * Returns server status and basic system information
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: require('./package.json').version
  });
});

/**
 * API Info Endpoint
 * Returns available API endpoints and their descriptions
 */
app.get('/api/info', (req, res) => {
  res.json({
    name: 'StockSpot API',
    version: require('./package.json').version,
    description: 'Smart Deal Discovery and Affiliate Marketing Platform',
    endpoints: {
      'GET /api/health': 'Health check endpoint',
      'GET /api/info': 'API information',
      'GET /api/deals': 'Get latest deals (TODO: implement)',
      'POST /api/deals': 'Create new deal (TODO: implement)',
      'GET /api/analytics': 'Get analytics data (TODO: implement)',
      'POST /api/twitter/post': 'Post to Twitter (TODO: implement)',
      'GET /api/amazon/products': 'Search Amazon products (TODO: implement)'
    }
  });
});

// =============================================================================
// TODO: Add StockSpot API endpoints here
// =============================================================================

/**
 * Deals Management API
 * Handle deal discovery, creation, and management
 */
app.get('/api/deals', async (req, res) => {
  try {
    // TODO: Implement deal fetching logic
    // - Connect to database/storage
    // - Apply filters and pagination
    // - Return formatted deal data
    
    res.json({
      deals: [],
      total: 0,
      page: 1,
      limit: 20,
      message: 'Deal fetching not yet implemented'
    });
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/deals', async (req, res) => {
  try {
    // TODO: Implement deal creation logic
    // - Validate deal data
    // - Save to database
    // - Trigger affiliate link processing
    // - Queue for social media posting
    
    const { title, description, price, url, category } = req.body;
    
    res.status(201).json({
      message: 'Deal creation not yet implemented',
      receivedData: { title, description, price, url, category }
    });
  } catch (error) {
    console.error('Error creating deal:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Analytics API
 * Handle analytics data and reporting
 */
app.get('/api/analytics', async (req, res) => {
  try {
    // TODO: Implement analytics logic
    // - Fetch click tracking data
    // - Calculate conversion rates
    // - Generate revenue reports
    // - Return dashboard metrics
    
    res.json({
      totalClicks: 0,
      totalRevenue: 0,
      conversionRate: 0,
      topDeals: [],
      message: 'Analytics not yet implemented'
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Twitter API Integration
 * Handle social media posting and management
 */
app.post('/api/twitter/post', async (req, res) => {
  try {
    // TODO: Implement Twitter posting logic
    // - Validate Twitter credentials
    // - Format deal content for Twitter
    // - Post to Twitter API
    // - Store posting results
    
    const { content, dealId } = req.body;
    
    if (!process.env.TWITTER_CLIENT_ID) {
      return res.status(400).json({ error: 'Twitter credentials not configured' });
    }
    
    res.json({
      message: 'Twitter posting not yet implemented',
      receivedData: { content, dealId }
    });
  } catch (error) {
    console.error('Error posting to Twitter:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Amazon API Integration
 * Handle product search and affiliate link generation
 */
app.get('/api/amazon/products', async (req, res) => {
  try {
    // TODO: Implement Amazon product search
    // - Validate Amazon API credentials
    // - Search products using Amazon PA-API
    // - Generate affiliate links
    // - Return product data with affiliate links
    
    const { query, category, minPrice, maxPrice } = req.query;
    
    if (!process.env.AMAZON_ACCESS_KEY) {
      return res.status(400).json({ error: 'Amazon API credentials not configured' });
    }
    
    res.json({
      products: [],
      total: 0,
      query,
      message: 'Amazon product search not yet implemented'
    });
  } catch (error) {
    console.error('Error searching Amazon products:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * URL Genius API Integration
 * Handle link shortening and tracking
 */
app.post('/api/links/shorten', async (req, res) => {
  try {
    // TODO: Implement URL shortening with URL Genius
    // - Validate URL Genius API key
    // - Shorten and track links
    // - Store shortened URLs
    // - Return tracking data
    
    const { originalUrl, campaignName } = req.body;
    
    if (!process.env.URLGENIUS_API_KEY) {
      return res.status(400).json({ error: 'URL Genius API key not configured' });
    }
    
    res.json({
      shortenedUrl: originalUrl, // Placeholder
      trackingId: 'temp-' + Date.now(),
      message: 'URL shortening not yet implemented'
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
  }
  
  const missingOptional = optionalEnvVars.filter(v => !process.env[v]);
  if (missingOptional.length > 0) {
    console.warn('💡 Optional environment variables not set:', missingOptional.join(', '));
    console.warn('   Some features may not work until these are configured.');
  }
  
  console.log('✅ Server ready to accept connections');
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