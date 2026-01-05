#!/bin/bash

# AutoAffiliateHub-X2 Startup Verification Script
# Validates system startup and health across all environments

set -euo pipefail  # Exit on error, undefined vars, pipe failures

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_DIR="$SCRIPT_DIR/logs"
HEALTH_CHECK_TIMEOUT=30
MAX_RETRY_ATTEMPTS=3

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_DIR/startup_check.log"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_DIR/startup_check.log"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_DIR/startup_check.log"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_DIR/startup_check.log"
}

# Create log directory
mkdir -p "$LOG_DIR"

# Initialize log file
echo "===========================================" > "$LOG_DIR/startup_check.log"
echo "AutoAffiliateHub-X2 Startup Verification" >> "$LOG_DIR/startup_check.log"
echo "Started at: $(date)" >> "$LOG_DIR/startup_check.log"
echo "===========================================" >> "$LOG_DIR/startup_check.log"

log_info "Starting AutoAffiliateHub-X2 system verification..."

# Environment detection
detect_environment() {
    log_info "Detecting environment..."
    
    # Check for cloud providers
    if [ -n "${AWS_EXECUTION_ENV:-}" ] || [ -n "${AWS_LAMBDA_FUNCTION_NAME:-}" ] || [ -f /opt/aws/bin/cfn-signal ]; then
        echo "aws"
    elif [ -n "${GOOGLE_CLOUD_PROJECT:-}" ] || [ -f /usr/bin/google_metadata_script_runner ]; then
        echo "gcp"
    elif [ -n "${WEBSITE_SITE_NAME:-}" ] || [ -d /opt/microsoft ]; then
        echo "azure"
    elif [ -f /.dockerenv ]; then
        echo "docker"
    elif systemctl --version >/dev/null 2>&1; then
        echo "linux-server"
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        echo "macos"
    elif [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
        echo "windows"
    else
        echo "unknown"
    fi
}

# Check system requirements
check_system_requirements() {
    log_info "Checking system requirements..."
    
    local requirements_met=true
    
    # Check Python
    if command -v python3 >/dev/null 2>&1; then
        local python_version=$(python3 --version | cut -d' ' -f2)
        log_success "Python 3 found: $python_version"
    elif command -v python >/dev/null 2>&1; then
        local python_version=$(python --version | cut -d' ' -f2)
        if [[ $python_version == 3.* ]]; then
            log_success "Python 3 found: $python_version"
        else
            log_error "Python 3 required, found Python $python_version"
            requirements_met=false
        fi
    else
        log_error "Python 3 not found"
        requirements_met=false
    fi
    
    # Check Node.js
    if command -v node >/dev/null 2>&1; then
        local node_version=$(node --version)
        log_success "Node.js found: $node_version"
    else
        log_warning "Node.js not found (required for orchestrator)"
    fi
    
    # Check pip
    if command -v pip3 >/dev/null 2>&1 || command -v pip >/dev/null 2>&1; then
        log_success "pip found"
    else
        log_error "pip not found"
        requirements_met=false
    fi
    
    # Check project files
    local required_files=(
        "app/auto_scheduler.py"
        "app/dashboard.py"
        "app/deal_engine.py"
        "app/posting_engine.py"
        "app/queue_manager.py"
        "requirements.txt"
        "config.json"
    )
    
    for file in "${required_files[@]}"; do
        if [[ -f "$PROJECT_ROOT/$file" ]]; then
            log_success "Required file found: $file"
        else
            log_error "Required file missing: $file"
            requirements_met=false
        fi
    done
    
    if [[ "$requirements_met" == true ]]; then
        log_success "All system requirements met"
        return 0
    else
        log_error "System requirements not met"
        return 1
    fi
}

# Install Python dependencies
install_dependencies() {
    log_info "Installing Python dependencies..."
    
    cd "$PROJECT_ROOT"
    
    if [[ -f "requirements.txt" ]]; then
        if command -v pip3 >/dev/null 2>&1; then
            pip3 install -r requirements.txt
        else
            pip install -r requirements.txt
        fi
        log_success "Python dependencies installed"
    else
        log_warning "requirements.txt not found, skipping dependency installation"
    fi
}

# Check process management availability
check_process_managers() {
    log_info "Checking available process managers..."
    
    local managers_available=()
    
    # Check PM2
    if command -v pm2 >/dev/null 2>&1; then
        managers_available+=("pm2")
        log_success "PM2 available"
    else
        log_warning "PM2 not available"
    fi
    
    # Check systemd
    if systemctl --version >/dev/null 2>&1; then
        managers_available+=("systemd")
        log_success "systemd available"
    else
        log_warning "systemd not available"
    fi
    
    if [[ ${#managers_available[@]} -eq 0 ]]; then
        log_warning "No process managers found, will use direct process management"
    else
        log_info "Available process managers: ${managers_available[*]}"
    fi
}

# Start orchestrator based on environment
start_orchestrator() {
    local environment=$1
    log_info "Starting orchestrator for environment: $environment"
    
    cd "$PROJECT_ROOT"
    
    case "$environment" in
        "aws"|"gcp"|"azure")
            if command -v pm2 >/dev/null 2>&1; then
                log_info "Starting with PM2..."
                pm2 start core/startup/pm2.config.js --env production
                log_success "PM2 processes started"
            elif command -v node >/dev/null 2>&1; then
                log_info "Starting Node.js orchestrator..."
                nohup node core/startup/orchestrator.js > "$LOG_DIR/orchestrator.out" 2>&1 &
                echo $! > "$LOG_DIR/orchestrator.pid"
                log_success "Node.js orchestrator started"
            else
                log_info "Starting Python orchestrator..."
                nohup python3 core/startup/orchestrator.py > "$LOG_DIR/orchestrator.out" 2>&1 &
                echo $! > "$LOG_DIR/orchestrator.pid"
                log_success "Python orchestrator started"
            fi
            ;;
        "docker")
            log_info "Starting Python orchestrator for Docker..."
            python3 core/startup/orchestrator.py &
            echo $! > "$LOG_DIR/orchestrator.pid"
            log_success "Docker orchestrator started"
            ;;
        "linux-server")
            if systemctl --version >/dev/null 2>&1 && [[ -f "/etc/systemd/system/affilly.service" ]]; then
                log_info "Starting with systemd..."
                sudo systemctl start affilly
                sudo systemctl enable affilly
                log_success "systemd service started"
            elif command -v pm2 >/dev/null 2>&1; then
                log_info "Starting with PM2..."
                pm2 start core/startup/pm2.config.js --env production
                pm2 save
                pm2 startup
                log_success "PM2 processes started"
            else
                log_info "Starting Python orchestrator..."
                nohup python3 core/startup/orchestrator.py > "$LOG_DIR/orchestrator.out" 2>&1 &
                echo $! > "$LOG_DIR/orchestrator.pid"
                log_success "Python orchestrator started"
            fi
            ;;
        "macos"|"windows")
            if command -v node >/dev/null 2>&1; then
                log_info "Starting Node.js orchestrator..."
                node core/startup/orchestrator.js &
                echo $! > "$LOG_DIR/orchestrator.pid"
                log_success "Node.js orchestrator started"
            else
                log_info "Starting Python orchestrator..."
                python3 core/startup/orchestrator.py &
                echo $! > "$LOG_DIR/orchestrator.pid"
                log_success "Python orchestrator started"
            fi
            ;;
        *)
            log_warning "Unknown environment, using Python orchestrator..."
            python3 core/startup/orchestrator.py &
            echo $! > "$LOG_DIR/orchestrator.pid"
            log_success "Python orchestrator started"
            ;;
    esac
}

# Health check function
perform_health_check() {
    log_info "Performing health checks..."
    
    local health_passed=true
    local retry_count=0
    
    while [[ $retry_count -lt $MAX_RETRY_ATTEMPTS ]]; do
        log_info "Health check attempt $((retry_count + 1))/$MAX_RETRY_ATTEMPTS"
        
        # Check if dashboard is responding
        if command -v curl >/dev/null 2>&1; then
            if curl -f -s -m 10 "http://localhost:5000/health" >/dev/null 2>&1; then
                log_success "Dashboard health check passed"
            else
                log_warning "Dashboard health check failed (attempt $((retry_count + 1)))"
                health_passed=false
            fi
        else
            log_warning "curl not available, skipping web health checks"
        fi
        
        # Check process existence
        if [[ -f "$LOG_DIR/orchestrator.pid" ]]; then
            local pid=$(cat "$LOG_DIR/orchestrator.pid")
            if kill -0 "$pid" 2>/dev/null; then
                log_success "Orchestrator process running (PID: $pid)"
                health_passed=true
                break
            else
                log_warning "Orchestrator process not found (attempt $((retry_count + 1)))"
                health_passed=false
            fi
        elif command -v pm2 >/dev/null 2>&1; then
            if pm2 list | grep -q "affilly-orchestrator.*online"; then
                log_success "PM2 orchestrator running"
                health_passed=true
                break
            else
                log_warning "PM2 orchestrator not running (attempt $((retry_count + 1)))"
                health_passed=false
            fi
        elif systemctl --version >/dev/null 2>&1 && systemctl is-active --quiet affilly; then
            log_success "systemd service running"
            health_passed=true
            break
        else
            log_warning "No running processes found (attempt $((retry_count + 1)))"
            health_passed=false
        fi
        
        if [[ $health_passed == true ]]; then
            break
        fi
        
        retry_count=$((retry_count + 1))
        if [[ $retry_count -lt $MAX_RETRY_ATTEMPTS ]]; then
            log_info "Waiting 10 seconds before retry..."
            sleep 10
        fi
    done
    
    return $health_passed
}

# Display status information
display_status() {
    log_info "System Status Summary:"
    echo
    echo "==============================================="
    echo "           AutoAffiliateHub-X2 Status         "
    echo "==============================================="
    
    # Environment info
    local env=$(detect_environment)
    echo "Environment: $env"
    echo "Project Root: $PROJECT_ROOT"
    echo "Log Directory: $LOG_DIR"
    echo
    
    # Process status
    echo "Process Status:"
    if command -v pm2 >/dev/null 2>&1; then
        echo "PM2 Processes:"
        pm2 list | grep affilly || echo "  No PM2 processes running"
        echo
    fi
    
    if systemctl --version >/dev/null 2>&1; then
        echo "systemd Status:"
        systemctl is-active --quiet affilly && echo "  affilly.service: active" || echo "  affilly.service: inactive"
        echo
    fi
    
    if [[ -f "$LOG_DIR/orchestrator.pid" ]]; then
        local pid=$(cat "$LOG_DIR/orchestrator.pid")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Direct Process: Running (PID: $pid)"
        else
            echo "Direct Process: Not running"
        fi
        echo
    fi
    
    # Recent logs
    echo "Recent Log Entries:"
    if [[ -f "$LOG_DIR/orchestrator.out" ]]; then
        echo "--- Orchestrator Output (last 5 lines) ---"
        tail -5 "$LOG_DIR/orchestrator.out" 2>/dev/null || echo "No output available"
    fi
    echo
    
    echo "==============================================="
    echo "Verification completed at: $(date)"
    echo "==============================================="
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    # Add any cleanup tasks here
}

# Signal handlers
trap cleanup EXIT
trap 'log_error "Script interrupted"; exit 1' INT TERM

# Main execution
main() {
    local environment
    local startup_success=true
    
    # Detect environment
    environment=$(detect_environment)
    log_info "Environment detected: $environment"
    
    # Check system requirements
    if ! check_system_requirements; then
        log_error "System requirements check failed"
        exit 1
    fi
    
    # Install dependencies if needed
    if [[ "${SKIP_DEPS:-}" != "true" ]]; then
        install_dependencies
    fi
    
    # Check process managers
    check_process_managers
    
    # Start orchestrator if not already running
    if [[ "${START_SERVICES:-true}" == "true" ]]; then
        start_orchestrator "$environment"
        
        # Wait a moment for services to start
        log_info "Waiting for services to initialize..."
        sleep 15
        
        # Perform health checks
        if ! perform_health_check; then
            log_error "Health checks failed"
            startup_success=false
        fi
    fi
    
    # Display final status
    display_status
    
    if [[ "$startup_success" == true ]]; then
        log_success "AutoAffiliateHub-X2 startup verification completed successfully!"
        exit 0
    else
        log_error "AutoAffiliateHub-X2 startup verification failed!"
        exit 1
    fi
}

# Script usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo "Options:"
    echo "  -h, --help           Show this help message"
    echo "  --skip-deps          Skip dependency installation"
    echo "  --no-start           Skip starting services (check only)"
    echo "  --environment ENV    Force specific environment (aws, gcp, azure, docker, linux-server, macos, windows)"
    echo
    echo "Environment Variables:"
    echo "  SKIP_DEPS=true       Skip dependency installation"
    echo "  START_SERVICES=false Skip starting services"
    echo
    echo "Examples:"
    echo "  $0                   # Full startup verification"
    echo "  $0 --skip-deps       # Skip dependency installation"
    echo "  $0 --no-start        # Check system only, don't start services"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            usage
            exit 0
            ;;
        --skip-deps)
            export SKIP_DEPS=true
            shift
            ;;
        --no-start)
            export START_SERVICES=false
            shift
            ;;
        --environment)
            FORCE_ENVIRONMENT="$2"
            shift 2
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Run main function
main