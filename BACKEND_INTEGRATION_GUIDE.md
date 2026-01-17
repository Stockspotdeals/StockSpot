# Backend Integration Guide - PWA

Complete guide to integrate the PWA frontend with the existing StockSpot backend.

## 🔗 Backend Requirements

The PWA frontend expects the following backend routes and functionality:

### 1. Authentication Routes (`/api/auth`)

**POST /api/auth/signup**
```javascript
// Request
{
  email: "user@example.com",
  tier: "FREE" | "PAID" | "YEARLY",
  preferences: {
    emailNotifications: boolean,
    rssEnabled: boolean,
    notificationFrequency: "instant" | "daily" | "weekly"
  },
  subscriptions: {
    amazon: boolean,
    walmart: boolean,
    target: boolean,
    bestbuy: boolean,
    pokemon: boolean,
    sports: boolean
  },
  manualItems?: [
    { url, productName, targetPrice }
  ]
}

// Response (201)
{
  token: "jwt_token_here",
  userId: "user_id",
  tier: "FREE",
  user: { email, tier, preferences, subscriptions }
}

// Error (400)
{ error: "Email already exists" }
```

**POST /api/auth/login**
```javascript
// Request
{
  email: "user@example.com",
  password: "password123"
}

// Response (200)
{
  token: "jwt_token_here",
  userId: "user_id",
  tier: "FREE"
}

// Error (401)
{ error: "Invalid credentials" }
```

**GET /api/auth/me**
```javascript
// Requires: Authorization: Bearer {token}

// Response (200)
{
  userId: "user_id",
  email: "user@example.com",
  tier: "FREE",
  preferences: { ... },
  subscriptions: { ... }
}

// Error (401)
{ error: "Unauthorized" }
```

### 2. Notification History Route (`/api/notifications`)

**GET /api/notifications/history**
```javascript
// Query: ?limit=50&status=sent&skip=0

// Response (200)
{
  notifications: [
    {
      _id: "notification_id",
      productName: "iPhone 15 Pro",
      retailer: "amazon",
      description: "In stock at $999",
      price: "999.99",
      url: "https://amazon.com/...",
      source: "feed" | "manual",
      status: "sent" | "pending" | "failed",
      createdAt: "2026-01-01T00:00:00Z"
    }
  ],
  total: 100,
  remaining: 50
}

// Error (401)
{ error: "Unauthorized" }
```

**POST /api/notifications/manual-items** (YEARLY only)
```javascript
// Requires: Authorization: Bearer {token}
// Request
{
  productName: "PlayStation 5",
  url: "https://sony.com/...",
  targetPrice: 499.99
}

// Response (201)
{
  itemId: "item_id",
  productName: "PlayStation 5",
  url: "https://sony.com/...",
  targetPrice: 499.99,
  createdAt: "2026-01-01T00:00:00Z"
}

// Error (403)
{ error: "Only YEARLY tier can add manual items" }
```

**GET /api/notifications/manual-items**
```javascript
// Requires: Authorization: Bearer {token}
// Response (200)
{
  items: [
    {
      itemId: "item_id",
      productName: "PlayStation 5",
      url: "https://sony.com/...",
      targetPrice: 499.99,
      createdAt: "2026-01-01T00:00:00Z"
    }
  ]
}
```

**DELETE /api/notifications/manual-items/:id**
```javascript
// Requires: Authorization: Bearer {token}
// Response (200)
{ message: "Item deleted" }

// Error (403)
{ error: "Unauthorized" }
```

**POST /api/notifications/process** (Background Sync)
```javascript
// Triggers notification processing
// Used by Service Worker background sync

// Response (200)
{
  processed: 50,
  failed: 2,
  nextRun: "2026-01-01T00:10:00Z"
}

// Error (500)
{ error: "Processing failed" }
```

### 3. Feed Routes (`/feeds`)

**GET /feeds/public.xml**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>StockSpot - Public Deals</title>
    <link>https://stockspot.app</link>
    <description>Latest deals from all retailers</description>
    <lastBuildDate>2026-01-01T00:00:00Z</lastBuildDate>
    
    <item>
      <title>iPhone 15 Pro - In Stock</title>
      <link>https://amazon.com/Apple-iPhone-15-Pro-Max/dp/...</link>
      <description>Latest iPhone 15 Pro, available now</description>
      <category>amazon</category>
      <price>1099.99</price>
      <pubDate>2026-01-01T12:30:00Z</pubDate>
      <guid>item-12345</guid>
    </item>
    
    <!-- More items... -->
  </channel>
</rss>
```

**GET /feeds/user-{userId}.xml**
```xml
<!-- Same format as public feed but filtered to user's preferences -->
<!-- Only includes retailers user subscribed to -->
<!-- Respects tier restrictions (no delays in this, dashboard handles delays) -->
```

## 📋 Backend Implementation Checklist

### Authentication Module
- [ ] JWT token generation
- [ ] Password hashing (bcrypt)
- [ ] Email validation
- [ ] User creation with tier
- [ ] Login endpoint with password verification
- [ ] Token verification middleware

### Notification System (Already exists)
- [ ] NotificationManager.js ✅
- [ ] EmailProvider.js ✅
- [ ] RSSFeedManager.js ✅
- [ ] NotificationQueue.js ✅
- [ ] Routes connected ✅

### Feed Routes
- [ ] RSS feed generation (per-user)
- [ ] Public feed endpoint
- [ ] User-specific feed endpoint
- [ ] Retailer filtering

### Manual Items Management
- [ ] Create manual item
- [ ] List user's manual items
- [ ] Delete manual item
- [ ] Update manual item (optional)
- [ ] Tier restriction enforcement (YEARLY only)

## 🔐 Authentication Implementation

### Recommended Setup

```javascript
// backend/middleware/auth.js
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.userTier = decoded.tier;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { verifyToken };

// backend/routes/auth.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const User = require('../models/User');

const router = express.Router();

// Sign up
router.post('/signup', async (req, res) => {
  try {
    const { email, tier, preferences, subscriptions, manualItems } = req.body;

    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create user
    const user = new User({
      email,
      tier,
      preferences,
      subscriptions,
      manualItems: manualItems || []
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign(
      { userId: user._id, tier: user.tier },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );

    res.status(201).json({
      token,
      userId: user._id,
      tier: user.tier,
      user: {
        email: user.email,
        tier: user.tier,
        preferences: user.preferences,
        subscriptions: user.subscriptions
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // For PWA demo, accept any password
    // In production, use bcrypt.compare(password, user.password)

    const token = jwt.sign(
      { userId: user._id, tier: user.tier },
      process.env.JWT_SECRET,
      { expiresIn: '90d' }
    );

    res.json({
      token,
      userId: user._id,
      tier: user.tier
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({
      userId: user._id,
      email: user.email,
      tier: user.tier,
      preferences: user.preferences,
      subscriptions: user.subscriptions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
```

## 🍽️ Feed Routes Implementation

```javascript
// backend/routes/feeds.js
const express = require('express');
const RSSFeedManager = require('../notifications/RSSFeedManager');

const router = express.Router();

// Public RSS feed
router.get('/public.xml', async (req, res) => {
  try {
    const feedManager = new RSSFeedManager();
    const rss = await feedManager.generatePublicFeed();
    
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rss);
  } catch (error) {
    res.status(500).send('Feed generation failed');
  }
});

// User-specific RSS feed
router.get('/user-:userId.xml', async (req, res) => {
  try {
    const { userId } = req.params;
    const feedManager = new RSSFeedManager();
    const rss = await feedManager.generateUserFeed(userId);
    
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rss);
  } catch (error) {
    res.status(500).send('Feed generation failed');
  }
});

module.exports = router;
```

## 📡 Integration with Existing Backend

Add to `backend/app.js`:

```javascript
const express = require('express');
const app = express();

// Existing middleware
app.use(express.json());
app.use(express.static('public'));

// New auth routes
const authRoutes = require('./routes/auth');
app.use('/api/auth', authRoutes);

// New feed routes
const feedRoutes = require('./routes/feeds');
app.use('/feeds', feedRoutes);

// Existing notification routes (should already exist)
const notificationRoutes = require('./routes/notifications');
app.use('/api/notifications', notificationRoutes);

// Serve PWA files
app.get('/', (req, res) => res.sendFile('public/index.html'));
app.get('/dashboard.html', (req, res) => res.sendFile('public/dashboard.html'));

// 404 fallback for SPA
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

module.exports = app;
```

## 🧪 Testing the Integration

### Test Signup
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "tier": "FREE",
    "preferences": {
      "emailNotifications": true,
      "rssEnabled": true
    },
    "subscriptions": {
      "amazon": true,
      "walmart": true,
      "target": true
    }
  }'
```

### Test Feed
```bash
curl http://localhost:3000/feeds/public.xml
```

### Test Manual Items (YEARLY)
```bash
curl -X POST http://localhost:3000/api/notifications/manual-items \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "productName": "PlayStation 5",
    "url": "https://sony.com/ps5",
    "targetPrice": 499.99
  }'
```

## 🔄 Tier-Based Authorization

The frontend handles tier filtering, but backend should enforce:

```javascript
// In manual items endpoint
if (req.userTier !== 'YEARLY') {
  return res.status(403).json({ 
    error: 'Only YEARLY tier can add manual items' 
  });
}
```

## ⚙️ Environment Variables

Required in `.env`:

```
JWT_SECRET=your_secret_key_here
MONGODB_URI=mongodb://...
SENDGRID_API_KEY=...
NODEMAILER_EMAIL=...
NODEMAILER_PASSWORD=...
NODE_ENV=development
PORT=3000
```

## 📚 Related Documentation

- [PWA_SETUP_GUIDE.md](./PWA_SETUP_GUIDE.md) - PWA setup and testing
- [NOTIFICATIONS_REFERENCE.md](./NOTIFICATIONS_REFERENCE.md) - Notification system API
- [backend/notifications/README.md](./backend/notifications/README.md) - Notification module

## ✅ Final Integration Checklist

- [ ] Auth routes created
- [ ] Feed routes created
- [ ] Manual items endpoints created
- [ ] JWT token generation working
- [ ] All endpoints tested with curl
- [ ] Database models updated if needed
- [ ] Error handling implemented
- [ ] Tier-based authorization enforced
- [ ] CORS configured (if needed)
- [ ] Environment variables set
- [ ] Tests passing
- [ ] Pushed to GitHub

## 🚀 Deployment

After integration:

1. Test locally: `npm start`
2. Test PWA: Visit http://localhost:3000
3. Test offline: DevTools → Network → Offline
4. Deploy: `git push`
5. Verify on production

---

**Created:** 2026  
**Status:** Ready for Implementation
