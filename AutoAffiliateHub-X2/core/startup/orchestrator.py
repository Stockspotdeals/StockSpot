#!/usr/bin/env python3
"""
StockSpot System Orchestrator - Python
Alternative orchestrator for Python-focused environments
"""

import os
import sys
import time
import signal
import asyncio
import subprocess
import logging
import json
import psutil
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
import threading
from dataclasses import dataclass, asdict

@dataclass
class ModuleConfig:
    """Configuration for a system module"""
    script: str
    description: str
    critical: bool
    env_vars: Dict[str, str] = None
    working_dir: str = None
    restart_delay: int = 5
    max_retries: int = 5

class AfillyPythonOrchestrator:
    """Python-based orchestrator for AutoAffiliateHub-X2"""
    
    def __init__(self):
        self.project_root = Path(__file__).parent.parent.parent
        self.log_dir = Path(__file__).parent / 'logs'
        self.processes: Dict[str, subprocess.Popen] = {}
        self.retry_counts: Dict[str, int] = {}
        self.shutdown_event = threading.Event()
        
        # Ensure log directory exists
        self.log_dir.mkdir(exist_ok=True)
        
        # Setup logging
        self.setup_logging()
        
        # Define system modules
        self.modules = {
            'autonomous_scheduler': ModuleConfig(
                script='app/auto_scheduler.py',
                description='Main autonomous posting scheduler',
                critical=True,
                env_vars={'PYTHONPATH': str(self.project_root)}
            ),
            'deal_discovery': ModuleConfig(
                script='app/deal_engine.py', 
                description='Deal discovery pipeline',
                critical=True,
                env_vars={'PYTHONPATH': str(self.project_root)}
            ),
            'queue_processor': ModuleConfig(
                script='app/queue_manager.py',
                description='Priority queue management',
                critical=True,
                env_vars={'PYTHONPATH': str(self.project_root)}
            ),
            'posting_engine': ModuleConfig(
                script='app/posting_engine.py',
                description='Social media posting automation',
                critical=True,
                env_vars={'PYTHONPATH': str(self.project_root)}
            ),
            'web_dashboard': ModuleConfig(
                script='app/dashboard.py',
                description='Web dashboard interface',
                critical=False,
                env_vars={'PYTHONPATH': str(self.project_root)}
            ),
            'website_updater': ModuleConfig(
                script='app/website_updater.py',
                description='Website content updater',
                critical=False,
                env_vars={'PYTHONPATH': str(self.project_root)}
            )
        }
        
        # Setup signal handlers
        self.setup_signal_handlers()
        
    def setup_logging(self):
        """Setup comprehensive logging"""
        log_format = '%(asctime)s [%(levelname)s] %(message)s'
        
        # Main orchestrator log
        self.logger = logging.getLogger('orchestrator')
        self.logger.setLevel(logging.INFO)
        
        # File handler
        file_handler = logging.FileHandler(self.log_dir / 'startup.log')
        file_handler.setFormatter(logging.Formatter(log_format))
        self.logger.addHandler(file_handler)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(logging.Formatter(log_format))
        self.logger.addHandler(console_handler)
        
        # Health check logger
        self.health_logger = logging.getLogger('health')
        self.health_logger.setLevel(logging.INFO)
        health_handler = logging.FileHandler(self.log_dir / 'system_health.log')
        health_handler.setFormatter(logging.Formatter(log_format))
        self.health_logger.addHandler(health_handler)
        
    def detect_environment(self) -> str:
        """Detect the runtime environment"""
        try:
            # Check for cloud environments
            if os.path.exists('/.dockerenv'):
                return 'docker'
            
            if os.environ.get('AWS_REGION') or os.path.exists('/sys/hypervisor/uuid'):
                return 'aws'
                
            if os.environ.get('GOOGLE_CLOUD_PROJECT'):
                return 'gcp'
                
            if os.environ.get('AZURE_CLIENT_ID'):
                return 'azure'
                
            # Check for common VPS/server indicators
            if sys.platform.startswith('linux'):
                # Check if we're on a server (no display, common server dirs)
                if not os.environ.get('DISPLAY') and os.path.exists('/var/log'):
                    return 'linux-server'
                return 'linux-desktop'
                
            if sys.platform == 'win32':
                return 'windows'
                
            if sys.platform == 'darwin':
                return 'macos'
                
            return 'unknown'
            
        except Exception as e:
            self.logger.warning(f"Environment detection failed: {e}")
            return 'unknown'
            
    def get_python_executable(self) -> str:
        """Get the appropriate Python executable"""
        # Try virtual environment first
        if sys.platform == 'win32':
            venv_python = self.project_root / '.venv' / 'Scripts' / 'python.exe'
        else:
            venv_python = self.project_root / '.venv' / 'bin' / 'python'
            
        if venv_python.exists():
            return str(venv_python)
            
        # Fallback to system Python
        return sys.executable
        
    def start_module(self, module_name: str) -> bool:
        """Start a specific module"""
        if module_name not in self.modules:
            self.logger.error(f"Unknown module: {module_name}")
            return False
            
        config = self.modules[module_name]
        script_path = self.project_root / config.script
        
        if not script_path.exists():
            self.logger.error(f"Script not found: {script_path}")
            return False
            
        try:
            self.logger.info(f"Starting {module_name} ({config.description})...")
            
            # Prepare environment
            env = os.environ.copy()
            if config.env_vars:
                env.update(config.env_vars)
                
            # Set working directory
            working_dir = config.working_dir or str(self.project_root)
            
            # Start the process
            python_exe = self.get_python_executable()
            
            process = subprocess.Popen(
                [python_exe, str(script_path)],
                cwd=working_dir,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,  # Line buffered
                universal_newlines=True
            )
            
            self.processes[module_name] = process
            self.retry_counts[module_name] = 0
            
            # Start output monitoring threads
            self.start_output_monitoring(module_name, process)
            
            self.logger.info(f"✅ {module_name} started successfully (PID: {process.pid})")
            return True
            
        except Exception as e:
            self.logger.error(f"❌ Failed to start {module_name}: {e}")
            self.schedule_restart(module_name)
            return False
            
    def start_output_monitoring(self, module_name: str, process: subprocess.Popen):
        """Start threads to monitor process output"""
        
        def monitor_stdout():
            try:
                for line in iter(process.stdout.readline, ''):
                    if line.strip():
                        self.logger.info(f"[{module_name}] {line.strip()}")
                    if self.shutdown_event.is_set():
                        break
            except Exception:
                pass  # Process ended
                
        def monitor_stderr():
            try:
                for line in iter(process.stderr.readline, ''):
                    if line.strip():
                        self.logger.error(f"[{module_name}] ERROR: {line.strip()}")
                    if self.shutdown_event.is_set():
                        break
            except Exception:
                pass  # Process ended
                
        # Start monitoring threads
        stdout_thread = threading.Thread(target=monitor_stdout, daemon=True)
        stderr_thread = threading.Thread(target=monitor_stderr, daemon=True)
        
        stdout_thread.start()
        stderr_thread.start()
        
    def schedule_restart(self, module_name: str):
        """Schedule a module restart with exponential backoff"""
        config = self.modules[module_name]
        current_retries = self.retry_counts.get(module_name, 0)
        
        if current_retries >= config.max_retries:
            self.logger.error(f"{module_name} exceeded max retries ({config.max_retries}), giving up")
            return
            
        delay = config.restart_delay * (2 ** current_retries)  # Exponential backoff
        self.retry_counts[module_name] = current_retries + 1
        
        self.logger.info(f"Scheduling {module_name} restart in {delay}s (attempt {current_retries + 1}/{config.max_retries})")
        
        def delayed_restart():
            if not self.shutdown_event.is_set():
                time.sleep(delay)
                if not self.shutdown_event.is_set():
                    self.start_module(module_name)
                    
        restart_thread = threading.Thread(target=delayed_restart, daemon=True)
        restart_thread.start()
        
    def start_all_modules(self):
        """Start all system modules in dependency order"""
        self.logger.info("🚀 Starting AutoAffiliateHub-X2 Python orchestration...")
        
        environment = self.detect_environment()
        self.logger.info(f"Environment detected: {environment}")
        
        # Start modules in dependency order
        start_order = [
            'queue_processor',
            'deal_discovery', 
            'posting_engine',
            'autonomous_scheduler',
            'web_dashboard',
            'website_updater'
        ]
        
        for module_name in start_order:
            if module_name in self.modules:
                self.start_module(module_name)
                time.sleep(2)  # Small delay between starts
                
        self.logger.info("✅ All modules started, beginning monitoring...")
        
        # Start health monitoring
        self.start_health_monitoring()
        
    def start_health_monitoring(self):
        """Start health monitoring in background thread"""
        
        def health_monitor():
            while not self.shutdown_event.is_set():
                try:
                    self.perform_health_check()
                    # Wait 5 minutes or until shutdown
                    self.shutdown_event.wait(300)  # 5 minutes
                except Exception as e:
                    self.logger.error(f"Health monitor error: {e}")
                    self.shutdown_event.wait(60)  # Wait 1 minute on error
                    
        monitor_thread = threading.Thread(target=health_monitor, daemon=True)
        monitor_thread.start()
        
        # Initial health check after 30 seconds
        def delayed_health_check():
            time.sleep(30)
            if not self.shutdown_event.is_set():
                self.perform_health_check()
                
        initial_check_thread = threading.Thread(target=delayed_health_check, daemon=True)
        initial_check_thread.start()
        
    def perform_health_check(self):
        """Perform comprehensive health check"""
        healthy_modules = 0
        total_modules = len(self.modules)
        
        for module_name, config in self.modules.items():
            process = self.processes.get(module_name)
            
            if process and process.poll() is None:  # Process is running
                healthy_modules += 1
            else:
                self.logger.warning(f"Health check: {module_name} is not running")
                
                # Auto-restart critical modules
                if config.critical and not self.shutdown_event.is_set():
                    self.logger.info(f"Auto-restarting critical module: {module_name}")
                    self.start_module(module_name)
                    
        # Log health status
        health_status = f"{healthy_modules}/{total_modules} modules healthy"
        self.health_logger.info(f"Health Check: {health_status}")
        
        # Log system resources
        try:
            memory_info = psutil.virtual_memory()
            cpu_percent = psutil.cpu_percent(interval=1)
            
            self.health_logger.info(f"System Resources: CPU {cpu_percent}%, Memory {memory_info.percent}% ({memory_info.used//1024//1024}MB used)")
            
            # Log process-specific info
            for module_name, process in self.processes.items():
                if process and process.poll() is None:
                    try:
                        proc = psutil.Process(process.pid)
                        proc_memory = proc.memory_info().rss // 1024 // 1024  # MB
                        proc_cpu = proc.cpu_percent()
                        self.health_logger.info(f"[{module_name}] PID:{process.pid} CPU:{proc_cpu}% Memory:{proc_memory}MB")
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        pass
                        
        except Exception as e:
            self.health_logger.warning(f"Could not get system resources: {e}")
            
    def setup_signal_handlers(self):
        """Setup graceful shutdown signal handlers"""
        
        def signal_handler(signum, frame):
            signal_name = signal.Signals(signum).name
            self.logger.info(f"Received {signal_name}, initiating graceful shutdown...")
            self.shutdown()
            
        signal.signal(signal.SIGINT, signal_handler)
        signal.signal(signal.SIGTERM, signal_handler)
        
        if hasattr(signal, 'SIGQUIT'):
            signal.signal(signal.SIGQUIT, signal_handler)
            
    def shutdown(self):
        """Gracefully shutdown all processes"""
        self.logger.info("Shutting down all modules...")
        self.shutdown_event.set()
        
        # Stop all processes
        for module_name, process in list(self.processes.items()):
            if process and process.poll() is None:
                self.logger.info(f"Stopping {module_name} (PID: {process.pid})...")
                try:
                    process.terminate()
                    
                    # Wait up to 10 seconds for graceful shutdown
                    try:
                        process.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        self.logger.warning(f"Force killing {module_name}")
                        process.kill()
                        process.wait()
                        
                except Exception as e:
                    self.logger.error(f"Error stopping {module_name}: {e}")
                    
                del self.processes[module_name]
                
        self.logger.info("✅ All modules stopped, shutdown complete")
        
    def get_status(self) -> Dict[str, Any]:
        """Get current system status"""
        status = {
            'timestamp': datetime.now().isoformat(),
            'environment': self.detect_environment(),
            'modules': {},
            'total_processes': len(self.processes),
            'system_resources': {}
        }
        
        # Module status
        for module_name, config in self.modules.items():
            process = self.processes.get(module_name)
            status['modules'][module_name] = {
                'running': bool(process and process.poll() is None),
                'pid': process.pid if process else None,
                'critical': config.critical,
                'retries': self.retry_counts.get(module_name, 0),
                'description': config.description
            }
            
        # System resources
        try:
            memory = psutil.virtual_memory()
            status['system_resources'] = {
                'cpu_percent': psutil.cpu_percent(),
                'memory_percent': memory.percent,
                'memory_used_mb': memory.used // 1024 // 1024,
                'memory_total_mb': memory.total // 1024 // 1024
            }
        except Exception:
            status['system_resources'] = {'error': 'Could not retrieve system info'}
            
        return status
        
    def run_forever(self):
        """Main run loop"""
        try:
            self.start_all_modules()
            
            # Keep the orchestrator running
            while not self.shutdown_event.is_set():
                self.shutdown_event.wait(10)  # Check every 10 seconds
                
                # Check if any critical processes died unexpectedly
                for module_name, config in self.modules.items():
                    if config.critical:
                        process = self.processes.get(module_name)
                        if not process or process.poll() is not None:
                            if not self.shutdown_event.is_set():
                                self.logger.warning(f"Critical module {module_name} died, restarting...")
                                self.start_module(module_name)
                                
        except KeyboardInterrupt:
            self.logger.info("Keyboard interrupt received")
        except Exception as e:
            self.logger.error(f"Orchestrator error: {e}")
        finally:
            self.shutdown()

def main():
    """Main entry point"""
    if len(sys.argv) > 1:
        if sys.argv[1] == '--status':
            orchestrator = AfillyPythonOrchestrator()
            status = orchestrator.get_status()
            print(json.dumps(status, indent=2))
            return
        elif sys.argv[1] == '--help':
            print("""
AutoAffiliateHub-X2 Python Orchestrator

Usage:
  python orchestrator.py           Start all modules
  python orchestrator.py --status  Show current status
  python orchestrator.py --help    Show this help

Environment Variables:
  AFFILLY_LOG_LEVEL=DEBUG         Set log level
  PYTHONPATH                      Python module path
            """)
            return
            
    # Start the orchestrator
    orchestrator = AfillyPythonOrchestrator()
    orchestrator.run_forever()

if __name__ == '__main__':
    main()