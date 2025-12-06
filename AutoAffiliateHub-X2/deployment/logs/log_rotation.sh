#!/bin/bash
# AutoAffiliateHub-X2 Log Rotation Script
# 
# This script rotates log files to prevent disk space issues
# and maintains a rolling archive of historical logs.
#
# Usage:
#   ./log_rotation.sh
#   ./log_rotation.sh --keep-days 14
#   ./log_rotation.sh --compress
#
# Add to crontab for automatic rotation:
#   0 2 * * * /path/to/log_rotation.sh >/dev/null 2>&1

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="${SCRIPT_DIR}"
KEEP_DAYS=7
COMPRESS=false
MAX_SIZE="100M"
ARCHIVE_DIR="${LOG_DIR}/archive"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --keep-days)
            KEEP_DAYS="$2"
            shift 2
            ;;
        --compress)
            COMPRESS=true
            shift
            ;;
        --max-size)
            MAX_SIZE="$2"
            shift 2
            ;;
        --help)
            echo "AutoAffiliateHub-X2 Log Rotation Script"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --keep-days N    Keep logs for N days (default: 7)"
            echo "  --compress       Compress archived logs with gzip"
            echo "  --max-size SIZE  Rotate when log exceeds SIZE (default: 100M)"
            echo "  --help          Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                           # Rotate with default settings"
            echo "  $0 --keep-days 14           # Keep 14 days of logs"
            echo "  $0 --compress --keep-days 30 # Compress and keep 30 days"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Log files to rotate
LOG_FILES=(
    "affilly.log"
    "dashboard.log"
    "cluster.log"
    "monetization.log"
    "dry_run.log"
    "post_flow_test.log"
    "security.log"
)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create archive directory
create_archive_dir() {
    if [ ! -d "$ARCHIVE_DIR" ]; then
        mkdir -p "$ARCHIVE_DIR"
        log_info "Created archive directory: $ARCHIVE_DIR"
    fi
}

# Check if log file needs rotation
needs_rotation() {
    local file="$1"
    local max_size_bytes
    
    if [ ! -f "$file" ]; then
        return 1  # File doesn't exist, no rotation needed
    fi
    
    # Convert max size to bytes
    case "$MAX_SIZE" in
        *K|*k) max_size_bytes=$((${MAX_SIZE%[Kk]} * 1024)) ;;
        *M|*m) max_size_bytes=$((${MAX_SIZE%[Mm]} * 1024 * 1024)) ;;
        *G|*g) max_size_bytes=$((${MAX_SIZE%[Gg]} * 1024 * 1024 * 1024)) ;;
        *) max_size_bytes=$MAX_SIZE ;;
    esac
    
    local file_size=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 0)
    
    [ "$file_size" -gt "$max_size_bytes" ]
}

# Rotate a single log file
rotate_log() {
    local log_file="$1"
    local log_path="${LOG_DIR}/${log_file}"
    
    if [ ! -f "$log_path" ]; then
        log_warning "Log file not found: $log_path"
        return 0
    fi
    
    if ! needs_rotation "$log_path"; then
        log_info "Log file $log_file does not need rotation"
        return 0
    fi
    
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local base_name="${log_file%.*}"
    local extension="${log_file##*.}"
    local archived_name="${base_name}_${timestamp}.${extension}"
    local archived_path="${ARCHIVE_DIR}/${archived_name}"
    
    # Copy current log to archive
    cp "$log_path" "$archived_path"
    
    # Truncate original log file
    > "$log_path"
    
    # Compress if requested
    if [ "$COMPRESS" = true ]; then
        gzip "$archived_path"
        archived_path="${archived_path}.gz"
        log_success "Rotated and compressed: $log_file -> $(basename "$archived_path")"
    else
        log_success "Rotated: $log_file -> $(basename "$archived_path")"
    fi
    
    # Set appropriate permissions
    chmod 640 "$archived_path"
}

# Clean old archived logs
clean_old_logs() {
    local cutoff_date=$(date -d "$KEEP_DAYS days ago" +%Y%m%d 2>/dev/null || date -v-${KEEP_DAYS}d +%Y%m%d)
    local deleted_count=0
    
    log_info "Cleaning logs older than $KEEP_DAYS days (before $cutoff_date)"
    
    if [ ! -d "$ARCHIVE_DIR" ]; then
        return 0
    fi
    
    # Find and delete old log files
    for archived_log in "$ARCHIVE_DIR"/*; do
        if [ ! -f "$archived_log" ]; then
            continue
        fi
        
        local filename=$(basename "$archived_log")
        
        # Extract date from filename (format: logname_YYYYMMDD_HHMMSS.ext)
        if [[ "$filename" =~ _([0-9]{8})_ ]]; then
            local file_date="${BASH_REMATCH[1]}"
            
            if [ "$file_date" -lt "$cutoff_date" ]; then
                rm -f "$archived_log"
                log_success "Deleted old log: $filename"
                ((deleted_count++))
            fi
        fi
    done
    
    if [ "$deleted_count" -gt 0 ]; then
        log_success "Deleted $deleted_count old log files"
    else
        log_info "No old log files to delete"
    fi
}

# Get disk usage information
show_disk_usage() {
    log_info "Disk usage for log directory:"
    echo "  Log directory: $LOG_DIR"
    
    if command -v du >/dev/null 2>&1; then
        local current_usage=$(du -sh "$LOG_DIR" 2>/dev/null | cut -f1)
        echo "  Current usage: $current_usage"
        
        if [ -d "$ARCHIVE_DIR" ]; then
            local archive_usage=$(du -sh "$ARCHIVE_DIR" 2>/dev/null | cut -f1)
            echo "  Archive usage: $archive_usage"
        fi
    fi
    
    if command -v df >/dev/null 2>&1; then
        local available_space=$(df -h "$LOG_DIR" | tail -1 | awk '{print $4}')
        echo "  Available space: $available_space"
    fi
}

# Main execution
main() {
    log_info "Starting AutoAffiliateHub-X2 log rotation"
    log_info "Configuration: keep_days=$KEEP_DAYS, max_size=$MAX_SIZE, compress=$COMPRESS"
    
    # Show current disk usage
    show_disk_usage
    
    # Create archive directory
    create_archive_dir
    
    # Rotate each log file
    local rotated_count=0
    for log_file in "${LOG_FILES[@]}"; do
        if rotate_log "$log_file"; then
            ((rotated_count++))
        fi
    done
    
    # Clean old logs
    clean_old_logs
    
    # Show final disk usage
    echo ""
    show_disk_usage
    
    log_success "Log rotation complete: $rotated_count files processed"
}

# Handle signals
trap 'log_error "Log rotation interrupted"; exit 1' INT TERM

# Check if running as root (warn if so)
if [ "$EUID" -eq 0 ]; then
    log_warning "Running as root - consider using a dedicated user for log management"
fi

# Verify log directory exists
if [ ! -d "$LOG_DIR" ]; then
    log_error "Log directory does not exist: $LOG_DIR"
    exit 1
fi

# Check for required commands
missing_commands=()
for cmd in date stat; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        missing_commands+=("$cmd")
    fi
done

if [ ${#missing_commands[@]} -gt 0 ]; then
    log_error "Missing required commands: ${missing_commands[*]}"
    exit 1
fi

# Run main function
main

# Windows PowerShell equivalent script
cat > "${SCRIPT_DIR}/log_rotation.ps1" << 'EOF'
# AutoAffiliateHub-X2 Log Rotation Script (PowerShell)
# 
# Usage:
#   .\log_rotation.ps1
#   .\log_rotation.ps1 -KeepDays 14
#   .\log_rotation.ps1 -Compress

param(
    [int]$KeepDays = 7,
    [switch]$Compress,
    [string]$MaxSize = "100MB"
)

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogDir = $ScriptDir
$ArchiveDir = Join-Path $LogDir "archive"

# Log files to rotate
$LogFiles = @(
    "affilly.log",
    "dashboard.log", 
    "cluster.log",
    "monetization.log",
    "dry_run.log",
    "post_flow_test.log",
    "security.log"
)

function Write-Info {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Create archive directory
if (!(Test-Path $ArchiveDir)) {
    New-Item -ItemType Directory -Path $ArchiveDir -Force | Out-Null
    Write-Info "Created archive directory: $ArchiveDir"
}

# Convert size string to bytes
function ConvertTo-Bytes {
    param($SizeString)
    
    $Size = $SizeString -replace '[^0-9.]',''
    $Unit = $SizeString -replace '[0-9.]',''
    
    switch ($Unit.ToUpper()) {
        'KB' { return [long]($Size * 1KB) }
        'MB' { return [long]($Size * 1MB) }
        'GB' { return [long]($Size * 1GB) }
        default { return [long]$Size }
    }
}

$MaxSizeBytes = ConvertTo-Bytes $MaxSize

Write-Info "Starting AutoAffiliateHub-X2 log rotation"
Write-Info "Configuration: KeepDays=$KeepDays, MaxSize=$MaxSize, Compress=$Compress"

$RotatedCount = 0

foreach ($LogFile in $LogFiles) {
    $LogPath = Join-Path $LogDir $LogFile
    
    if (!(Test-Path $LogPath)) {
        Write-Warning "Log file not found: $LogPath"
        continue
    }
    
    $FileInfo = Get-Item $LogPath
    
    if ($FileInfo.Length -le $MaxSizeBytes) {
        Write-Info "Log file $LogFile does not need rotation"
        continue
    }
    
    $Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $BaseName = [System.IO.Path]::GetFileNameWithoutExtension($LogFile)
    $Extension = [System.IO.Path]::GetExtension($LogFile)
    $ArchivedName = "${BaseName}_${Timestamp}${Extension}"
    $ArchivedPath = Join-Path $ArchiveDir $ArchivedName
    
    # Copy and truncate
    Copy-Item $LogPath $ArchivedPath
    Clear-Content $LogPath
    
    if ($Compress) {
        Compress-Archive -Path $ArchivedPath -DestinationPath "${ArchivedPath}.zip" -Force
        Remove-Item $ArchivedPath
        Write-Success "Rotated and compressed: $LogFile -> ${ArchivedName}.zip"
    } else {
        Write-Success "Rotated: $LogFile -> $ArchivedName"
    }
    
    $RotatedCount++
}

# Clean old logs
$CutoffDate = (Get-Date).AddDays(-$KeepDays)
$DeletedCount = 0

Write-Info "Cleaning logs older than $KeepDays days"

Get-ChildItem $ArchiveDir -File | Where-Object {
    $_.Name -match '_(\d{8})_' -and [DateTime]::ParseExact($Matches[1], 'yyyyMMdd', $null) -lt $CutoffDate
} | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Success "Deleted old log: $($_.Name)"
    $DeletedCount++
}

if ($DeletedCount -eq 0) {
    Write-Info "No old log files to delete"
}

Write-Success "Log rotation complete: $RotatedCount files processed, $DeletedCount old files deleted"
EOF

log_success "Created PowerShell log rotation script: ${SCRIPT_DIR}/log_rotation.ps1"