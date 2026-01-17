#!/bin/bash
# ============================================================
# StockSpot: Local Docker CI-Style Build & Validation
# ============================================================

set -e

echo "🔍 Checking Docker availability..."

if ! command -v docker &>/dev/null; then
  echo "❌ Docker is NOT available in this environment."
  echo ""
  echo "👉 FIX THIS FIRST:"
  echo "• Windows/macOS: Install Docker Desktop"
  echo "  https://www.docker.com/products/docker-desktop/"
  echo "• Linux:"
  echo "  sudo apt install docker.io"
  echo "  sudo usermod -aG docker \$USER"
  echo "  (then log out + back in)"
  echo ""
  exit 1
fi

echo "✅ Docker found:"
docker --version

echo ""
echo "🧹 Cleaning old StockSpot test containers/images (safe)..."
docker rm -f stockspot-test-container 2>/dev/null || true
docker rmi stockspot-test 2>/dev/null || true

echo ""
echo "🏗️ Building StockSpot Docker image (this mimics Render)..."
docker build --no-cache -t stockspot-test .

echo ""
echo "✅ Docker build successful."

echo ""
echo "🚀 Running StockSpot in OBSERVER + DRY-RUN mode..."
echo "--------------------------------------------------"

docker run \
  --name stockspot-test-container \
  --env NODE_ENV=production \
  --env DRY_RUN=true \
  --env OBSERVER_MODE=true \
  --env LOG_LEVEL=debug \
  stockspot-test

echo ""
echo "🟢 StockSpot container exited cleanly."
echo "--------------------------------------------------"
echo "✔ Local CI-style Docker validation complete"
