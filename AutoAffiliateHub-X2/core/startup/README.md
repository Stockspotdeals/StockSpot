# AutoAffiliateHub-X2 Startup Documentation

## Overview

The AutoAffiliateHub-X2 startup system provides comprehensive orchestration and process management for automatic system initialization, monitoring, and recovery across multiple environments.

## Components

### Core Orchestration Files

#### `orchestrator.js` (Node.js Orchestrator)
- **Purpose**: Primary process manager using Node.js
- **Features**: 
  - Environment detection and auto-configuration
  - Process monitoring with health checks
  - Exponential backoff retry logic
  - Graceful shutdown handling
  - Memory and CPU monitoring
- **Manages**: scheduler, dashboard, deal_engine, posting_engine, queue_manager

#### `orchestrator.py` (Python Orchestrator)  
- **Purpose**: Python-based alternative orchestrator
- **Features**:
  - Comprehensive logging and monitoring
  - Threading-based health checks
  - Signal handling (SIGTERM, SIGINT)
  - Resource monitoring with psutil
  - Modular configuration system
- **Manages**: autonomous_scheduler, deal_discovery, queue_processor, posting_engine, web_dashboard, website_updater

#### `environment.js` (Environment Detection)
- **Purpose**: Automatic environment detection and configuration
- **Detects**: AWS, GCP, Azure, Docker, Linux servers, Windows, macOS
- **Provides**: Environment-specific configurations and process management strategies

### Process Management Configurations

#### `pm2.config.js` (PM2 Configuration)
- **Purpose**: Production-grade process management with PM2
- **Features**:
  - Individual process configurations
  - Memory limits and restart policies
  - Log rotation and management
  - Cron-based scheduled restarts
  - Development and production environments
- **Processes**: All core AutoAffiliateHub-X2 modules with optimized settings

#### `affilly.service` (systemd Service)
- **Purpose**: Linux systemd service configuration
- **Features**:
  - Automatic startup and restart
  - Resource limits and security hardening
  - Proper dependency management
  - Journal logging integration
- **Installation**: Copy to `/etc/systemd/system/` and enable

#### `install_windows_service.bat` (Windows Service Installer)
- **Purpose**: Automated Windows service installation using NSSM
- **Features**:
  - Automatic NSSM download and installation
  - Service configuration and startup
  - Administrator privilege checking
  - Comprehensive error handling
- **Usage**: Run as Administrator to install Windows service

### Startup and Management Scripts

#### `startup_check.sh` (System Verification)
- **Purpose**: Comprehensive startup verification and health checking
- **Features**:
  - System requirements validation
  - Dependency installation
  - Multi-environment startup
  - Health monitoring and status reporting
- **Usage**: `./startup_check.sh [--skip-deps] [--no-start]`

#### `startup.ps1` (PowerShell Manager)
- **Purpose**: Cross-platform PowerShell management script
- **Features**:
  - Windows, macOS, and Linux support
  - Service management (start/stop/restart)
  - Health checking and status reporting
  - Windows service integration
- **Usage**: `.\startup.ps1 -Action start|stop|restart|status|health|install`

## Environment Support

### Cloud Environments

#### AWS
- **Detection**: `AWS_EXECUTION_ENV`, `AWS_LAMBDA_FUNCTION_NAME`, CloudFormation tools
- **Management**: PM2 or direct process management
- **Features**: Auto-scaling aware, ECS/Lambda compatible

#### Google Cloud Platform
- **Detection**: `GOOGLE_CLOUD_PROJECT`, GCP metadata service
- **Management**: PM2 with GCP-specific configurations
- **Features**: Cloud Run and Compute Engine support

#### Microsoft Azure
- **Detection**: `WEBSITE_SITE_NAME`, Azure-specific paths
- **Management**: PM2 or App Service integration
- **Features**: Azure Web Apps and VM support

### Container Environments

#### Docker
- **Detection**: `/.dockerenv` file presence
- **Management**: Direct process management
- **Features**: Container-optimized logging and shutdown

### Server Environments

#### Linux Server
- **Detection**: systemd availability
- **Management**: systemd service preferred, PM2 fallback
- **Features**: Full systemd integration with security hardening

#### Windows Server/Desktop
- **Detection**: Windows OS detection
- **Management**: Windows Service via NSSM
- **Features**: Service Manager integration, auto-start

#### macOS
- **Detection**: Darwin kernel
- **Management**: Direct process or launchd
- **Features**: macOS-specific process handling

## Installation and Usage

### Quick Start

1. **Automatic Setup** (Recommended):
   ```bash
   # Linux/macOS
   chmod +x core/startup/startup_check.sh
   ./core/startup/startup_check.sh
   
   # Windows PowerShell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   .\core\startup\startup.ps1 -Action start
   
   # Windows Command Prompt (as Administrator)
   core\startup\install_windows_service.bat
   ```

2. **Manual Environment Setup**:
   ```bash
   # Install dependencies
   pip install -r requirements.txt
   
   # Start with specific environment
   ./startup_check.sh --environment linux-server
   ```

### Service Management

#### PM2 (Recommended for Production)
```bash
# Install PM2
npm install -g pm2

# Start all services
pm2 start core/startup/pm2.config.js --env production

# Monitor
pm2 monit

# Auto-startup
pm2 startup
pm2 save
```

#### systemd (Linux Servers)
```bash
# Install service
sudo cp core/startup/affilly.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable affilly
sudo systemctl start affilly

# Monitor
sudo systemctl status affilly
sudo journalctl -u affilly -f
```

#### Windows Service
```cmd
REM Run as Administrator
core\startup\install_windows_service.bat

REM Manage service
sc start AutoAffiliateHub-X2
sc stop AutoAffiliateHub-X2
sc query AutoAffiliateHub-X2
```

### Health Monitoring

#### Manual Health Checks
```bash
# Web endpoint
curl http://localhost:5000/health

# Process status
./startup_check.sh --no-start

# PowerShell
.\startup.ps1 -Action health
```

#### Automated Monitoring
- **PM2**: Built-in process monitoring and restart
- **systemd**: Automatic restart on failure
- **Windows Service**: Configurable failure recovery
- **Orchestrator**: Health checks every 60 seconds

### Configuration

#### Environment Variables
- `NODE_ENV`: Set to "production" for production deployments
- `AFFILLY_LOG_LEVEL`: DEBUG, INFO, WARNING, ERROR
- `PYTHONPATH`: Automatically set to project root
- `PORT`: Dashboard port (default: 5000)

#### Log Management
- **Location**: `core/startup/logs/`
- **Files**: 
  - `startup_check.log`: Verification script logs
  - `orchestrator.log`: Orchestrator process logs
  - `[module].log`: Individual module logs
- **Rotation**: Automatic log rotation with size limits

## Troubleshooting

### Common Issues

#### Services Won't Start
1. Check system requirements: `./startup_check.sh --no-start`
2. Verify Python installation and dependencies
3. Check log files in `core/startup/logs/`
4. Ensure proper file permissions

#### Health Check Failures
1. Verify dashboard is running on port 5000
2. Check firewall settings
3. Review dashboard logs
4. Confirm database connectivity

#### Permission Issues
1. Ensure proper file ownership
2. Check execute permissions on scripts
3. Verify service account permissions
4. Run Windows scripts as Administrator

### Log Analysis

#### Key Log Locations
```bash
# Startup logs
tail -f core/startup/logs/startup_check.log

# Orchestrator logs  
tail -f core/startup/logs/orchestrator.out

# systemd logs (Linux)
sudo journalctl -u affilly -f

# Windows Event Viewer
# Application and Services Logs > AutoAffiliateHub-X2
```

### Recovery Procedures

#### Process Recovery
```bash
# Stop all processes
./startup.ps1 -Action stop

# Clean restart
./startup_check.sh

# Force restart with dependency check
./startup_check.sh --skip-deps=false
```

#### Service Recovery
```bash
# PM2 recovery
pm2 restart all
pm2 resurrect

# systemd recovery  
sudo systemctl restart affilly

# Windows Service recovery
sc stop AutoAffiliateHub-X2
sc start AutoAffiliateHub-X2
```

## Advanced Configuration

### Custom Orchestrator Settings

#### Modify Health Check Intervals
Edit `orchestrator.js` or `orchestrator.py`:
```javascript
// orchestrator.js
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds

# orchestrator.py  
HEALTH_CHECK_INTERVAL = 30  # seconds
```

#### Add Custom Modules
Update orchestrator configuration:
```javascript
// Add to MODULES array in orchestrator.js
{
    name: 'custom_module',
    script: 'app/custom_module.py', 
    enabled: true,
    args: ['--custom-arg']
}
```

### Production Optimization

#### Resource Limits
- **Memory**: Configured per module in PM2 config
- **CPU**: Weight-based scheduling in systemd
- **Disk**: Log rotation prevents disk space issues
- **Network**: Health check timeout configurations

#### Security Hardening
- **systemd**: NoNewPrivileges, ProtectSystem, ReadWritePaths
- **Windows Service**: Service account isolation
- **Process**: Non-root user execution where possible

## Support and Maintenance

### Monitoring Integration
- **PM2**: Built-in monitoring dashboard
- **systemd**: Journal integration
- **Windows**: Event Log integration
- **Custom**: Health check endpoints for external monitoring

### Backup and Recovery
- **Configuration**: Backup `core/startup/` directory
- **Logs**: Regular log archival
- **State**: Database and queue state persistence

### Updates and Maintenance
- **Code Updates**: Restart services after code changes
- **Dependency Updates**: Run `./startup_check.sh` after updates
- **System Updates**: Test startup after system maintenance

This documentation provides comprehensive coverage of the AutoAffiliateHub-X2 startup and orchestration system, enabling reliable deployment and management across all supported environments.