@echo off
REM AutoAffiliateHub-X2 Autonomous Scheduler Startup Script
REM 
REM This script launches the autonomous scheduler with proper configuration.
REM The scheduler will continuously discover deals, generate affiliate links,
REM create captions, and schedule social media posts.

echo.
echo ========================================
echo   AutoAffiliateHub-X2 Scheduler
echo ========================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

REM Change to script directory
cd /d "%~dp0"

echo Current directory: %cd%
echo.

REM Check if config file exists
if not exist "config.yaml" (
    echo ERROR: config.yaml not found
    echo Please ensure you're running this from the project root
    pause
    exit /b 1
)

echo Available run modes:
echo.
echo 1. Test Mode (recommended for first run)
echo 2. Production Mode (requires real API keys)
echo 3. Custom config file
echo 4. View current config
echo 5. Exit
echo.

set /p choice="Select an option (1-5): "

if "%choice%"=="1" (
    echo.
    echo Starting in TEST MODE...
    echo - Uses mock data instead of real APIs
    echo - Safe to run without API credentials
    echo - Posts are simulated, not actually sent
    echo.
    echo Press Ctrl+C to stop the scheduler
    echo.
    python app/auto_scheduler.py --test-mode
) else if "%choice%"=="2" (
    echo.
    echo Starting in PRODUCTION MODE...
    echo WARNING: This will use real APIs and post to social media
    echo Make sure your .env file has valid credentials
    echo.
    set /p confirm="Are you sure? (y/N): "
    if /i "%confirm%"=="y" (
        python app/auto_scheduler.py --production-mode
    ) else (
        echo Cancelled
    )
) else if "%choice%"=="3" (
    set /p configfile="Enter config file path: "
    python app/auto_scheduler.py --config "%configfile%"
) else if "%choice%"=="4" (
    echo.
    echo Current configuration:
    type config.yaml
) else if "%choice%"=="5" (
    echo Goodbye!
    exit /b 0
) else (
    echo Invalid choice
)

echo.
echo Press any key to exit...
pause >nul