#!/bin/bash
# Quick Start Script for StockSpot (Linux/macOS)

set -e

echo ""
echo "=========================================="
echo "  StockSpot - Quick Start"
echo "=========================================="
echo ""

# Detect OS
OS_TYPE=$(uname -s)

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Install from: https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "✓ Node.js $NODE_VERSION detected"

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo ""
    echo "📦 Installing dependencies..."
    npm install
fi

# Run tests
echo ""
echo "🧪 Running validation tests..."
npm run test

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Tests passed!"
    echo ""
    echo "=========================================="
    echo "  Starting StockSpot Server"
    echo "=========================================="
    echo ""
    echo "🚀 Server starting on http://localhost:3000"
    echo ""
    echo "Available endpoints:"
    echo "  • Dashboard:  http://localhost:3000"
    echo "  • API Feed:   http://localhost:3000/api/feed"
    echo "  • RSS:        http://localhost:3000/rss.xml"
    echo "  • Health:     http://localhost:3000/health"
    echo ""
    
    npm start
else
    echo ""
    echo "❌ Tests failed. Check output above."
    exit 1
fi
