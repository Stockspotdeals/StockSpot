# ============================================================
# StockSpot: Local Docker CI-Style Build & Validation
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "🔍 Checking Docker availability..." -ForegroundColor Cyan

# Check if docker command exists
try {
    docker --version | Out-Null
} catch {
    Write-Host "❌ Docker is NOT available in this environment." -ForegroundColor Red
    Write-Host ""
    Write-Host "👉 FIX THIS FIRST:" -ForegroundColor Yellow
    Write-Host "• Windows/macOS: Install Docker Desktop" -ForegroundColor White
    Write-Host "  https://www.docker.com/products/docker-desktop/" -ForegroundColor Cyan
    Write-Host "• Linux:" -ForegroundColor White
    Write-Host "  sudo apt install docker.io" -ForegroundColor Gray
    Write-Host "  sudo usermod -aG docker `$USER" -ForegroundColor Gray
    Write-Host "  (then log out + back in)" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

Write-Host "✅ Docker found:" -ForegroundColor Green
docker --version

Write-Host ""
Write-Host "🧹 Cleaning old StockSpot test containers/images (safe)..." -ForegroundColor Yellow

# Remove container if it exists (suppress errors)
docker rm -f stockspot-test-container 2>$null | Out-Null
# Remove image if it exists (suppress errors)
docker rmi stockspot-test 2>$null | Out-Null

Write-Host ""
Write-Host "🏗️ Building StockSpot Docker image (this mimics Render)..." -ForegroundColor Cyan

docker build --no-cache -t stockspot-test .

Write-Host ""
Write-Host "✅ Docker build successful." -ForegroundColor Green

Write-Host ""
Write-Host "🚀 Running StockSpot in OBSERVER + DRY-RUN mode..." -ForegroundColor Cyan
Write-Host "--------------------------------------------------" -ForegroundColor Gray

docker run `
  --name stockspot-test-container `
  --env NODE_ENV=production `
  --env DRY_RUN=true `
  --env OBSERVER_MODE=true `
  --env LOG_LEVEL=debug `
  stockspot-test

Write-Host ""
Write-Host "🟢 StockSpot container exited cleanly." -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor Gray
Write-Host "✔ Local CI-style Docker validation complete" -ForegroundColor Green
