#!/bin/bash
# StockSpot Dry-Run Test Script (Bash/Linux/macOS)

set -e

echo ""
echo "=========================================="
echo "  StockSpot Dry-Run Validation"
echo "=========================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js to continue."
    exit 1
fi

echo "✓ Node.js $(node --version) detected"
echo ""

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Run dry-run tests
echo "🧪 Running dry-run validation tests..."
echo ""
node backend/dry-run-test.js
DRY_RUN_EXIT=$?

echo ""
echo "=========================================="
echo "  Dry-Run Test Results"
echo "=========================================="

if [ $DRY_RUN_EXIT -eq 0 ]; then
    echo "✅ All tests PASSED!"
    echo ""
    echo "Next steps:"
    echo "  1. npm run dev        # Start frontend dev server"
    echo "  2. npm run server     # Start backend dry-run server"
    echo "  3. Open http://localhost:3000 in browser"
    echo ""
else
    echo "❌ Some tests FAILED. Check output above for details."
    exit 1
fi

echo ""
