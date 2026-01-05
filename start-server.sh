#!/bin/bash

# StockSpot Backend Startup Script
# This script helps you get the Node.js backend running quickly

echo "🎯 Starting StockSpot Backend Server..."
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version 18+ required. Current version: $(node --version)"
    echo "   Please upgrade Node.js from: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node --version) detected"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo "❌ package.json not found. Make sure you're in the project root directory."
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Check if .env file exists, if not copy from .env.example
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        echo "📋 Creating .env file from .env.example..."
        cp .env.example .env
        echo "⚠️  Please edit .env file with your actual API credentials"
    else
        echo "⚠️  No .env file found. Creating basic one..."
        cat > .env << EOF
NODE_ENV=development
PORT=3001
JWT_SECRET=development-secret-change-in-production
EOF
    fi
fi

echo "🚀 Starting server..."
echo "📍 Server will be available at: http://localhost:3001"
echo "📊 Health check: http://localhost:3001/api/health"
echo "📚 API info: http://localhost:3001/api/info"
echo ""
echo "Press Ctrl+C to stop the server"
echo "=================================="

# Start the server
npm start