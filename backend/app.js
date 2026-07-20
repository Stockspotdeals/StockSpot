console.log('Initializing server...');
console.log('Connecting to MongoDB...');

const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { initializeSignalScheduler } = require('./src/services/signalIngestion');
const { initializeAISourcingScheduler } = require('./src/services/signalSourcer');
const { initializeConnectorScheduler } = require('./src/services/dataConnectors');
const { MonitoringWorker } = require('./src/services/MonitoringWorker');
const { authenticateToken, requireAdmin } = require('./src/middleware/authMiddleware');
const { getLiveSignals } = require('./src/services/signalPipeline');

const CANONICAL_PREMIUM_MONTHLY_PRICE_ID = process.env.STRIPE_PRICE_ID || (() => {
  throw new Error('STRIPE_PRICE_ID environment variable is required');
})();

let monitoringWorkerInstance = null;
let activeServerPort = 'not-listening';
let mongoConnectionStatus = 'pending';

function logStartupStatus() {
  console.log(
    `[StartupStatus] Loaded MONGO_URI: ${Boolean(process.env.MONGO_URI)} | Active server port: ${activeServerPort} | Mongo connection: ${mongoConnectionStatus}`
  );
}

function setMongoConnectionStatus(status) {
  mongoConnectionStatus = status;
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
  // add our custom domain directly
  allowed.push('https://stockspotdeals.com');

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

  const activeSubscriptionStates = new Set(['active', 'trialing', 'past_due']);

  const setPremiumForCustomer = async (customerId, updates = {}) => {
    const { AuthUserModel } = require('./src/models/AuthUser');
    const user = await AuthUserModel.findOne({ stripeCustomerId: customerId });
    if (!user) {
      return null;
    }

    return AuthUserModel.updateById(user.id, updates);
  };

  // Handle checkout.session.completed
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    try {
      const { AuthUserModel } = require('./src/models/AuthUser');
      const customerEmail = session.customer_details?.email || session.customer_email || session.metadata?.email;
      let user = null;

      if (customerEmail) {
        user = await AuthUserModel.findByEmail(customerEmail);
      }

      if (!user && session.customer) {
        user = await AuthUserModel.findOne({ stripeCustomerId: session.customer });
      }

      if (user) {
        await AuthUserModel.updateById(user.id, {
          subscriptionStatus: 'premium',
          plan: 'premium',
          stripeCustomerId: session.customer,
          subscriptionStartDate: new Date()
        });
        console.log(`✅ Subscription activated for user ${user.email} (${session.customer})`);
      } else {
        console.warn('⚠️ Stripe webhook: no matching auth user found', customerEmail, session.customer);
      }
    } catch (err) {
      console.error('❌ Failed to update subscription:', err.message);
      return res.status(500).json({ error: 'Failed to process subscription' });
    }
  }

  // Handle customer.subscription.deleted
  if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    try {
      const { AuthUserModel } = require('./src/models/AuthUser');
      const user = await AuthUserModel.findOne({ stripeCustomerId: subscription.customer });
      if (user) {
        await AuthUserModel.updateById(user.id, {
          subscriptionStatus: 'free',
          plan: 'free',
          subscriptionEndDate: subscription.ended_at ? new Date(subscription.ended_at * 1000) : new Date()
        });
        console.log(`✅ Subscription cancelled for user ${user.email}`);
      }
    } catch (err) {
      console.error('❌ Failed to cancel subscription:', err.message);
    }
  }

  // Handle customer.subscription.created and customer.subscription.updated
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const subscription = event.data.object;
    const isPremium = activeSubscriptionStates.has(subscription.status);
    try {
      const updatedUser = await setPremiumForCustomer(subscription.customer, {
        subscriptionStatus: isPremium ? 'premium' : 'free',
        plan: isPremium ? 'premium' : 'free',
        subscriptionEndDate: subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : null
      });

      if (updatedUser) {
        console.log(`✅ Subscription ${event.type} processed for user ${updatedUser.email}: ${subscription.status}`);
      } else {
        console.warn('⚠️ Stripe webhook: no matching auth user for subscription event', subscription.customer);
      }
    } catch (err) {
      console.error('❌ Failed to process subscription update:', err.message);
      return res.status(500).json({ error: 'Failed to process subscription update' });
    }
  }

  // Handle invoice events for payment state visibility
  if (event.type === 'invoice.paid') {
    const invoice = event.data.object;
    console.log(`✅ Invoice paid: ${invoice.id} (${invoice.customer})`);
  }

  if (event.type === 'invoice.payment_failed') {
    const invoice = event.data.object;
    console.warn(`⚠️ Invoice payment failed: ${invoice.id} (${invoice.customer})`);
  }

  res.json({ received: true });
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

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

// Production compatibility feed endpoint used by the current frontend app.
app.get('/api/feed', async (req, res) => {
  try {
    const tier = String(req.query.tier || 'free').toLowerCase();
    const retailerFilter = req.query.retailer ? String(req.query.retailer).toLowerCase() : null;
    const categoryFilter = req.query.category ? String(req.query.category).toLowerCase() : null;
    const isPremium = tier === 'paid' || tier === 'yearly' || tier === 'premium' || tier === 'admin';

    const signals = await getLiveSignals(isPremium, 50);
    const items = signals
      .filter((signal) => {
        if (retailerFilter && String(signal.store || '').toLowerCase() !== retailerFilter) {
          return false;
        }

        if (categoryFilter && categoryFilter !== 'all') {
          const categoryValue = String(signal.category || signal.store || '').toLowerCase().replace(/\s+/g, '-');
          return categoryValue === categoryFilter;
        }

        return true;
      })
      .map((signal) => ({
        id: signal.id,
        name: signal.productName || signal.title || 'Unnamed product',
        title: signal.title || signal.productName || 'Unnamed product',
        description: signal.description || '',
        retailer: signal.store || 'unknown',
        category: (signal.category || signal.store || 'general').toLowerCase().replace(/\s+/g, '-'),
        price: signal.metadata?.currentPrice ?? signal.currentPrice ?? null,
        originalPrice: signal.metadata?.previousPrice ?? signal.previousPrice ?? null,
        discountPercent: signal.metadata?.percentChange ?? 0,
        affiliateLink: signal.affiliateUrl || '',
        image: signal.imageUrl || '',
        inStock: signal.signalType !== 'out-of-stock',
        confidence: Math.round(Number(signal.confidence || 0) * 100),
        detectedAt: signal.createdAt || new Date().toISOString(),
        visible: true,
        delayMinutes: 0,
        classification: signal.signalType || 'deal',
        link: {
          affiliate: signal.affiliateUrl || '',
          raw: signal.affiliateUrl || ''
        },
        flags: {
          restock: signal.signalType === 'restock'
        },
        timestamps: {
          createdAt: signal.createdAt || new Date().toISOString()
        }
      }));

    res.json({
      tier,
      totalItems: items.length,
      items,
      products: items
    });
  } catch (error) {
    console.error('Feed compatibility route failed:', error.message);
    res.status(500).json({ error: 'Failed to fetch feed' });
  }
});

// Auth routes
try {
  const authRoutes = require('./src/routes/authRoutes');
  app.use('/auth', authRoutes);
} catch (err) {
  console.warn('Auth route not mounted:', err.message);
}

// Admin UI route for tracked product management
try {
  const trackedProductRoutes = require('./src/routes/trackedProducts');
  app.use('/api/tracked-products', trackedProductRoutes);
  app.use('/admin/js', express.static(path.join(__dirname, 'public', 'js')));
  app.get('/admin/tracked-products', authenticateToken, requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-tracked-products.html'));
  });
} catch (err) {
  console.warn('Tracked product admin route not mounted:', err.message);
}

// Stripe checkout session creation
app.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const frontendUrl = String(process.env.FRONTEND_URL || 'https://stockspotdeals.com').replace(/\/$/, '');
    const sessionConfig = {
      mode: 'subscription',
      line_items: [
        {
          price: CANONICAL_PREMIUM_MONTHLY_PRICE_ID,
          quantity: 1
        }
      ],
      client_reference_id: req.user.id,
      metadata: {
        userId: req.user.id,
        email: req.user.email
      },
      success_url: `${frontendUrl}/success`,
      cancel_url: `${frontendUrl}/cancel`
    };

    if (req.user.stripeCustomerId) {
      sessionConfig.customer = req.user.stripeCustomerId;
    } else {
      sessionConfig.customer_email = req.user.email;
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    console.log('Stripe checkout session created');

    if (!session.url) {
      throw new Error('No checkout URL returned from Stripe');
    }

    res.json({ url: session.url });
  } catch (error) {
    console.error('Failed to create checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// AI Templates (premium-only utilities)
try {
  const aiTemplates = require('./src/routes/aiTemplates');
  app.use('/api/ai', aiTemplates);
} catch (err) {
  // If middleware or file missing, log and continue (non-breaking)
  console.warn('AI templates route not mounted:', err.message);
}

// Smart Signal Engine
try {
  const signalRoutes = require('./src/routes/signals');
  app.use('/api/signals', signalRoutes);
} catch (err) {
  // If route file missing, log and continue (non-breaking)
  console.warn('Signals route not mounted:', err.message);
}

// Alert Signals for Dashboard
try {
  const alertSignalRoutes = require('./src/routes/alertSignals');
  app.use('/api/alert-signals', alertSignalRoutes);
} catch (err) {
  // If route file missing, log and continue (non-breaking)
  console.warn('Alert signals route not mounted:', err.message);
}

// Watchlist Routes
try {
  const watchlistRoutes = require('./src/routes/watchlist');
  app.use('/api/watchlist', watchlistRoutes);
} catch (err) {
  console.warn('Watchlist route not mounted:', err.message);
}

// Push notification subscription routes
try {
  const pushRoutes = require('./src/routes/pushSubscriptions');
  app.use('/api/push', pushRoutes);
} catch (err) {
  console.warn('Push subscription route not mounted:', err.message);
}

// Alert history routes
try {
  const alertRoutes = require('./src/routes/alerts');
  app.use('/api/alerts', alertRoutes);
} catch (err) {
  console.warn('Alerts route not mounted:', err.message);
}

// Affiliate monetization click tracking
try {
  const affiliateRoutes = require('./src/routes/affiliateRoutes');
  app.use('/affiliate', affiliateRoutes);
} catch (err) {
  console.warn('Affiliate route not mounted:', err.message);
}

// User profit dashboard and value summary
try {
  const userValueRoutes = require('./src/routes/userValueRoutes');
  app.use('/user', userValueRoutes);
} catch (err) {
  console.warn('User value route not mounted:', err.message);
}

// Admin API routes (worker control, discovery management, system stats)
try {
  const adminRoutes = require('./routes/admin');
  app.use('/api/admin', adminRoutes);
} catch (err) {
  console.warn('Admin route not mounted:', err.message);
}

// Initialize automated signal ingestion scheduler after routes are mounted
try {
  initializeSignalScheduler();
} catch (err) {
  console.error('Failed to initialize automated signal ingestion scheduler:', err.message);
}

// Initialize automated AI sourcing scheduler after routes are mounted
try {
  initializeAISourcingScheduler();
} catch (err) {
  console.error('Failed to initialize AI signal sourcing scheduler:', err.message);
}

// Initialize automated external connector scheduler after routes are mounted
try {
  initializeConnectorScheduler();
} catch (err) {
  console.error('Failed to initialize external data connector scheduler:', err.message);
}

// Initialize alert dispatcher scheduler after routes are mounted
try {
  const { initializeAlertDispatcher } = require('./src/services/AlertDispatcher');
  initializeAlertDispatcher();
} catch (err) {
  console.error('Failed to initialize alert dispatcher scheduler:', err.message);
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
    console.log('✅ MongoDB connection initialized');

    const PORT = Number(process.env.PORT) || 3000;
    const server = app.listen(PORT, '0.0.0.0', () => {
      activeServerPort = PORT;
      console.log(`Server is running and listening on port ${PORT}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📊 Database: ${mongoose.connection.readyState === 1 ? mongoose.connection.host : 'pending'}`);
      console.log('📡 Multi-retailer monitoring active (Amazon, Walmart, Target, Best Buy, etc)');
      logStartupStatus();

      // Start monitoring worker once, but never block backend startup on worker errors.
      try {
        if (!monitoringWorkerInstance) {
          monitoringWorkerInstance = new MonitoringWorker();
          monitoringWorkerInstance.start();
          console.log('✅ MonitoringWorker initialized and started');
        } else {
          console.log('ℹ️ MonitoringWorker already initialized, skipping duplicate startup');
        }
      } catch (err) {
        console.error('⚠️ MonitoringWorker failed to start. Backend will continue running:', err.message);
      }
      
      // Start Layer 2 Smart Signal Engine
      try {
        const runSignalEngine = require('./src/services/signalEngine');
        
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
    console.error('💡 Make sure MongoDB is running and MONGO_URI is set correctly');
    process.exit(1);
  }
};

module.exports = {
  app,
  startServer,
  setMongoConnectionStatus,
  logStartupStatus
};