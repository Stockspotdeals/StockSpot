#!/usr/bin/env bash
# ============================================================
# StockSpot Docker CI-Style Validation (Bash)
# ============================================================

set -e

echo "🔍 Checking Docker availability..."
if ! command -v docker &>/dev/null; then
  echo "❌ Docker is not installed or not on PATH."
  exit 1
fi

docker --version

echo "🧹 Cleaning old test containers/images..."
docker rm -f stockspot-test-container 2>/dev/null || true
docker rmi stockspot-test 2>/dev/null || true

echo "🏗️ Building Docker image (Render parity)..."
docker build --no-cache -t stockspot-test .

echo "🚀 Running StockSpot in OBSERVER + DRY-RUN mode..."
docker run \
  --name stockspot-test-container \
  --env NODE_ENV=production \
  --env DRY_RUN=true \
  --env OBSERVER_MODE=true \
  --env LOG_LEVEL=debug \
  stockspot-test

echo "✅ Docker validation complete."
