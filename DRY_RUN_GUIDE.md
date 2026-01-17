# 🧪 StockSpot Dry-Run & Testing Guide

**Complete testing framework for all StockSpot features without credentials**

---

## 📋 Available Commands

### 1. Dry-Run Simulator (Interactive)
```bash
npm run dry-run
```
**What it does:**
- Generates 7 mock items across all retailers
- Simulates feed generation for all 3 tiers
- Shows tier-based delays (FREE: 10-min non-Amazon)
- Displays manual items (YEARLY tier only)
- Verifies affiliate link logic
- Tests priority and delay calculations
- Outputs results to JSON file

**Output:**
- Console: Detailed feed simulation with colors
- File: `dry-run-output.json` with full test results

---

### 2. Full Dry-Run + Tests + Server
```bash
npm run dry-run:full
```
**What it does:**
1. Runs the interactive dry-run simulator
2. Runs comprehensive validation tests (7 tests)
3. Starts the API server on http://localhost:3000

**Use for:** Complete system verification

---

### 3. Comprehensive Test Suite
```bash
npm test
```
**What it does:**
- Runs 7 comprehensive validation tests
- Tests all tier logic
- Verifies affiliate conversion
- Validates item deduplication
- Checks RSS feed generation
- Reports success/failure for each test

**Output:**
```
VALIDATION SUMMARY
✓ PASSED: 7
✗ FAILED: 0
SUCCESS RATE: 100.0%
```

---

### 4. Quick Validation
```bash
npm run validate
```
**Same as:** `npm test`

---

### 5. Simulate Only
```bash
npm run simulate
```
**Same as:** `npm run dry-run`

---

### 6. Start Server
```bash
npm start
```
**What it does:**
- Starts Express API server
- Serves mock data on http://localhost:3000
- All 11 API endpoints available
- Health check: GET /health

---

## 🎯 What Each Test Validates

### Test 1: Free Tier Feed (10-min Delay)
```javascript
// FREE tier with non-Amazon items
Item visibility timeline:
- Amazon affiliate items: INSTANT ⚡
- Non-Amazon items: +10 min delay ⏱️

Example:
✓ Pokémon Box (Amazon) - visible now
✓ Walmart Item - available in 10 minutes
```

**Validates:**
- ✓ Correct delay calculation
- ✓ Amazon items prioritized instantly
- ✓ Non-Amazon items delayed appropriately

---

### Test 2: Paid Tier Feed (Instant)
```javascript
// PAID tier
All items visible instantly - no delays

Example:
✓ Amazon item - instant
✓ Walmart item - instant
✓ Target item - instant
```

**Validates:**
- ✓ No delays for any items
- ✓ All retailers treated equally

---

### Test 3: Yearly Tier (Manual Input)
```javascript
// YEARLY tier + manual items
Includes:
- All regular items (instant)
- 3 manual monitoring items
- Manual item add/remove capability

Example:
✓ Regular items (7)
✓ Manual items (3):
  - Custom Pokemon Box Set
  - PlayStation 5
  - Gaming Keyboard
```

**Validates:**
- ✓ Manual items only in YEARLY tier
- ✓ Manual item add/remove works
- ✓ All features accessible

---

### Test 4: Affiliate Link Conversion
```javascript
// Amazon ASIN extraction & link generation
Input: Amazon product URLs
Output: Affiliate-tagged URLs

Example:
✓ URL: https://amazon.com/dp/B0CX1Y2K9J
✓ ASIN: B0CX1Y2K9J
✓ Affiliate: https://amazon.com/dp/B0CX1Y2K9J?tag=associate-id
```

**Validates:**
- ✓ ASIN extraction from URLs
- ✓ Affiliate tag application
- ✓ Link format correctness

---

### Test 5: Tier Feature Gating
```javascript
// Feature access control
Features:
- Manual input (YEARLY only)
- Email alerts (PAID, YEARLY)
- Instant feed (PAID, YEARLY)

Example:
✓ FREE: Manual input DISABLED
✓ PAID: Email ENABLED
✓ YEARLY: Both ENABLED
```

**Validates:**
- ✓ Correct feature availability per tier
- ✓ Access control enforcement

---

### Test 6: Item Deduplication
```javascript
// Remove duplicate items
Before: 9 items (with duplicates)
After: 7 items (deduplicated)
Removed: 2 duplicates

Example:
✓ Same retailer + ASIN = removed
✓ Same name = removed
```

**Validates:**
- ✓ Duplicate detection works
- ✓ Correct count reduction

---

### Test 7: RSS Feed Generation
```javascript
// Generate valid RSS/XML feed
Output: Valid RSS 2.0 XML

Example:
✓ XML declaration present
✓ Channel element valid
✓ Item count correct
✓ Feed size: 2.09 KB
```

**Validates:**
- ✓ RSS structure valid
- ✓ XML well-formed
- ✓ Feed parseable

---

## 📊 Mock Data Structure

### Mock Items (7 total)
```javascript
1. Pokémon Scarlet & Violet Booster Box
   - Retailer: Amazon
   - Price: $129.99
   - Affiliate: ✓
   - Category: Pokemon TCG

2. Elite Series Football Card Collection
   - Retailer: Walmart
   - Price: $34.99
   - Affiliate: ✗
   - Category: Sports Cards

3. One Piece Card Game Tournament Deck
   - Retailer: Target
   - Price: $44.99
   - Affiliate: ✗
   - Category: One Piece TCG

4. PlayStation 5 Console Bundle
   - Retailer: Best Buy
   - Price: $499.99
   - Affiliate: ✗
   - Category: Gaming

5. Limited Edition Gaming Collectible
   - Retailer: GameStop
   - Price: $89.99
   - Affiliate: ✗
   - Category: Limited Exclusive

6. The Art of Pokémon Book
   - Retailer: Amazon
   - Price: $39.99
   - Affiliate: ✓
   - Category: Pokemon TCG

7. Nintendo Switch OLED Monitor
   - Retailer: Target
   - Price: $349.99
   - Affiliate: ✗
   - Category: Gaming
```

### Mock Users (3 tiers)
```javascript
1. FREE Tier User
   - Access: Public items only
   - Delay: 10 min non-Amazon
   - Features: Browse, RSS

2. PAID Tier User ($9.99/mo)
   - Access: Instant all
   - Features: Priority ranking, Email alerts
   
3. YEARLY Tier User ($99/yr)
   - Access: Instant + Manual
   - Features: All + manual monitoring
```

### Manual Items (YEARLY only, 3 mock)
```javascript
1. Custom Pokemon Box Set @ eBay
   - Target Price: $50
   - Current: $75
   
2. PlayStation 5 @ Best Buy
   - Target Price: $500
   - Current: $550
   
3. Gaming Keyboard @ Amazon
   - Target Price: $100
   - Current: $150
```

---

## 🔄 Tier Delay Logic

### FREE Tier
```
Amazon affiliate items    → INSTANT ⚡
Amazon non-affiliate     → +10 min ⏱️
Walmart, Target, etc.    → +10 min ⏱️
```

### PAID Tier
```
All items               → INSTANT ⚡
All retailers           → No delay
```

### YEARLY Tier
```
All items               → INSTANT ⚡
Manual items            → Added by user
```

---

## 📁 Output Files

### 1. Console Output
- Color-coded tier feeds
- Real-time processing logs
- Verification results
- Summary statistics

### 2. JSON Report (`dry-run-output.json`)
```json
{
  "timestamp": "2026-01-15T07:00:00.000Z",
  "tiers": {
    "FREE": { ... },
    "PAID": { ... },
    "YEARLY": { ... }
  },
  "manualItems": { ... },
  "affiliateVerification": { ... },
  "delayVerification": { ... },
  "priorityVerification": { ... }
}
```

---

## ✅ Quick Start Guide

### 1. First Time Setup
```bash
cd StockSpot
npm install
npm test
# Should show: 7/7 PASSING ✓
```

### 2. Run Dry-Run
```bash
npm run dry-run
# Shows interactive tier simulation
```

### 3. Start Server
```bash
npm start
# Server on http://localhost:3000
```

### 4. Test with API
```bash
curl http://localhost:3000/health
# Returns: {"status":"healthy",...}
```

---

## 🐛 Troubleshooting

### Issue: Tests fail
**Solution:**
```bash
npm install
npm test
```

### Issue: Server won't start
**Solution:**
```bash
# Check if port 3000 is in use
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Or use different port
PORT=3001 npm start
```

### Issue: Dry-run shows errors
**Solution:**
```bash
# Clear cache and reinstall
npm run clean
npm install
npm run dry-run
```

---

## 📊 Expected Results

### Dry-Run Output
```
✓ Generated 7 mock items
✓ Generated 3 mock users
✓ FREE tier: 2 visible, 5 delayed
✓ PAID tier: 7 items (all instant)
✓ YEARLY tier: 10 items + manual
✓ Affiliate verification complete
✓ All delay rules verified
```

### Test Results
```
✓ TEST 1: Feed Generation - Free Tier - PASSED
✓ TEST 2: Feed Generation - Paid Tier - PASSED
✓ TEST 3: Feed Generation - Yearly Tier - PASSED
✓ TEST 4: Affiliate Link Conversion - PASSED
✓ TEST 5: Tier Feature Access Control - PASSED
✓ TEST 6: Item Deduplication - PASSED
✓ TEST 7: RSS Feed Generation - PASSED

RESULT: 7/7 PASSING (100% SUCCESS RATE)
```

---

## 🔌 API Endpoints (in Dry-Run Server)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/api/feed` | GET | Get feed (tier-aware) |
| `/api/tiers` | GET | Tier info |
| `/api/retailers` | GET | Retailer list |
| `/api/categories` | GET | Category list |
| `/rss.xml` | GET | RSS feed |
| `/api/manual-items` | POST/GET | Manual monitoring |

---

## 🎯 Testing Checklist

- [ ] Run `npm test` - verify 7/7 passing
- [ ] Run `npm run dry-run` - verify all tiers work
- [ ] Check console output for correct tier delays
- [ ] Verify manual items in YEARLY tier only
- [ ] Check affiliate links generated correctly
- [ ] Verify JSON output created
- [ ] Start server with `npm start`
- [ ] Test `/health` endpoint
- [ ] Verify RSS feed generates
- [ ] Test all API endpoints

---

## 📝 Notes

- **Dry-run uses mock data only** - No real API calls
- **No credentials required** - All tests work without keys
- **Colors in output** - Check console supports ANSI colors
- **JSON output** - Always generated after dry-run
- **Tests are idempotent** - Can run multiple times

---

**Status:** ✅ All systems tested and verified  
**Last Updated:** January 15, 2026  
**Ready for:** Production deployment

For more information, see:
- [README.md](README.md) - Main documentation
- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) - Deployment options
- [FILE_REFERENCE.md](FILE_REFERENCE.md) - Code organization
