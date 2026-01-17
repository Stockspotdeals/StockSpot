# StockSpot v2.0 - PWA + Email/RSS + Multi-Retailer Monitoring

**Real-time Deal & Restock Alerts | Affiliate Marketing | Tier-Based Access**

## 🎯 Overview

StockSpot is a comprehensive e-commerce monitoring platform that detects deals, restocks, and hype items across multiple retailers with tier-based access control and monetization.

### Key Features

✅ **Multi-Retailer Monitoring**
- Amazon (with affiliate link auto-conversion)
- Walmart, Target, Best Buy, GameStop, eBay
- Real-time restock detection
- Price drop monitoring
- Limited edition / hype item tracking

✅ **Tier-Based Monetization**
- **Free**: 10-min delayed feed (non-Amazon), instant Amazon affiliate items
- **Paid ($9.99/mo)**: Instant feed for all items, priority ranking
- **Yearly ($99/yr)**: All paid features + manual item monitoring

✅ **Modern Frontend**
- Progressive Web App (PWA) - installable on mobile
- React-based dashboard
- Real-time item cards with retailer logos
- Category and retailer filtering
- Responsive design

✅ **Multi-Format Delivery**
- JSON API feed
- RSS feed (/rss.xml)
- Email alerts (placeholder for future)
- Web dashboard

✅ **Dry-Run Mode**
- Full testing without credentials
- Mock data for all retailers
- Simulated tier delays
- Validation of tier gating

## 📊 Tier Comparison

| Feature | Free | Paid | Yearly |
|---------|------|------|--------|
| Price | Free | $9.99/mo | $99/yr |
| All Categories | ✓ | ✓ | ✓ |
| Non-Amazon Delay | 10 min | Instant | Instant |
| Amazon Affiliate | Instant | Instant | Instant |
| Priority Ranking | ✗ | ✓ | ✓ |
| Email Alerts | ✗ | ✓ | ✓ |
| Manual Item Input | ✗ | ✗ | ✓ |
| PWA Access | ✓ | ✓ | ✓ |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

```bash
# Clone repository
git clone <repo-url>
cd StockSpot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### Dry-Run Mode (No Credentials)

```bash
# Run validation tests
npm run dry-run

# Or run tests separately
npm run test

# Start server (will use mock data)
npm start
```

The server will start on `http://localhost:3000` with mock data and all features enabled.

### Production Setup

```bash
# Update .env with real credentials
nano .env

# Start server
npm start

# Or with Node directly
node backend/server-dry-run.js
```

## 📁 Project Structure

```
StockSpot/
├── backend/
│   ├── tiers/                    # Monetization & tier logic
│   │   └── TierManager.js
│   ├── monitors/                 # Retailer monitoring
│   │   └── RetailerMonitor.js
│   ├── feeds/                    # Feed generation
│   │   └── FeedGenerator.js
│   ├── affiliate/                # Affiliate link handling
│   │   └── AffiliateConverter.js
│   ├── tests/                    # Testing utilities
│   │   ├── MockDataGenerator.js
│   │   └── DryRunValidator.js
│   ├── server-dry-run.js         # Express server
│   └── dry-run-test.js           # Test runner
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Main app component
│   │   ├── App.css
│   │   └── components/
│   │       ├── FeedComponent.jsx
│   │       ├── ItemCard.jsx
│   │       ├── CategoryTabs.jsx
│   │       ├── ManualInputForm.jsx
│   │       ├── TierIndicator.jsx
│   │       ├── Header.jsx
│   │       └── [CSS files]
│   └── public/
├── scripts/
│   ├── dry-run.sh                # Linux/macOS dry-run
│   └── dry-run.ps1               # Windows dry-run
├── .env                          # Environment configuration
├── .env.example                  # Environment template
├── package.json                  # Dependencies & scripts
├── Dockerfile.production         # Docker configuration
└── README.md                     # This file
```

## 🔌 API Endpoints

### Health & Status

```
GET /health              - Server health check
GET /status              - Detailed status info
```

### Feed & Items

```
GET /api/feed            - Get feed items (supports tier, category, retailer filters)
GET /api/retailers       - Get available retailers
GET /api/categories      - Get available categories
GET /rss.xml             - RSS feed (supports tier & limit params)
```

### Tiers & Features

```
GET /api/tiers           - Get all tier information
POST /api/tier/check     - Check feature access for a tier
```

### Manual Items (Yearly Tier Only)

```
POST /api/manual-items   - Add item to monitor
GET /api/manual-items    - Get user's monitored items
DELETE /api/manual-items/:id - Remove monitored item
```

### Demo Data

```
GET /api/demo-users      - Get mock user data
```

## 🧪 Testing & Validation

### Run Dry-Run Tests

```bash
npm run test
```

This will validate:
- ✓ Feed generation for each tier
- ✓ Tier delay enforcement
- ✓ Affiliate link conversion
- ✓ Item deduplication
- ✓ RSS feed generation
- ✓ Feature access control

### Test Results

Results are saved to `dry-run-report.json` with detailed test logs.

## 🔧 Environment Variables

See `.env.example` for complete list. Key variables:

```env
# Dry-run mode
DRY_RUN=true
DRY_RUN_MOCK_DATA=true

# Tier pricing (for reference)
TIER_FREE_PRICE=0
TIER_PAID_PRICE=9.99
TIER_YEARLY_PRICE=99.00

# Amazon affiliate
AMAZON_ASSOCIATE_ID=your-id

# Feed configuration
FREE_TIER_DELAY_MINUTES=10
AFFILIATE_LINK_AUTO_CONVERT=true
```

## 📦 Deployment

### Render.com

1. Push code to GitHub
2. Create new Web Service on Render
3. Connect GitHub repository
4. Set environment:
   - `NODE_ENV=production`
   - `DRY_RUN=false` (for production)
   - Add real API keys as needed
5. Build: `npm install`
6. Start: `npm start`

### Docker

```bash
# Build image
docker build -f Dockerfile.production -t stockspot:latest .

# Run container
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e AMAZON_ASSOCIATE_ID=your-id \
  stockspot:latest
```

## 🎨 Customization

### Add New Retailer

1. Add retailer to `RetailerMonitor.RETAILERS`
2. Create scraper in `backend/scrapers/[retailer].js`
3. Update mock data in `MockDataGenerator`
4. Add UI config in `CategoryTabs.jsx`

### Modify Feed Logic

Edit `FeedGenerator.processFeedItems()` and `FeedGenerator.classifyPriority()` to adjust:
- Item priority scoring
- Classification tagging
- Feed ordering
- Deduplication logic

### Change Tier Features

Edit `TierManager.TIERS` object to:
- Add/remove features
- Adjust prices
- Modify tier names

## 🔐 Security Notes

### Production Checklist

- [ ] Change `JWT_SECRET` in `.env`
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/SSL
- [ ] Use strong database credentials
- [ ] Rate limit API endpoints
- [ ] Validate all user inputs
- [ ] Use environment-specific configs
- [ ] Monitor logs for suspicious activity
- [ ] Implement authentication for manual items
- [ ] Add CORS whitelist

### Handling Credentials

- Never commit `.env` with real credentials
- Use `.env.example` as template
- Store secrets in environment or secret manager
- Rotate affiliate keys regularly

## 📊 Performance Tips

- Enable caching headers in production
- Use CDN for static assets
- Implement database indexing on frequently queried fields
- Monitor response times and optimize slow queries
- Use clustering for multi-core systems
- Implement feed pagination

## 🐛 Troubleshooting

### Port Already in Use

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Module Not Found

```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install
```

### DRY-RUN Tests Failing

Check Node.js version:
```bash
node --version  # Should be 18+
```

## 📝 Logging

Logs are configured via `LOG_LEVEL` environment variable:
- `debug` - Most verbose
- `info` - Normal operation
- `warn` - Warnings only
- `error` - Errors only

## 🔄 Updating & Maintenance

### Update Dependencies

```bash
npm update
npm audit fix
```

### Clear Cache

```bash
npm cache clean --force
```

## 📞 Support

For issues and feature requests, check GitHub Issues or documentation.

## 📄 License

MIT - See LICENSE file

---

**StockSpot v2.0** | Built with ❤️ for deal hunters

