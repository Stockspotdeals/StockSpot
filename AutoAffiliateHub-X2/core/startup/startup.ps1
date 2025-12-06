#!/usr/bin/env powershell

<#
.SYNOPSIS
    AutoAffiliateHub-X2 PowerShell Startup Script
    
.DESCRIPTION
    Cross-platform PowerShell script for starting and managing AutoAffiliateHub-X2
    Supports Windows, macOS, and Linux with automatic environment detection
    
.PARAMETER Action
    Action to perform: start, stop, restart, status, install, uninstall
    
.PARAMETER Environment
    Force specific environment: aws, gcp, azure, docker, linux-server, macos, windows
    
.PARAMETER SkipDeps
    Skip dependency installation
    
.PARAMETER NoHealthCheck
    Skip health check after startup
    
.EXAMPLE
    .\startup.ps1 -Action start
    .\startup.ps1 -Action status  
    .\startup.ps1 -Action install -Environment windows
#>

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("start", "stop", "restart", "status", "install", "uninstall", "health")]
    [string]$Action = "start",
    
    [Parameter(Mandatory=$false)]
    [ValidateSet("aws", "gcp", "azure", "docker", "linux-server", "macos", "windows", "auto")]
    [string]$Environment = "auto",
    
    [Parameter(Mandatory=$false)]
    [switch]$SkipDeps,
    
    [Parameter(Mandatory=$false)]
    [switch]$NoHealthCheck
)

# Configuration
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$LogDir = Join-Path $PSScriptRoot "logs"
$ServiceName = "AutoAffiliateHub-X2"

# Ensure log directory exists
if (!(Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Logging functions
function Write-Log {
    param([string]$Level, [string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logMessage = "[$timestamp] [$Level] $Message"
    Write-Host $logMessage
    Add-Content -Path (Join-Path $LogDir "startup.log") -Value $logMessage
}

function Write-Info { param([string]$Message) Write-Log "INFO" $Message }
function Write-Success { param([string]$Message) Write-Host "[SUCCESS] $Message" -ForegroundColor Green; Write-Log "SUCCESS" $Message }
function Write-Warning { param([string]$Message) Write-Host "[WARNING] $Message" -ForegroundColor Yellow; Write-Log "WARNING" $Message }
function Write-Error { param([string]$Message) Write-Host "[ERROR] $Message" -ForegroundColor Red; Write-Log "ERROR" $Message }

# Environment detection
function Get-Environment {
    Write-Info "Detecting environment..."
    
    if ($Environment -ne "auto") {
        Write-Info "Using forced environment: $Environment"
        return $Environment
    }
    
    # Check for cloud providers
    if ($env:AWS_EXECUTION_ENV -or $env:AWS_LAMBDA_FUNCTION_NAME -or (Test-Path "/opt/aws/bin/cfn-signal")) {
        return "aws"
    }
    elseif ($env:GOOGLE_CLOUD_PROJECT -or (Test-Path "/usr/bin/google_metadata_script_runner")) {
        return "gcp"
    }
    elseif ($env:WEBSITE_SITE_NAME -or (Test-Path "/opt/microsoft")) {
        return "azure"
    }
    elseif (Test-Path "/.dockerenv") {
        return "docker"
    }
    elseif ($IsLinux -and (Get-Command systemctl -ErrorAction SilentlyContinue)) {
        return "linux-server"
    }
    elseif ($IsMacOS) {
        return "macos"
    }
    elseif ($IsWindows) {
        return "windows"
    }
    else {
        return "unknown"
    }
}

# Check system requirements
function Test-SystemRequirements {
    Write-Info "Checking system requirements..."
    $requirementsMet = $true
    
    # Check Python
    try {
        $pythonVersion = & python --version 2>&1
        if ($pythonVersion -match "Python 3\.") {
            Write-Success "Python 3 found: $pythonVersion"
        } else {
            Write-Error "Python 3 required, found: $pythonVersion"
            $requirementsMet = $false
        }
    } catch {
        try {
            $pythonVersion = & python3 --version 2>&1
            Write-Success "Python 3 found: $pythonVersion"
        } catch {
            Write-Error "Python 3 not found"
            $requirementsMet = $false
        }
    }
    
    # Check Node.js (optional)
    try {
        $nodeVersion = & node --version 2>&1
        Write-Success "Node.js found: $nodeVersion"
    } catch {
        Write-Warning "Node.js not found (optional for orchestrator)"
    }
    
    # Check project files
    $requiredFiles = @(
        "app/auto_scheduler.py",
        "app/dashboard.py", 
        "app/deal_engine.py",
        "app/posting_engine.py",
        "app/queue_manager.py",
        "requirements.txt",
        "config.json"
    )
    
    foreach ($file in $requiredFiles) {
        $filePath = Join-Path $ProjectRoot $file
        if (Test-Path $filePath) {
            Write-Success "Required file found: $file"
        } else {
            Write-Error "Required file missing: $file"
            $requirementsMet = $false
        }
    }
    
    return $requirementsMet
}

# Install dependencies
function Install-Dependencies {
    if ($SkipDeps) {
        Write-Info "Skipping dependency installation"
        return
    }
    
    Write-Info "Installing Python dependencies..."
    Push-Location $ProjectRoot
    
    try {
        if (Test-Path "requirements.txt") {
            if (Get-Command pip3 -ErrorAction SilentlyContinue) {
                & pip3 install -r requirements.txt
            } elseif (Get-Command pip -ErrorAction SilentlyContinue) {
                & pip install -r requirements.txt
            } else {
                Write-Error "pip not found"
                return $false
            }
            Write-Success "Python dependencies installed"
        } else {
            Write-Warning "requirements.txt not found"
        }
    } catch {
        Write-Error "Failed to install dependencies: $_"
        return $false
    } finally {
        Pop-Location
    }
    
    return $true
}

# Get running processes
function Get-AfillyProcesses {
    $processes = @()
    
    # Check for Python processes
    $pythonProcs = Get-Process -Name "python*" -ErrorAction SilentlyContinue | 
                   Where-Object { $_.CommandLine -like "*affilly*" -or $_.CommandLine -like "*orchestrator*" }
    $processes += $pythonProcs
    
    # Check for Node processes
    $nodeProcs = Get-Process -Name "node*" -ErrorAction SilentlyContinue |
                 Where-Object { $_.CommandLine -like "*affilly*" -or $_.CommandLine -like "*orchestrator*" }
    $processes += $nodeProcs
    
    return $processes
}

# Start services
function Start-Services {
    param([string]$DetectedEnvironment)
    
    Write-Info "Starting services for environment: $DetectedEnvironment"
    Push-Location $ProjectRoot
    
    try {
        switch ($DetectedEnvironment) {
            { $_ -in @("aws", "gcp", "azure") } {
                if (Get-Command pm2 -ErrorAction SilentlyContinue) {
                    Write-Info "Starting with PM2..."
                    & pm2 start core/startup/pm2.config.js --env production
                    Write-Success "PM2 processes started"
                } elseif (Get-Command node -ErrorAction SilentlyContinue) {
                    Write-Info "Starting Node.js orchestrator..."
                    $job = Start-Job -ScriptBlock { 
                        Set-Location $using:ProjectRoot
                        & node core/startup/orchestrator.js 
                    }
                    Write-Success "Node.js orchestrator started (Job ID: $($job.Id))"
                } else {
                    Write-Info "Starting Python orchestrator..."
                    $job = Start-Job -ScriptBlock { 
                        Set-Location $using:ProjectRoot
                        & python core/startup/orchestrator.py 
                    }
                    Write-Success "Python orchestrator started (Job ID: $($job.Id))"
                }
            }
            "docker" {
                Write-Info "Starting Python orchestrator for Docker..."
                $job = Start-Job -ScriptBlock { 
                    Set-Location $using:ProjectRoot
                    & python core/startup/orchestrator.py 
                }
                Write-Success "Docker orchestrator started (Job ID: $($job.Id))"
            }
            "linux-server" {
                if ($IsLinux -and (Get-Command systemctl -ErrorAction SilentlyContinue)) {
                    Write-Info "Starting with systemd..."
                    & sudo systemctl start affilly
                    & sudo systemctl enable affilly
                    Write-Success "systemd service started"
                } elseif (Get-Command pm2 -ErrorAction SilentlyContinue) {
                    Write-Info "Starting with PM2..."
                    & pm2 start core/startup/pm2.config.js --env production
                    & pm2 save
                    & pm2 startup
                    Write-Success "PM2 processes started"
                } else {
                    Write-Info "Starting Python orchestrator..."
                    $job = Start-Job -ScriptBlock { 
                        Set-Location $using:ProjectRoot
                        & python core/startup/orchestrator.py 
                    }
                    Write-Success "Python orchestrator started (Job ID: $($job.Id))"
                }
            }
            "windows" {
                # Check for Windows service first
                $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
                if ($service) {
                    Write-Info "Starting Windows service..."
                    Start-Service -Name $ServiceName
                    Write-Success "Windows service started"
                } elseif (Get-Command node -ErrorAction SilentlyContinue) {
                    Write-Info "Starting Node.js orchestrator..."
                    $job = Start-Job -ScriptBlock { 
                        Set-Location $using:ProjectRoot
                        & node core/startup/orchestrator.js 
                    }
                    Write-Success "Node.js orchestrator started (Job ID: $($job.Id))"
                } else {
                    Write-Info "Starting Python orchestrator..."
                    $job = Start-Job -ScriptBlock { 
                        Set-Location $using:ProjectRoot
                        & python core/startup/orchestrator.py 
                    }
                    Write-Success "Python orchestrator started (Job ID: $($job.Id))"
                }
            }
            { $_ -in @("macos", "unknown") } {
                if (Get-Command node -ErrorAction SilentlyContinue) {
                    Write-Info "Starting Node.js orchestrator..."
                    $job = Start-Job -ScriptBlock { 
                        Set-Location $using:ProjectRoot
                        & node core/startup/orchestrator.js 
                    }
                    Write-Success "Node.js orchestrator started (Job ID: $($job.Id))"
                } else {
                    Write-Info "Starting Python orchestrator..."
                    $job = Start-Job -ScriptBlock { 
                        Set-Location $using:ProjectRoot
                        & python core/startup/orchestrator.py 
                    }
                    Write-Success "Python orchestrator started (Job ID: $($job.Id))"
                }
            }
        }
    } catch {
        Write-Error "Failed to start services: $_"
        return $false
    } finally {
        Pop-Location
    }
    
    return $true
}

# Stop services
function Stop-Services {
    Write-Info "Stopping AutoAffiliateHub-X2 services..."
    
    # Stop Windows service
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Running") {
        Write-Info "Stopping Windows service..."
        Stop-Service -Name $ServiceName
        Write-Success "Windows service stopped"
    }
    
    # Stop PM2 processes
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        try {
            & pm2 stop all
            Write-Success "PM2 processes stopped"
        } catch {
            Write-Warning "Failed to stop PM2 processes"
        }
    }
    
    # Stop systemd service
    if ($IsLinux -and (Get-Command systemctl -ErrorAction SilentlyContinue)) {
        try {
            & sudo systemctl stop affilly
            Write-Success "systemd service stopped"
        } catch {
            Write-Warning "Failed to stop systemd service"
        }
    }
    
    # Stop PowerShell jobs
    $jobs = Get-Job | Where-Object { $_.Command -like "*orchestrator*" }
    if ($jobs) {
        Write-Info "Stopping PowerShell jobs..."
        $jobs | Stop-Job
        $jobs | Remove-Job
        Write-Success "PowerShell jobs stopped"
    }
    
    # Kill remaining processes
    $processes = Get-AfillyProcesses
    if ($processes) {
        Write-Info "Terminating remaining processes..."
        $processes | Stop-Process -Force
        Write-Success "Processes terminated"
    }
}

# Health check
function Test-Health {
    Write-Info "Performing health checks..."
    
    $healthPassed = $true
    $maxRetries = 3
    $retryCount = 0
    
    while ($retryCount -lt $maxRetries) {
        Write-Info "Health check attempt $($retryCount + 1)/$maxRetries"
        
        # Check web endpoint
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:5000/health" -TimeoutSec 10 -UseBasicParsing
            if ($response.StatusCode -eq 200) {
                Write-Success "Dashboard health check passed"
                $healthPassed = $true
                break
            }
        } catch {
            Write-Warning "Dashboard health check failed (attempt $($retryCount + 1)): $_"
            $healthPassed = $false
        }
        
        # Check processes
        $processes = Get-AfillyProcesses
        if ($processes) {
            Write-Success "Found $($processes.Count) running processes"
            $healthPassed = $true
            break
        } else {
            Write-Warning "No running processes found (attempt $($retryCount + 1))"
            $healthPassed = $false
        }
        
        $retryCount++
        if ($retryCount -lt $maxRetries) {
            Write-Info "Waiting 10 seconds before retry..."
            Start-Sleep -Seconds 10
        }
    }
    
    return $healthPassed
}

# Get status
function Get-Status {
    Write-Host "`n===============================================" -ForegroundColor Cyan
    Write-Host "         AutoAffiliateHub-X2 Status           " -ForegroundColor Cyan  
    Write-Host "===============================================" -ForegroundColor Cyan
    
    $env = Get-Environment
    Write-Host "Environment: $env"
    Write-Host "Project Root: $ProjectRoot"
    Write-Host "Log Directory: $LogDir"
    Write-Host ""
    
    # Windows Service Status
    $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
    if ($service) {
        Write-Host "Windows Service: $($service.Status)" -ForegroundColor $(if($service.Status -eq "Running"){"Green"}else{"Red"})
    } else {
        Write-Host "Windows Service: Not installed" -ForegroundColor Yellow
    }
    
    # PM2 Status
    if (Get-Command pm2 -ErrorAction SilentlyContinue) {
        Write-Host "`nPM2 Status:" -ForegroundColor Yellow
        try {
            & pm2 list | Where-Object { $_ -match "affilly" }
        } catch {
            Write-Host "  No PM2 processes found"
        }
    }
    
    # PowerShell Jobs
    $jobs = Get-Job | Where-Object { $_.Command -like "*orchestrator*" }
    if ($jobs) {
        Write-Host "`nPowerShell Jobs:" -ForegroundColor Yellow
        $jobs | Format-Table Id, State, Command -AutoSize
    }
    
    # Running Processes
    $processes = Get-AfillyProcesses
    if ($processes) {
        Write-Host "`nRunning Processes:" -ForegroundColor Yellow
        $processes | Format-Table Id, ProcessName, StartTime -AutoSize
    } else {
        Write-Host "`nRunning Processes: None found" -ForegroundColor Red
    }
    
    Write-Host "`n===============================================" -ForegroundColor Cyan
}

# Install as Windows service
function Install-WindowsService {
    if (-not $IsWindows) {
        Write-Warning "Windows service installation only available on Windows"
        return
    }
    
    Write-Info "Installing Windows service..."
    $batPath = Join-Path $PSScriptRoot "install_windows_service.bat"
    
    if (Test-Path $batPath) {
        Start-Process -FilePath $batPath -Verb RunAs -Wait
        Write-Success "Windows service installation initiated"
    } else {
        Write-Error "Windows service installer not found: $batPath"
    }
}

# Main execution
function Main {
    Write-Host "`n===============================================" -ForegroundColor Green
    Write-Host "         AutoAffiliateHub-X2 PowerShell       " -ForegroundColor Green
    Write-Host "              Startup Manager                 " -ForegroundColor Green  
    Write-Host "===============================================" -ForegroundColor Green
    
    $detectedEnv = Get-Environment
    Write-Info "Detected environment: $detectedEnv"
    
    switch ($Action.ToLower()) {
        "start" {
            if (!(Test-SystemRequirements)) {
                Write-Error "System requirements not met"
                exit 1
            }
            
            if (!(Install-Dependencies)) {
                Write-Error "Dependency installation failed"
                exit 1
            }
            
            if (!(Start-Services $detectedEnv)) {
                Write-Error "Failed to start services"
                exit 1
            }
            
            if (-not $NoHealthCheck) {
                Start-Sleep -Seconds 15
                if (!(Test-Health)) {
                    Write-Warning "Health checks failed, but services may still be starting"
                }
            }
            
            Write-Success "AutoAffiliateHub-X2 startup completed"
        }
        
        "stop" {
            Stop-Services
            Write-Success "AutoAffiliateHub-X2 stopped"
        }
        
        "restart" {
            Stop-Services
            Start-Sleep -Seconds 5
            
            if (!(Start-Services $detectedEnv)) {
                Write-Error "Failed to restart services"
                exit 1
            }
            
            Write-Success "AutoAffiliateHub-X2 restarted"
        }
        
        "status" {
            Get-Status
        }
        
        "health" {
            if (Test-Health) {
                Write-Success "Health check passed"
            } else {
                Write-Error "Health check failed"
                exit 1
            }
        }
        
        "install" {
            Install-WindowsService
        }
        
        "uninstall" {
            if ($IsWindows) {
                $service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
                if ($service) {
                    Write-Info "Removing Windows service..."
                    & sc.exe delete $ServiceName
                    Write-Success "Windows service removed"
                } else {
                    Write-Warning "Windows service not found"
                }
            } else {
                Write-Warning "Uninstall only available on Windows"
            }
        }
        
        default {
            Write-Error "Unknown action: $Action"
            Write-Host "Available actions: start, stop, restart, status, health, install, uninstall"
            exit 1
        }
    }
}