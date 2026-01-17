# StockSpot Dry-Run Test Script (PowerShell/Windows)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  StockSpot Dry-Run Validation" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed. Please install Node.js to continue." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Install dependencies if needed
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# Run dry-run tests
Write-Host "🧪 Running dry-run validation tests..." -ForegroundColor Yellow
Write-Host ""

& node backend/dry-run-test.js
$dryRunExit = $LASTEXITCODE

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  Dry-Run Test Results" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if ($dryRunExit -eq 0) {
    Write-Host "✅ All tests PASSED!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Green
    Write-Host "  1. npm run dev        # Start frontend dev server" -ForegroundColor Green
    Write-Host "  2. npm run server     # Start backend dry-run server" -ForegroundColor Green
    Write-Host "  3. Open http://localhost:3000 in browser" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "❌ Some tests FAILED. Check output above for details." -ForegroundColor Red
    exit 1
}

Write-Host ""
