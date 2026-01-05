# StockSpot Product Tracking Engine

## 🚀 Production-Ready Product Monitoring System

StockSpot's backend is a comprehensive product tracking engine that monitors inventory and price changes across major retailers. Built with Node.js, Express, and MongoDB, it features enterprise-grade authentication, intelligent monitoring workers, and scalable architecture.

## ✨ Core Features

### 🔐 Authentication & User Management
- **JWT-based authentication** with refresh tokens
- **Plan-based access control** (Free, Paid, Admin)
- **Rate limiting** with plan-specific quotas
- **Secure password hashing** with bcrypt

### 📦 Product Tracking
- **Multi-retailer support** (Amazon, Walmart, Target, Best Buy)
- **Intelligent URL normalization** and product ID extraction
- **Real-time stock and price monitoring**
- **Configurable check intervals** with smart backoff
- **Event tracking** for all product changes

### � Real-Time Notifications
- **Multi-channel delivery** (Email, Discord, Telegram, Twitter)
- **Smart message formatting** per platform
- **Deduplication** prevents spam notifications
- **Plan-based delivery limits** and rate limiting
- **Comprehensive event tracking** and retry logic

### 🔄 Background Monitoring
- **Cron-based scheduling** with 5-minute cycles
- **Batch processing** with rate limiting
- **Error handling** with exponential backoff
- **Automatic cleanup** of old data
- **Background notification delivery** every 2 minutes

### 🛡️ Production Features
- **Comprehensive error handling**
- **Request logging and monitoring**
- **Graceful shutdown** handling
- **Health check endpoints**
- **Admin dashboard** for system management

## 🏗️ Architecture

```
backend/
├── models/           # Database models
│   ├── TrackedProduct.js      # Product tracking schemas
│   └── Notification.js        # Notification channel & event schemas
├── services/         # Core business logic
│   ├── RetailerDetector.js    # URL parsing and retailer detection
│   ├── ProductMonitor.js      # Web scraping and data extraction
│   ├── MonitoringWorker.js    # Background job scheduler
│   ├── NotificationService.js # Notification orchestration
│   ├── MessageBuilder.js      # Platform-specific message formatting
│   └── providers/             # Delivery provider implementations
│       ├── EmailProvider.js   # SMTP/SendGrid email delivery
│       ├── DiscordProvider.js # Discord webhook integration
│       ├── TelegramProvider.js # Telegram Bot API
│       └── TwitterProvider.js # Twitter API v2 integration
├── routes/           # API endpoints
│   ├── auth.js       # Authentication routes
│   ├── users.js      # User management
│   ├── products.js   # Product tracking CRUD
│   ├── notifications.js # Notification management
│   └── admin.js      # Admin panel routes
├── middleware/       # Express middleware
├── config/           # Database and app configuration
└── app.js           # Main application entry point
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 5.0+
- npm or yarn

### Installation

1. **Clone and install dependencies**:
```bash
cd backend
npm install
```

2. **Configure environment**:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. **Start the server**:
```bash
# Development with auto-restart
npm run dev

# Production
npm start

# Worker only
npm run worker
```

### Environment Configuration

Key environment variables:

```env
# Database
MONGODB_URI=mongodb://localhost:27017/stockspot

# Authentication
JWT_SECRET=your-super-secret-key
JWT_REFRESH_SECRET=your-refresh-secret

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Worker
START_WORKER=true
MIN_CHECK_INTERVAL=15
MAX_ERROR_COUNT=10

# Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=alerts@stockspot.com

# Discord Notifications
DISCORD_AVATAR_URL=https://stockspot.com/logo.png

# Telegram Notifications
TELEGRAM_BOT_TOKEN=your-telegram-bot-token

# Twitter Notifications
TWITTER_BEARER_TOKEN=your-twitter-bearer-token
```

## 📊 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - Logout user

### Product Tracking
- `GET /api/products` - Get user's tracked products
- `POST /api/products` - Add product to tracking
- `GET /api/products/:id` - Get specific product
- `PATCH /api/products/:id` - Update product settings
- `DELETE /api/products/:id` - Remove product
- `POST /api/products/:id/check` - Force check product
- `GET /api/products/:id/events` - Get product history
- `GET /api/products/dashboard/stats` - Get user statistics

### Notification Management
- `GET /api/notifications/channels` - Get notification channels
- `POST /api/notifications/channels` - Add notification channel
- `PATCH /api/notifications/channels/:id` - Update channel settings
- `DELETE /api/notifications/channels/:id` - Remove channel
- `POST /api/notifications/channels/:id/test` - Test channel delivery
- `GET /api/notifications/events` - Get notification history
- `GET /api/notifications/stats` - Get notification statistics
- `POST /api/notifications/events/:id/retry` - Retry failed notification

### Admin Panel
- `GET /api/admin/worker/status` - Worker status
- `POST /api/admin/worker/start` - Start worker
- `POST /api/admin/worker/stop` - Stop worker
- `POST /api/admin/worker/force-run` - Force monitoring cycle
- `GET /api/admin/products` - All products (admin view)
- `GET /api/admin/stats` - System statistics
- `POST /api/admin/cleanup` - Run cleanup operations

## 🔧 Core Services

### RetailerDetector
Handles retailer identification and URL normalization:

```javascript
const { RetailerDetector } = require('./services/RetailerDetector');

// Detect retailer from URL
const retailer = RetailerDetector.detectRetailer(url);

// Extract product ID
const productId = RetailerDetector.extractProductId(url, retailer);

// Normalize URL (remove tracking parameters)
const cleanUrl = RetailerDetector.normalizeUrl(url, retailer);

// Get retailer-specific configuration
const config = RetailerDetector.getRetailerConfig(retailer);
```

### ProductMonitor
Performs web scraping and change detection:

```javascript
const { ProductMonitor } = require('./services/ProductMonitor');

const monitor = new ProductMonitor();

// Monitor single product
const result = await monitor.monitorProduct(trackedProduct);

// Batch monitor multiple products
const results = await monitor.monitorProducts(products);
```

### MonitoringWorker
Manages background job scheduling:

```javascript
const { getMonitoringWorker } = require('./services/MonitoringWorker');

const worker = getMonitoringWorker();

// Start monitoring
worker.start();

// Get status
const status = worker.getStatus();

// Force run cycle
await worker.forceRun();
```

### NotificationService
Orchestrates multi-channel notification delivery:

```javascript
const { NotificationService } = require('./services/NotificationService');

const service = new NotificationService();

// Create notification events for product changes
await service.createNotificationEvent(userId, productId, 'restock');

// Deliver pending notifications
const results = await service.deliverPendingNotifications();

// Test notification channel
const testResult = await service.testNotificationChannel(channelId);
```

## 💾 Data Models

### TrackedProduct
```javascript
{
  userId: ObjectId,           // User who owns this tracking
  url: String,               // Normalized product URL
  originalUrl: String,       // Original URL provided by user
  productId: String,         // Extracted product identifier
  retailer: String,          // Detected retailer (amazon, walmart, etc.)
  productName: String,       // Current product name
  currentPrice: Number,      // Current price
  targetPrice: Number,       // User's target price
  availability: String,      // Current availability status
  isAvailable: Boolean,      // Boolean availability flag
  checkInterval: Number,     // Check interval in minutes
  status: String,           // active, paused, failed, deleted
  isActive: Boolean,        // Whether monitoring is active
  lastChecked: Date,        // Last check timestamp
  nextCheck: Date,          // When to check next
  errorCount: Number,       // Consecutive error count
  lastError: String,        // Last error message
  notificationPreferences: {
    restock: Boolean,
    priceChange: Boolean,
    targetPrice: Boolean
  },
  createdAt: Date,
  updatedAt: Date
}
```

### NotificationChannel
```javascript
{
  userId: ObjectId,              // User who owns this channel
  channelType: String,          // email, discord, telegram, twitter
  destination: String,          // Email, webhook URL, chat ID, username
  displayName: String,          // User-friendly name
  isActive: Boolean,            // Whether channel is enabled
  isVerified: Boolean,          // Whether channel is verified
  configuration: Map,           // Channel-specific settings
  errorCount: Number,           // Consecutive error count
  lastError: String,            // Last error message
  lastUsed: Date,               // Last successful delivery
  createdAt: Date,
  updatedAt: Date
}
```

### NotificationEvent
```javascript
{
  userId: ObjectId,             // User who owns this notification
  productId: ObjectId,          // Product that triggered notification
  channelId: ObjectId,          // Channel to deliver through
  eventType: String,            // restock, price_drop, target_price
  deliveryStatus: String,       // pending, sent, failed, skipped
  message: {
    subject: String,            // Email subject or notification title
    body: String,               // Message body
    html: String,               // HTML content for email
    metadata: Object            // Additional message data
  },
  deliveryAttempts: Number,     // Number of delivery attempts
  lastAttempt: Date,            // Last delivery attempt
  sentAt: Date,                 // When successfully delivered
  failureReason: String,        // Reason for delivery failure
  externalId: String,           // Provider's message ID
  deduplicationKey: String,     // Prevents duplicate sends
  scheduledFor: Date,           // When to attempt delivery
  createdAt: Date
}
```

## 🔒 Security Features

- **Helmet.js** for security headers
- **Rate limiting** with express-rate-limit
- **Plan-based quotas** to prevent abuse
- **JWT tokens** with short expiration
- **Password hashing** with bcryptjs
- **Input validation** and sanitization
- **CORS** configuration for cross-origin requests

## 🎯 Monitoring Features

- **Intelligent scheduling** with cron jobs
- **Batch processing** to avoid rate limits
- **Error handling** with exponential backoff
- **Automatic cleanup** of old data
- **Health checks** for system monitoring
- **Comprehensive logging** for debugging

## 📈 Scalability

- **Stateless design** for horizontal scaling
- **Background workers** can run on separate instances
- **Database indexing** for optimal query performance
- **Configurable batch sizes** and delays
- **Redis-ready** for future caching and queues

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run linting
npm run lint
```

## 📝 API Usage Examples

### Adding a Product
```javascript
POST /api/products
{
  "url": "https://www.amazon.com/dp/B08N5WRWNW",
  "targetPrice": 299.99,
  "checkInterval": 30,
  "notificationPreferences": {
    "restock": true,
    "priceChange": true,
    "targetPrice": true
  }
}
```

### Adding a Notification Channel
```javascript
POST /api/notifications/channels
{
  "channelType": "email",
  "destination": "user@example.com",
  "displayName": "Primary Email",
  "configuration": {
    "restock": true,
    "priceChange": true,
    "targetPrice": true
  }
}
```

### Getting Notification Statistics
```javascript
GET /api/notifications/stats

Response:
{
  "channels": {
    "total": 3,
    "active": 2,
    "inactive": 1
  },
  "events": {
    "total": 150,
    "sent": 142,
    "failed": 5,
    "pending": 3
  },
  "dailyLimit": 100,
  "dailyUsage": 12,
  "dailyRemaining": 88,
  "recentEvents": [...]
}
```

## 🔧 Configuration

### Worker Configuration
```env
START_WORKER=true              # Auto-start worker
WORKER_BATCH_SIZE=5           # Products per batch
WORKER_DELAY_BETWEEN_BATCHES=2000  # Delay in milliseconds
MIN_CHECK_INTERVAL=15         # Minimum check interval (minutes)
MAX_ERROR_COUNT=10           # Max errors before marking failed
```

### Notification Configuration
```env
# Email notifications
FROM_EMAIL=alerts@stockspot.com    # Sender email address
SMTP_HOST=smtp.gmail.com           # SMTP server
SMTP_USER=alerts@gmail.com         # SMTP username
SMTP_PASS=app-specific-password    # SMTP password

# Plan limits
NOTIFICATION_LIMIT_FREE=10         # Free plan: 10/day
NOTIFICATION_LIMIT_PAID=100        # Paid plan: 100/day
NOTIFICATION_LIMIT_ADMIN=1000      # Admin plan: 1000/day

# Provider settings
TELEGRAM_BOT_TOKEN=bot123456:ABC   # Telegram bot token
DISCORD_AVATAR_URL=https://...     # Discord webhook avatar
TWITTER_BEARER_TOKEN=AAAA...       # Twitter API bearer token
```

## 🚀 Production Deployment

### Environment Setup
1. Set `NODE_ENV=production`
2. Use strong JWT secrets (32+ characters)
3. Configure MongoDB with authentication
4. Set up proper CORS origins
5. Configure rate limiting appropriately

### Process Management
```bash
# Using PM2
pm2 start app.js --name stockspot-backend
pm2 start app.js --name stockspot-worker -- --worker-only

# Using Docker
docker build -t stockspot-backend .
docker run -p 5000:5000 stockspot-backend
```

### Health Monitoring
The `/health` endpoint provides system status:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "database": "connected",
  "worker": {
    "running": false,
    "hasJob": true
  }
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure linting passes
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.