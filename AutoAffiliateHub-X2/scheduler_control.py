"""
StockSpot Scheduler Controller
Remote control interface for the autonomous scheduler.

Usage:
    python scheduler_control.py status
    python scheduler_control.py pause
    python scheduler_control.py resume  
    python scheduler_control.py config
    python scheduler_control.py logs [error|system|scheduler]
"""

import os
import sys
import yaml
import argparse
from datetime import datetime

def load_config(config_path='config.yaml'):
    """Load current configuration"""
    try:
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as file:
                return yaml.safe_load(file)
        return {}
    except Exception as e:
        print(f"❌ Error loading config: {e}")
        return {}

def save_config(config, config_path='config.yaml'):
    """Save configuration"""
    try:
        with open(config_path, 'w', encoding='utf-8') as file:
            yaml.dump(config, file, default_flow_style=False)
        return True
    except Exception as e:
        print(f"❌ Error saving config: {e}")
        return False

def show_status():
    """Display current scheduler status"""
    config = load_config()
    
    print("📊 StockSpot Scheduler Status")
    print("=" * 40)
    
    # System status
    is_paused = config.get('system_paused', False)
    test_mode = config.get('test_mode', True)
    
    status_emoji = "⏸️" if is_paused else "▶️"
    mode_emoji = "🧪" if test_mode else "🚀"
    
    print(f"{status_emoji} System Status: {'PAUSED' if is_paused else 'RUNNING'}")
    print(f"{mode_emoji} Mode: {'TEST' if test_mode else 'PRODUCTION'}")
    
    # Configuration details
    scheduler_config = config.get('scheduler', {})
    print(f"⏱️ Cycle Interval: {scheduler_config.get('cycle_interval_hours', 2)} hours")
    print(f"📦 Max Deals/Cycle: {scheduler_config.get('max_deals_per_cycle', 5)}")
    print(f"⭐ Min Deal Score: {scheduler_config.get('min_deal_score', 75)}")
    
    # Posting configuration
    posting_config = config.get('posting', {})
    platforms = posting_config.get('platforms', [])
    print(f"📱 Platforms: {', '.join(platforms)}")
    
    # Log file status
    print("\n📋 Log Files:")
    log_files = ['auto_scheduler.log', 'errors.log', 'system.log']
    for log_file in log_files:
        log_path = f'logs/{log_file}'
        if os.path.exists(log_path):
            size = os.path.getsize(log_path) / 1024
            mod_time = datetime.fromtimestamp(os.path.getmtime(log_path))
            print(f"   📄 {log_file}: {size:.1f} KB (updated {mod_time.strftime('%Y-%m-%d %H:%M')})")
        else:
            print(f"   📄 {log_file}: Not found")

def pause_scheduler():
    """Pause the scheduler"""
    config = load_config()
    config['system_paused'] = True
    
    if save_config(config):
        print("⏸️ Scheduler PAUSED")
        print("   The next cycle will be skipped")
        print("   Use 'python scheduler_control.py resume' to restart")
    else:
        print("❌ Failed to pause scheduler")

def resume_scheduler():
    """Resume the scheduler"""
    config = load_config()
    config['system_paused'] = False
    
    if save_config(config):
        print("▶️ Scheduler RESUMED")
        print("   Normal operation will continue")
    else:
        print("❌ Failed to resume scheduler")

def toggle_mode():
    """Toggle between test and production mode"""
    config = load_config()
    current_test_mode = config.get('test_mode', True)
    new_test_mode = not current_test_mode
    config['test_mode'] = new_test_mode
    
    if save_config(config):
        mode = "TEST" if new_test_mode else "PRODUCTION"
        print(f"🔄 Mode changed to: {mode}")
        if not new_test_mode:
            print("⚠️ WARNING: Production mode will use real APIs and post to social media!")
    else:
        print("❌ Failed to change mode")

def show_config():
    """Display current configuration"""
    config = load_config()
    
    print("⚙️ Current Configuration:")
    print("=" * 30)
    print(yaml.dump(config, default_flow_style=False))

def show_logs(log_type='scheduler'):
    """Show recent log entries"""
    log_files = {
        'scheduler': 'logs/auto_scheduler.log',
        'error': 'logs/errors.log',
        'system': 'logs/system.log'
    }
    
    log_file = log_files.get(log_type)
    if not log_file:
        print(f"❌ Unknown log type: {log_type}")
        print(f"Available types: {', '.join(log_files.keys())}")
        return
        
    if not os.path.exists(log_file):
        print(f"📄 Log file not found: {log_file}")
        return
        
    print(f"📋 Recent entries from {log_file}:")
    print("-" * 50)
    
    try:
        with open(log_file, 'r', encoding='utf-8') as file:
            lines = file.readlines()
            # Show last 20 lines
            recent_lines = lines[-20:] if len(lines) > 20 else lines
            for line in recent_lines:
                print(line.rstrip())
    except Exception as e:
        print(f"❌ Error reading log file: {e}")

def main():
    parser = argparse.ArgumentParser(description='StockSpot Scheduler Controller')
    parser.add_argument('command', choices=['status', 'pause', 'resume', 'toggle-mode', 'config', 'logs'],
                       help='Control command')
    parser.add_argument('--log-type', choices=['scheduler', 'error', 'system'], default='scheduler',
                       help='Type of log to show (for logs command)')
    
    args = parser.parse_args()
    
    print(f"🎛️ StockSpot Scheduler Controller")
    print("-" * 40)
    
    if args.command == 'status':
        show_status()
    elif args.command == 'pause':
        pause_scheduler()
    elif args.command == 'resume':
        resume_scheduler()
    elif args.command == 'toggle-mode':
        toggle_mode()
    elif args.command == 'config':
        show_config()
    elif args.command == 'logs':
        show_logs(args.log_type)
    
    print()

if __name__ == '__main__':
    main()