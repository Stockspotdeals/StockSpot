# ============================================================
# StockSpot Docker CI-Style Validation (PowerShell)
# ============================================================

Write-Host "🔍 Checking Docker availability..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "Docker is not installed or not in PATH. Install Docker Desktop first."
  exit 1
}

docker --version

Write-Host "🧹 Cleaning old test containers/images..."
docker rm -f stockspot-test-container 2>$null
docker rmi stockspot-test 2>$null

Write-Host "🏗️ Building Docker image (Render parity)..."
docker build --no-cache -t stockspot-test .

Write-Host "🚀 Running StockSpot in OBSERVER + DRY-RUN mode..."
docker run `
  --name stockspot-test-container `
  --env NODE_ENV=production `
  --env DRY_RUN=true `
  --env OBSERVER_MODE=true `
  --env LOG_LEVEL=debug `
  stockspot-test

Write-Host "✅ Docker validation complete."
