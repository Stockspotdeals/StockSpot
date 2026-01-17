# StockSpot Scripts

Utility scripts for development, testing, and deployment.

## Quick Start Scripts

### quickstart.sh (Linux/macOS)
- Installs dependencies
- Runs validation tests
- Starts server on `http://localhost:3000`

```bash
./scripts/quickstart.sh
```

### quickstart.ps1 (Windows)
- Installs dependencies
- Runs validation tests
- Starts server on `http://localhost:3000`

```powershell
.\scripts\quickstart.ps1
```

## Dry-Run Testing

### dry-run.sh (Linux/macOS)
Complete dry-run validation without credentials:

```bash
./scripts/dry-run.sh
```

Tests:
- Feed generation for all tiers
- Affiliate link conversion
- Tier delay enforcement
- Item deduplication
- RSS feed generation
- Feature access control

### dry-run.ps1 (Windows)
Same functionality for Windows PowerShell:

```powershell
.\scripts\dry-run.ps1
```

## npm Scripts

From project root:

```bash
npm start          # Start server in dry-run mode
npm run dry-run    # Run tests + start server
npm run test       # Run validation tests only
npm run server     # Explicitly start server
npm run validate   # Alias for test
```

## Docker Validation (Legacy)

### docker-validate.sh
Use on macOS, Linux, WSL, or CI environments.

### docker-validate.ps1
Use on Windows with PowerShell.

Both scripts:
- Build the Docker image locally
- Run StockSpot in observer + dry-run mode
- Mirror Render's production runtime

## Testing Workflow

1. **Validate Setup:**
   ```bash
   npm run test
   ```

2. **Start Server:**
   ```bash
   npm start
   ```

3. **Test Endpoints:**
   ```bash
   # Feed (free tier)
   curl "http://localhost:3000/api/feed?tier=free"
   
   # RSS feed
   curl "http://localhost:3000/rss.xml"
   
   # Health check
   curl "http://localhost:3000/health"
   ```

## Tier Testing

### Free Tier (10-min delay for non-Amazon)
```bash
curl "http://localhost:3000/api/feed?tier=free"
```

### Paid Tier (Instant for all)
```bash
curl "http://localhost:3000/api/feed?tier=paid"
```

### Yearly Tier (Manual items enabled)
```bash
curl "http://localhost:3000/api/feed?tier=yearly"

# Add custom monitor
curl -X POST http://localhost:3000/api/manual-items \
  -H "Content-Type: application/json" \
  -d '{"tier":"yearly","retailer":"amazon","url":"https://amazon.com","name":"Custom"}'
```

## Filtering

```bash
# By category
curl "http://localhost:3000/api/feed?tier=free&category=pokemon-tcg"

# By retailer
curl "http://localhost:3000/api/feed?tier=free&retailer=amazon"

# RSS with limit
curl "http://localhost:3000/rss.xml?tier=free&limit=20"
```

## Notes

- All scripts require Node.js 18+
- Dry-run mode uses mock data (no credentials needed)
- Test results saved to `dry-run-report.json`
- For production, set real API credentials in `.env`
