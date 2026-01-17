# 🛍️ StockSpot v2.0 - Multi-Retailer Deal & Restock Monitor

**Real-time deal and restock alerts across Amazon, Walmart, Target, Best Buy, and more. Progressive Web App with three-tier monetization.**

## ✨ Key Features

- **🏪 Multi-Retailer Monitoring** - Amazon, Walmart, Target, Best Buy, GameStop, eBay
- **📱 Progressive Web App** - Install on iOS/Android like a native app, works offline
- **💰 3-Tier Monetization** - Free, Paid ($9.99/mo), Yearly ($99/yr)
- **🔗 Smart Affiliate Links** - Auto-converted Amazon affiliate links (Free tier instantly)
- **📊 Intelligent Ranking** - Items sorted by priority (restocks, hype items, discounts)
- **📡 Multiple Feed Formats** - JSON API + RSS feed
- **🎮 Smart Categories** - Pokémon TCG, One Piece TCG, Sports Cards, Limited Exclusives, Hype Items
- **🔄 Dry-Run Mode** - Test everything with mock data, no credentials required
- **🎯 Tier Gating** - Free tier gets 10-min delay on non-Amazon items; Paid gets instant; Yearly unlocks manual monitoring

## 💳 Tier Comparison

| Feature | Free | Paid | Yearly |
|---------|:----:|:----:|:------:|
| Browse all retailers | ✓ | ✓ | ✓ |
| Amazon (instant) | ✓ | ✓ | ✓ |
| Other retailers | ⏱️ 10min delay | ✓ Instant | ✓ Instant |
| Manual item monitoring | - | - | ✓ |
| Priority ranking | - | ✓ | ✓ |
| Email alerts | - | ✓ (coming soon) | ✓ (coming soon) |
| RSS feed | ✓ | ✓ | ✓ |
| **Price** | **FREE** | **$9.99/mo** | **$99/yr** |

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ 
- **npm** 9+

### 1. Install
```bash
git clone <repository>
cd StockSpot
npm install
```

### 2. Run Dry-Run (No Credentials Required)
```bash
npm run dry-run
```
This runs tests and starts the server on `http://localhost:3000` with mock data.

### 3. Validate All Tests
```bash
npm test
```
Expected output: **7/7 tests PASSING** ✓

### 4. Start Production Server
```bash
npm start
```
Server runs on `http://localhost:3000`

## 🏗️ Project Structure

```
StockSpot/
├── backend/
│   ├── affiliate/           # Amazon affiliate link conversion
│   ├── feeds/               # Feed generation (JSON, RSS, tier delays)
│   ├── tiers/               # Tier manager (Free, Paid, Yearly)
│   ├── monitors/            # Retailer classification & priority
│   ├── tests/               # Mock data & dry-run validators
│   ├── server-dry-run.js    # Express API (11 endpoints)
│   ├── dry-run-test.js      # Test runner (7 comprehensive tests)
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Main React component
│   │   ├── components/      # UI components (ItemCard, Feed, Tabs, etc.)
│   │   └── styles/          # CSS modules
│   ├── public/
│   │   ├── manifest.json    # PWA manifest
│   │   ├── sw.js            # Service worker (offline support)
│   │   └── index.html       # PWA entry point
│   └── package.json
│
├── docker/
│   └── Dockerfile.production # Alpine Node image, health checks
│
├── scripts/
│   ├── docker-validate.sh   # Validate Docker setup (Bash)
│   └── docker-validate.ps1  # Validate Docker setup (PowerShell)
│
├── .env                     # Environment variables (placeholders for dry-run)
├── .env.example             # Template for production
├── Dockerfile               # Standard Node image
└── package.json             # Root npm config
```

## 🔌 API Endpoints

| Method | Path | Description | Requires |
|--------|------|-------------|----------|
| GET | `/health` | Health check | None |
| GET | `/status` | Server status | None |
| GET | `/api/feed` | Get feed items | Query: `tier`, `category`, `retailer` |
| GET | `/api/retailers` | List retailers | None |
| GET | `/api/categories` | List categories | None |
| GET | `/api/tiers` | Tier info & pricing | None |
| POST | `/api/tier/check` | Check tier access | Body: `tier`, `feature` |
| GET | `/rss.xml` | RSS feed | Query: `tier` |
| POST | `/api/manual-items` | Add manual item | Yearly tier only |
| GET | `/api/manual-items` | List manual items | Yearly tier only |
| DELETE | `/api/manual-items/:id` | Delete manual item | Yearly tier only |

## 🔐 Environment Variables

The `.env` file includes placeholders for dry-run mode (no credentials required):

```env
# Dry-Run Mode (default, works without credentials)
DRY_RUN=true
DRY_RUN_MOCK_DATA=true

# Database (optional, local fallback for dry-run)
MONGODB_URI=mongodb://localhost:27017/stockspot
DATABASE_TYPE=local

# Amazon Affiliate (required for production only)
AMAZON_ASSOCIATE_ID=your-associate-id
AMAZON_API_KEY=your-amazon-api-key
AMAZON_PARTNER_TAG=your-partner-tag

# Email (coming soon)
EMAIL_ENABLED=false
EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=your-sendgrid-key
EMAIL_FROM=alerts@stockspot.com

# Security
JWT_SECRET=dev-secret-key-change-in-production
BCRYPT_ROUNDS=10

# Monitoring
MONITOR_INTERVAL_MINUTES=5
FREE_TIER_DELAY_MINUTES=10
FEED_MAX_ITEMS=100
```

For production, copy `.env.example` and configure real credentials:
```bash
cp .env.example .env
# Edit .env with your credentials
```

## 🧪 Testing

### Run All Tests (Dry-Run Validator)
```bash
npm test
```

Tests validate:
1. ✓ Free tier (10-min delay on non-Amazon)
2. ✓ Paid tier (instant all items)
3. ✓ Yearly tier (manual input access)
4. ✓ Affiliate link conversion (Amazon ASIN extraction)
5. ✓ Tier feature gating (access control)
6. ✓ Item deduplication (removes duplicates)
7. ✓ RSS feed generation (valid XML)

### Run Tests + Server
```bash
npm run dry-run
```

### Check Server Health
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "healthy",
  "mode": "dry-run",
  "timestamp": "2026-01-15T06:56:56.999Z",
  "environment": "test"
}
```

## 🐳 Docker Deployment

### Build & Run Locally
```bash
docker build -f Dockerfile.production -t stockspot:latest .
docker run -p 3000:3000 -e DRY_RUN=true stockspot:latest
```

### Deploy to Render
1. Push to GitHub
2. Connect repository to Render
3. Set build command: `npm install && npm run build`
4. Set start command: `npm start`
5. Add environment variables (see `.env.example`)
6. Deploy!

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for other hosting options (Heroku, DigitalOcean, AWS, etc.)

## 📲 PWA Installation

### On Mobile (iOS/Android)
1. Visit `https://yourdomain.com` in browser
2. Tap **Share** → **Add to Home Screen** (iOS)
   - Or tap **Menu** → **Install app** (Android)
3. Tap **Install** → **Done**
4. App now works like native app, even offline

### On Desktop
1. Visit app in Chrome/Edge
2. Click install icon in address bar
3. Click **Install**
4. App opens in standalone window

## 🔄 Workflow

### Free Tier User
1. Opens app
2. Sees non-Amazon items with ⏱️ 10-min delay notice
3. Amazon items appear instantly
4. Views RSS feed with same delays
5. All features work without payment

### Paid Tier User ($9.99/mo)
1. Subscribes to Paid tier
2. Gets instant access to ALL items
3. Sees priority ranking (best deals first)
4. Receives email alerts (coming soon)
5. Full RSS feed access

### Yearly Tier User ($99/yr)
1. Subscribes to Yearly tier
2. Everything in Paid tier
3. **Plus:** Can add manual items to monitor
   - Add retailer + product URL
   - Get alerts when price drops or restocks
4. Best value for power users

## 🔧 Development

### Run with auto-reload (nodemon)
```bash
npm run dev
```

### Lint code
```bash
npm run lint
```

### Clean build
```bash
npm run clean
```

## 📚 Documentation

- [START_HERE.md](START_HERE.md) - Quick orientation guide
- [IMPLEMENTATION_COMPLETE.md](IMPLEMENTATION_COMPLETE.md) - Full implementation details & test results
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Multi-platform deployment (Render, Docker, Heroku, AWS, DigitalOcean)
- [FILE_REFERENCE.md](FILE_REFERENCE.md) - Code organization & file locations
- [backend/README.md](backend/README.md) - Backend architecture details

## 🌟 Key Technologies

- **Frontend:** React 18, Progressive Web App, Service Workers, Offline Support
- **Backend:** Node.js 18+, Express.js, REST API with 11 endpoints
- **Database:** MongoDB (optional, local fallback for dry-run)
- **Deploy:** Docker, Render, Heroku, AWS, DigitalOcean
- **Monitoring:** Mock data generator, 7 comprehensive tests
- **Features:** Affiliate links, tier gating, RSS generation, item deduplication

## 🎯 Next Steps

1. **Local Testing:** `npm run dry-run`
2. **Run Tests:** `npm test` (7/7 should pass)
3. **Deploy:** Choose hosting option from [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
4. **Configure:** Update `.env` with real credentials
5. **Launch:** Go live! 🚀

## 📝 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions welcome! Please submit issues and pull requests.

---

**Status:** ✅ Complete & Production-Ready

**Last Updated:** January 2026

**Questions?** See [START_HERE.md](START_HERE.md) or review the [STOCKSPOT_MASTER_PROMPT.md](STOCKSPOT_MASTER_PROMPT.md) for full requirements.
