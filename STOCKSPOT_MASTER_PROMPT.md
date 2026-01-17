# STOCKSPOT PIVOT TO PWA + EMAIL/RSS + AMAZON + MULTI-RETAILER AUTONOMOUS FEED

## PROJECT OBJECTIVES

### 1. Backend Autonomous Monitoring
- Detect and classify items from multiple retailers:
  - **Amazon** (affiliate and non-affiliate items)
  - **Walmart, Target, Best Buy, GameStop, and others**
- **Categories:**
  - Pokémon TCG
  - One Piece TCG
  - Sports Cards
  - Limited / Exclusive / Hype items
- **Restock detection** for all retailers
- **Amazon affiliate auto-conversion** for eligible items
- **Multi-retailer detection:**
  - Price drops
  - Limited editions
  - Hype releases
  - Apply priority tagging (High-confidence / Likely to sell out)
- **Duplicate suppression**

### 2. Monetization & Tier Rules
```
FREE TIER:
  ✓ All categories including Pokémon
  ✓ 10-minute delayed feed for non-Amazon items
  ✓ Instant feed for Amazon affiliate items
  ✗ No manual input
  ✓ Web/PWA access only

PAID TIER ($9.99/month):
  ✓ Instant feed for all items
  ✓ Priority feed ranking
  ✓ Email notifications (optional later)
  ✓ Access to all feeds/categories

YEARLY TIER ($99/year):
  ✓ Same as Paid Tier benefits
  ✓ Manual item input monitoring
  ✓ Add retailer + URL to monitor
  ✓ Locked feed for free/paid users
```

### 3. Frontend / App (PWA + Dashboard)
- Minimal, sleek UI:
  - Home feed (latest items → oldest)
  - Retailer tabs (Amazon / Walmart / Target / etc.)
  - Item card display:
    - Name, retailer logo, price, stock status, affiliate link button
  - Manual input form (Year tier only)
  - Tier upgrade CTAs
- PWA installable
- Mobile-first responsive design

### 4. Remove Unnecessary Functionality
- Remove Twitter/X, Reddit, Telegram integrations
- Remove social API calls and modules
- Remove demo/test scripts not needed for PWA + RSS/Email + monitoring

### 5. Dry-Run & Test Mode
- No API keys required
- Simulate retailer feeds with mock data
- Simulate affiliate link conversion
- Simulate restock detection and delay logic
- Console/local logs for verification
- Validate tier gating
- Validate manual input for Year tier
- Confirm feed ordering (newest → oldest)

### 6. Code Organization
```
backend/
  ├── scrapers/          # Retailer data fetchers
  ├── monitors/          # Restock detection
  ├── feeds/             # Feed generation logic
  ├── tiers/             # Tier monetization logic
  ├── affiliate/         # Amazon affiliate conversion
  ├── models/            # Database schemas
  ├── routes/            # API endpoints
  ├── middleware/        # Auth, validation
  ├── utils/             # Helpers
  └── tests/             # Test files

frontend/
  ├── src/
  │   ├── components/    # React components
  │   ├── pages/         # Page components
  │   ├── styles/        # CSS/Tailwind
  │   ├── utils/         # Frontend helpers
  │   └── pwa/           # PWA config
  └── public/

scripts/
  ├── dry-run.sh
  ├── dry-run.ps1
  └── mock-data.js

configs/
  ├── .env.example
  └── mock-retailers.json
```

### 7. Implementation Details
- **Amazon affiliate auto-conversion:** Eligible items only
- **Delay logic:**
  - Free: 10min delay for non-Amazon, instant for Amazon affiliate
  - Paid/Year: Instant for all items
- **Manual input (Year tier only):**
  - Retailer dropdown + URL input + Add button
  - Newly monitored items appear per tier logic
- **Restock detection:**
  - Track inventory status changes
  - Update feed accordingly
  - Apply tier delay rules
- **Priority tagging:**
  - Use discount %, demand indicator, rarity/exclusivity
  - Feed displays high-confidence items first
- **Mock data for dry-run:**
  - Amazon, Walmart, Target examples
  - Include price, stock status, category, hype/limited flags

### 8. Testing
- Create dry-run scripts (`.sh` and `.ps1`)
- Launch backend with dry-run data
- Launch frontend in dev mode
- Output logs to console
- Verify feed order, affiliate conversion, tier delays
- Verify manual input (Year tier only)

### 9. VS Code Implementation
1. Generate all files (frontend + backend + scripts + Dockerfile)
2. Implement tier logic, monetization, Amazon affiliate, multi-retailer restocks
3. Preserve existing useful backend logic
4. Remove social and demo code
5. Dry-run fully functional without credentials
6. Include comments for clarity
7. Ready for Render deployment

---

## Current Status
- **Date Created:** January 15, 2026
- **Phase:** Full Refactor & Feature Implementation
- **Target Deployment:** Render (Containerized)
- **Tech Stack:** Node.js, Express, React/Vite, MongoDB (with local fallback), Tailwind CSS
