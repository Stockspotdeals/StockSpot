@echo off
REM AutoAffiliateHub-X2 Windows Service Installer
REM Installs and configures AutoAffiliateHub-X2 as a Windows Service using NSSM

setlocal enabledelayedexpansion

REM Configuration
set SERVICE_NAME=AutoAffiliateHub-X2
set SCRIPT_DIR=%~dp0
set PROJECT_ROOT=%SCRIPT_DIR%..\..
set NSSM_URL=https://nssm.cc/release/nssm-2.24.zip
set PYTHON_SCRIPT=%PROJECT_ROOT%\core\startup\orchestrator.py

REM Colors (limited in Windows batch)
set INFO=[INFO]
set SUCCESS=[SUCCESS] 
set WARNING=[WARNING]
set ERROR=[ERROR]

echo ===============================================
echo      AutoAffiliateHub-X2 Windows Service      
echo               Installation Script             
echo ===============================================
echo.

REM Check for administrator privileges
net session >nul 2>&1
if !errorlevel! neq 0 (
    echo %ERROR% This script must be run as Administrator
    echo Right-click and select "Run as Administrator"
    pause
    exit /b 1
)

echo %INFO% Administrator privileges confirmed
echo.

REM Check Python installation
python --version >nul 2>&1
if !errorlevel! neq 0 (
    echo %ERROR% Python not found in PATH
    echo Please install Python and ensure it's in your PATH
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
echo %SUCCESS% Python found: %PYTHON_VERSION%

REM Find Python executable path
for /f "delims=" %%i in ('where python') do set PYTHON_PATH=%%i
echo %INFO% Python path: %PYTHON_PATH%
echo.

REM Check if NSSM is already installed
nssm version >nul 2>&1
if !errorlevel! neq 0 (
    echo %INFO% NSSM not found, attempting to install...
    
    REM Create temp directory
    set TEMP_DIR=%TEMP%\affilly-install
    mkdir "!TEMP_DIR!" 2>nul
    
    REM Download NSSM
    echo %INFO% Downloading NSSM...
    powershell -command "(New-Object System.Net.WebClient).DownloadFile('%NSSM_URL%', '!TEMP_DIR!\nssm.zip')"
    
    if not exist "!TEMP_DIR!\nssm.zip" (
        echo %ERROR% Failed to download NSSM
        echo Please download manually from: %NSSM_URL%
        pause
        exit /b 1
    )
    
    REM Extract NSSM
    echo %INFO% Extracting NSSM...
    powershell -command "Expand-Archive -Path '!TEMP_DIR!\nssm.zip' -DestinationPath '!TEMP_DIR!'"
    
    REM Copy NSSM to system directory
    if exist "!TEMP_DIR!\nssm-2.24\win64\nssm.exe" (
        copy "!TEMP_DIR!\nssm-2.24\win64\nssm.exe" "%WINDIR%\System32\" >nul
        echo %SUCCESS% NSSM installed successfully
    ) else if exist "!TEMP_DIR!\nssm-2.24\win32\nssm.exe" (
        copy "!TEMP_DIR!\nssm-2.24\win32\nssm.exe" "%WINDIR%\System32\" >nul
        echo %SUCCESS% NSSM installed successfully
    ) else (
        echo %ERROR% Failed to extract NSSM
        pause
        exit /b 1
    )
    
    REM Cleanup
    rmdir /s /q "!TEMP_DIR!" 2>nul
) else (
    echo %SUCCESS% NSSM already installed
)

echo.

REM Stop existing service if running
echo %INFO% Checking for existing service...
nssm status %SERVICE_NAME% >nul 2>&1
if !errorlevel! equ 0 (
    echo %INFO% Stopping existing service...
    nssm stop %SERVICE_NAME%
    timeout /t 5 /nobreak >nul
    
    echo %INFO% Removing existing service...
    nssm remove %SERVICE_NAME% confirm
)

REM Install the service
echo %INFO% Installing %SERVICE_NAME% service...

nssm install %SERVICE_NAME% "%PYTHON_PATH%" "%PYTHON_SCRIPT%"
if !errorlevel! neq 0 (
    echo %ERROR% Failed to install service
    pause
    exit /b 1
)

echo %SUCCESS% Service installed successfully

REM Configure service parameters
echo %INFO% Configuring service parameters...

REM Set working directory
nssm set %SERVICE_NAME% AppDirectory "%PROJECT_ROOT%"

REM Set environment variables
nssm set %SERVICE_NAME% AppEnvironmentExtra "NODE_ENV=production" "PYTHONPATH=%PROJECT_ROOT%" "AFFILLY_LOG_LEVEL=INFO"

REM Configure startup
nssm set %SERVICE_NAME% Start SERVICE_AUTO_START
nssm set %SERVICE_NAME% DelayedAutoStart 1

REM Configure failure actions
nssm set %SERVICE_NAME% AppThrottle 5000
nssm set %SERVICE_NAME% AppRestartDelay 10000
nssm set %SERVICE_NAME% AppExit Default Restart

REM Configure logging
set LOG_DIR=%PROJECT_ROOT%\core\startup\logs
mkdir "%LOG_DIR%" 2>nul
nssm set %SERVICE_NAME% AppStdout "%LOG_DIR%\service.log"
nssm set %SERVICE_NAME% AppStderr "%LOG_DIR%\service.error.log"
nssm set %SERVICE_NAME% AppRotateFiles 1
nssm set %SERVICE_NAME% AppRotateOnline 1
nssm set %SERVICE_NAME% AppRotateBytes 10485760

REM Set service description
nssm set %SERVICE_NAME% Description "AutoAffiliateHub-X2 - Automated affiliate marketing and deal discovery system"

REM Set service dependencies
nssm set %SERVICE_NAME% DependOnService Tcpip

echo %SUCCESS% Service configuration completed
echo.

REM Start the service
echo %INFO% Starting %SERVICE_NAME% service...
nssm start %SERVICE_NAME%

if !errorlevel! equ 0 (
    echo %SUCCESS% Service started successfully
) else (
    echo %WARNING% Service installation completed but failed to start
    echo Check the service in Services.msc and review logs in:
    echo %LOG_DIR%
)

echo.
echo ===============================================
echo           Installation Summary               
echo ===============================================
echo Service Name: %SERVICE_NAME%
echo Python Path: %PYTHON_PATH%
echo Script Path: %PYTHON_SCRIPT%
echo Working Directory: %PROJECT_ROOT%
echo Log Directory: %LOG_DIR%
echo.
echo Management Commands:
echo   Start:   nssm start %SERVICE_NAME%
echo   Stop:    nssm stop %SERVICE_NAME%
echo   Restart: nssm restart %SERVICE_NAME%
echo   Status:  nssm status %SERVICE_NAME%
echo   Remove:  nssm remove %SERVICE_NAME% confirm
echo.
echo You can also manage the service through:
echo   - Services.msc (Windows Services Manager)
echo   - Task Manager ^> Services tab
echo   - PowerShell: Get-Service %SERVICE_NAME%
echo ===============================================

pause