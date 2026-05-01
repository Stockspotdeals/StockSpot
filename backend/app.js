console.log('Initializing server...');
console.log('Connecting to MongoDB...');

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
require('dotenv').config();

// Load MongoDB URI from standard env var
const mongoUri = process.env.MONGO_URI;
const mongooseOptions = {
  serverSelectionTimeoutMS: 10000
};

if (!mongoUri) {
  console.error('MongoDB connection error: MONGO_URI is not set');
} else {
  mongoose.connect(mongoUri, mongooseOptions)
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));
}

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
// CORS configuration - allow known frontend origins in production
{
  // if you deploy with a single known frontend URL, you can set
  // process.env.FRONTEND_URL and it will be used here.
  const allowed = [];
  if (process.env.FRONTEND_URL) {
    allowed.push(process.env.FRONTEND_URL);
  }
  // add our custom domain directly as a fallback
  allowed.push('https://stockspotdeals.com');
  // optional: include GitHub Pages URL if you're still hosting there
  allowed.push('https://your-github-username.github.io');

  const originOption = process.env.NODE_ENV === 'production' ? allowed : 'http://localhost:3000';

  app.use(cors({
    origin: originOption,
    methods: ['GET', 'POST'],
    credentials: true,
    optionsSuccessStatus: 200
  }));
}

// Stripe webhook must use raw body (before JSON parsing)
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Stripe webhook received: ${event.type}`);

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const { UserModel } = require('./models/User');
      const userId = session.client_reference_id;
      
      // Update user subscription in MongoDB
      const user = await UserModel.updateById(userId, {
        subscriptionStatus: 'active',
        stripeCustomerId: session.customer,
        subscriptionStartDate: new Date(),
      });
      
      console.log(`✅ Subscription activated for user ${userId} (${session.customer})`);
    } catch (err) {
      console.error('❌ Failed to update subscription:', err.message);
      return res.status(500).json({ error: 'Failed to process subscription' });
    }
  }

  // Handle customer.subscription.deleted
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    try {
      const { UserModel } = require('./models/User');
      
      // Find user by stripeCustomerId and deactivate
      const users = require('./models/User').UserModel.users || [];
      const user = users.find(u => u.stripeCustomerId === subscription.customer);
      if (user) {
        await UserModel.updateById(user.id, {
          subscriptionStatus: 'inactive',
          subscriptionEndDate: new Date(),
        });
        console.log(`✅ Subscription cancelled for user ${user.id}`);
      }
    } catch (err) {
      console.error('❌ Failed to cancel subscription:', err.message);
    }
  }

  res.json({ received: true });
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check endpoint with MongoDB details
app.get('/health', async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    const collectionCount = collections.length;
    
    // Get document counts for key collections
    const productCount = await db.collection('products').countDocuments().catch(() => 0);
    const signalCount = await db.collection('signals').countDocuments().catch(() => 0);
    const templateCount = await db.collection('ai_templates').countDocuments().catch(() => 0);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        host: mongoose.connection.host || 'unknown',
        name: mongoose.connection.name || 'unknown',
        collections: collectionCount,
        documents: {
          products: productCount,
          signals: signalCount,
          ai_templates: templateCount
        }
      },
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: {
        status: 'error',
        error: error.message
      },
      environment: process.env.NODE_ENV || 'development'
    });
  }
});

// API Routes (multi-retailer monitoring mode)
app.get('/api/status', (req, res) => {
  res.json({
    status: 'operational',
    mode: 'monitoring',
    timestamp: new Date().toISOString()
  });
});

// AI Templates (premium-only utilities)
try {
  const aiTemplates = require('./routes/aiTemplates');
  app.use('/api/ai', aiTemplates);
} catch (err) {
  // If middleware or file missing, log and continue (non-breaking)
  console.warn('AI templates route not mounted:', err.message);
}

// Smart Signal Engine
try {
  const signalRoutes = require('./routes/signals');
  app.use('/api/signals', signalRoutes);
} catch (err) {
  // If route file missing, log and continue (non-breaking)
  console.warn('Signals route not mounted:', err.message);
}

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Global error handler:', error);
  
  // Mongoose validation error
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(e => e.message);
    return res.status(400).json({
      error: 'Validation Error',
      details: errors
    });
  }
  
  // Mongoose cast error
  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID format'
    });
  }
  
  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token'
    });
  }
  
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired'
    });
  }
  
  // Default error
  res.status(error.status || 500).json({
    error: error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start server
const startServer = async () => {
  try {
    // Connect to MongoDB
    // connection already established above via MONGO_URI/MONGODB_URI
    console.log('✅ MongoDB connection already initialized');

    const PORT = Number(process.env.PORT) || 3000;
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server is running and listening on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database: ${mongoose.connection.readyState === 1 ? mongoose.connection.host : 'pending'}`);
      console.log('📡 Multi-retailer monitoring active (Amazon, Walmart, Target, Best Buy, etc)');
      
      // Start Layer 2 Smart Signal Engine
      try {
        const runSignalEngine = require('./services/signalEngine');
        
        // Run signal engine every 5 minutes in production, every 30 minutes in development
        const intervalMinutes = process.env.NODE_ENV === 'production' ? 5 : 30;
        const intervalMs = intervalMinutes * 60 * 1000;
        
        console.log(`🎯 Layer 2 Smart Signal Engine scheduled to run every ${intervalMinutes} minutes`);
        
        // Run immediately on startup
        setTimeout(() => {
          runSignalEngine().catch(err => console.error('Initial signal engine run failed:', err));
        }, 10000); // Wait 10 seconds after startup
        
        // Schedule recurring runs
        setInterval(() => {
          runSignalEngine().catch(err => console.error('Scheduled signal engine run failed:', err));
        }, intervalMs);
        
      } catch (err) {
        console.warn('⚠️  Layer 2 Signal Engine not available:', err.message);
      }
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });
    
    return server;
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('💡 Make sure MongoDB is running and MONGODB_URI is set correctly');
    process.exit(1);
  }
};

// Start if not being imported
if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer
};