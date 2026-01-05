@echo off
echo 🎯 Starting StockSpot Backend Server...
echo ==================================

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 18+ first.
    echo    Download from: https://nodejs.org/
    pause
    exit /b 1
)

echo ✅ Node.js detected: 
node --version

:: Check if package.json exists
if not exist "package.json" (
    echo ❌ package.json not found. Make sure you're in the project root directory.
    pause
    exit /b 1
)

:: Install dependencies if node_modules doesn't exist
if not exist "node_modules" (
    echo 📦 Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Failed to install dependencies
        pause
        exit /b 1
    )
)

:: Check if .env file exists, if not copy from .env.example
if not exist ".env" (
    if exist ".env.example" (
        echo 📋 Creating .env file from .env.example...
        copy ".env.example" ".env"
        echo ⚠️  Please edit .env file with your actual API credentials
    ) else (
        echo ⚠️  No .env file found. Creating basic one...
        echo NODE_ENV=development > .env
        echo PORT=3001 >> .env
        echo JWT_SECRET=development-secret-change-in-production >> .env
    )
)

echo 🚀 Starting server...
echo 📍 Server will be available at: http://localhost:3001
echo 📊 Health check: http://localhost:3001/api/health
echo 📚 API info: http://localhost:3001/api/info
echo.
echo Press Ctrl+C to stop the server
echo ==================================

:: Start the server
call npm start

pause