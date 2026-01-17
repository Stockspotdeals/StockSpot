# StockSpot v2.0 - File Reference Guide

Quick reference for all new and modified files in the StockSpot v2.0 pivot.

## 📚 Documentation Files (Read These First)

| File | Purpose | Read Time |
|------|---------|-----------|
| `README-V2.md` | Comprehensive project guide | 15 min |
| `LAUNCH_SUMMARY.md` | Complete implementation summary | 10 min |
| `DEPLOYMENT_GUIDE.md` | Step-by-step deployment instructions | 20 min |
| `IMPLEMENTATION_COMPLETE.md` | Detailed implementation details | 15 min |
| `STOCKSPOT_MASTER_PROMPT.md` | Original requirements reference | 10 min |
| `scripts/README.md` | Script usage and examples | 10 min |

## 🔧 Backend Files (Core Logic)

### Tier & Monetization
```
backend/tiers/TierManager.js
  • Line 1-175: Tier definitions and feature control
  • Classes: TierManager
  • Methods: getTier(), getFeedDelay(), canAccess(), isValidTier()
```

### Retailer Monitoring
```
backend/monitors/RetailerMonitor.js
  • Line 1-125: Retailer classification and detection
  • Classes: RetailerMonitor
  • Constants: RETAILERS, CATEGORIES
  • Methods: classifyPriority(), isRestock(), isAmazonAffiliateEligible()
```

### Affiliate Links
```
backend/affiliate/AffiliateConverter.js
  • Line 1-95: Amazon affiliate link management
  • Classes: AffiliateConverter
  • Methods: createAmazonAffiliateLink(), extractASIN(), generateTrackingId()
```

### Feed Generation
```
backend/feeds/FeedGenerator.js
  • Line 1-210: Feed processing with tier logic
  • Classes: FeedGenerator
  • Methods: processFeedItems(), enrichItem(), generateRSSFeed(), deduplicateItems()
```

### Testing & Validation
```
backend/tests/MockDataGenerator.js
  • Line 1-280: Realistic mock data for testing
  • Classes: MockDataGenerator
  • Methods: generateMockItems(), generateMockUsers(), getRetailerConfig()

backend/tests/DryRunValidator.js
  • Line 1-445: Comprehensive validation suite
  • Classes: DryRunValidator
  • Methods: validateAll() - runs 7 tests
```

### Server & API
```
backend/server-dry-run.js
  • Line 1-400: Express REST API server
  • Endpoints: 11 total
  • Features: CORS, Helmet, error handling, mock data

backend/dry-run-test.js
  • Line 1-25: Test runner entry point
  • Calls: DryRunValidator.validateAll()
  • Output: dry-run-report.json

backend/app-v2.js
  • Line 1-100: Express app configuration
  • Middleware: Helmet, CORS, body-parser
```

## 🎨 Frontend Files (React PWA)

### Main App
```
frontend/src/App.jsx
  • Line 1-80: Main app component with tier switching
  • Functions: fetchFeed(), handleTierChange(), handleManualItemAdded()
  • Features: Feed display, tier selection, upgrade CTA

frontend/src/App.css
  • Line 1-130: Main app styling
  • Features: Gradients, responsive layout, animations
```

### Components
```
frontend/src/components/

Header.jsx (35 lines)
  • Sticky header with tier switcher
  • Brand display

FeedComponent.jsx (30 lines)
  • Feed list container
  • Empty state handling

ItemCard.jsx (100 lines)
  • Individual item display
  • Price, stock, confidence, affiliate badge
  • Buy Now button

CategoryTabs.jsx (60 lines)
  • Category and retailer filtering
  • Active state management

ManualInputForm.jsx (130 lines)
  • Add custom monitors (yearly only)
  • Remove monitors
  • Form validation

TierIndicator.jsx (35 lines)
  • Current tier display
  • Feature list per tier
```

### Styling
```
frontend/src/components/
  Header.css (80 lines)
  FeedComponent.css (100 lines)
  ItemCard.css (200 lines)
  CategoryTabs.css (120 lines)
  ManualInputForm.css (180 lines)
  TierIndicator.css (80 lines)

Total CSS: ~760 lines
```

### PWA Configuration
```
frontend/public/
  index.html - PWA entry point with meta tags
  manifest.json - App manifest with icons and shortcuts
  sw.js - Service worker (offline support, caching)
```

## 📝 Configuration Files

```
.env - Current environment configuration
  • DRY_RUN=true
  • All necessary variables for testing

.env.example - Template for production setup
  • Copy and fill in real values

package.json - Updated with new scripts
  • "start": "node backend/server-dry-run.js"
  • "dry-run": "node backend/dry-run-test.js && npm start"
  • "test": "node backend/dry-run-test.js"

Dockerfile.production - Production container image
  • Node 18 Alpine
  • Health checks
  • Port 3000
```

## 🚀 Script Files

```
scripts/

dry-run.sh - Linux/macOS validation
  • Installs dependencies if needed
  • Runs validation tests
  • Exits with status code

dry-run.ps1 - Windows PowerShell validation
  • Same functionality as .sh
  • Color-coded output

quickstart.sh - Linux/macOS full startup
  • Tests + starts server
  • Instructions on success

quickstart.ps1 - Windows full startup
  • Same as .sh version
```

## 📊 Quick File Stats

```
Backend Code:        2,000+ lines
Frontend Code:       1,500+ lines
Styling:               800+ lines
Scripts:               300+ lines
Configuration:         200+ lines
Documentation:       1,500+ lines
Tests:                 500+ lines
                     ---------
Total:               6,800+ lines
```

## 🎯 File Organization by Feature

### Monetization
- `backend/tiers/TierManager.js`
- `frontend/src/components/TierIndicator.jsx`
- `frontend/src/components/Header.jsx` (tier switcher)

### Affiliate Links
- `backend/affiliate/AffiliateConverter.js`
- `backend/feeds/FeedGenerator.js` (uses AffiliateConverter)
- `frontend/src/components/ItemCard.jsx` (displays affiliate badge)

### Multi-Retailer Monitoring
- `backend/monitors/RetailerMonitor.js`
- `backend/tests/MockDataGenerator.js` (mock retailers)
- `frontend/src/components/CategoryTabs.jsx` (retailer filter)

### Feed Generation
- `backend/feeds/FeedGenerator.js`
- `backend/server-dry-run.js` (API endpoints)
- `frontend/src/components/FeedComponent.jsx` (display)
- `frontend/src/components/ItemCard.jsx` (item display)

### Testing
- `backend/tests/MockDataGenerator.js`
- `backend/tests/DryRunValidator.js`
- `backend/dry-run-test.js`
- `scripts/dry-run.sh` and `.ps1`

### PWA Features
- `frontend/public/manifest.json`
- `frontend/public/sw.js`
- `frontend/public/index.html`

## 🔍 Finding Specific Features

**Want to modify tier logic?**
→ `backend/tiers/TierManager.js` (line 15-50)

**Want to add a new retailer?**
→ `backend/monitors/RetailerMonitor.js` (line 5-15)
→ `backend/tests/MockDataGenerator.js` (add mock items)

**Want to change feed delay?**
→ `backend/tiers/TierManager.js` (line 42-48)
→ `.env` file (FREE_TIER_DELAY_MINUTES)

**Want to modify UI layout?**
→ `frontend/src/App.jsx` (structure)
→ `frontend/src/App.css` (styling)

**Want to add new component?**
→ `frontend/src/components/` (create new .jsx and .css)
→ Import in `App.jsx`

**Want to add new API endpoint?**
→ `backend/server-dry-run.js` (line 50-300)

**Want to modify tests?**
→ `backend/tests/DryRunValidator.js`

## 📋 Checklist for Common Tasks

### Deploy to Production
1. Update `.env` with production values
2. Run tests: `npm run test`
3. Deploy using DEPLOYMENT_GUIDE.md

### Add New Retailer
1. Add to `RetailerMonitor.RETAILERS`
2. Create mock data in `MockDataGenerator`
3. Add UI config in `CategoryTabs.jsx`
4. Test: `npm run test`

### Modify Tier Rules
1. Edit `TierManager.TIERS`
2. Update delay in `.env`
3. Test: `npm run test`

### Change Frontend Colors
1. Edit `frontend/src/App.css`
2. Update component CSS files
3. Check `manifest.json` theme_color

### Add Feature to Tier
1. Add to `TierManager.TIERS` definition
2. Add access check in component
3. Update tests in `DryRunValidator.js`

---

## 📖 Reading Order

1. **First:** `README-V2.md` - Get overview
2. **Then:** `LAUNCH_SUMMARY.md` - Understand what was built
3. **Then:** This file - Find specific files
4. **For Deployment:** `DEPLOYMENT_GUIDE.md`
5. **For Development:** `scripts/README.md`

---

**Happy coding!** 🚀

