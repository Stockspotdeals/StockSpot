# Quick Start Script for StockSpot (PowerShell/Windows)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  StockSpot - Quick Start" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "✓ Node.js $nodeVersion detected" -ForegroundColor Green
} catch {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    Write-Host "   Install from: https://nodejs.org" -ForegroundColor Yellow
    exit 1
}

# Install dependencies
if (-not (Test-Path "node_modules")) {
    Write-Host ""
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# Run tests
Write-Host ""
Write-Host "🧪 Running validation tests..." -ForegroundColor Yellow
npm run test

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Tests passed!" -ForegroundColor Green
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  Starting StockSpot Server" -ForegroundColor Cyan
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "🚀 Server starting on http://localhost:3000" -ForegroundColor Green
    Write-Host ""
    Write-Host "Available endpoints:" -ForegroundColor Green
    Write-Host "  • Dashboard:  http://localhost:3000" -ForegroundColor Green
    Write-Host "  • API Feed:   http://localhost:3000/api/feed" -ForegroundColor Green
    Write-Host "  • RSS:        http://localhost:3000/rss.xml" -ForegroundColor Green
    Write-Host "  • Health:     http://localhost:3000/health" -ForegroundColor Green
    Write-Host ""
    
    npm start
} else {
    Write-Host ""
    Write-Host "❌ Tests failed. Check output above." -ForegroundColor Red
    exit 1
}
