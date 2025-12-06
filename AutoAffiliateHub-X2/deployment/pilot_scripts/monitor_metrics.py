#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Metrics Monitor

This script continuously monitors system metrics including:
- Queue lengths and processing rates
- Worker status and performance
- Rate limiter token availability  
- System resource usage
- Revenue and conversion tracking

Outputs real-time metrics to console and optionally to JSON for dashboard ingestion.

Usage:
    python deployment/pilot_scripts/monitor_metrics.py
    python deployment/pilot_scripts/monitor_metrics.py --interval 30
    python deployment/pilot_scripts/monitor_metrics.py --json-output logs/metrics.json
    python deployment/pilot_scripts/monitor_metrics.py --alert-thresholds
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import argparse
import psutil
from threading import Thread, Event

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Import AutoAffiliateHub components
try:
    from app.queue_manager import QueueManager
    from app.cluster.health import get_health_checker
    from app.cluster.rate_limiter import get_rate_limiter
    from app.monetization_engine import MonetizationEngine
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("💡 Make sure you're running from the AutoAffiliateHub-X2 directory")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MetricsMonitor:
    """Real-time system metrics monitoring and alerting."""
    
    def __init__(self, 
                 interval: int = 10, 
                 json_output: Optional[str] = None,
                 enable_alerts: bool = False):
        """Initialize metrics monitor."""
        self.interval = interval
        self.json_output = json_output
        self.enable_alerts = enable_alerts
        self.shutdown_event = Event()
        
        # Alert thresholds
        self.thresholds = {
            'queue_length': {
                'warning': 50,
                'critical': 100
            },
            'cpu_usage': {
                'warning': 80,
                'critical': 95
            },
            'memory_usage': {
                'warning': 85,
                'critical': 95
            },
            'disk_usage': {
                'warning': 85,
                'critical': 95
            },
            'rate_limit_remaining': {
                'warning': 0.2,  # 20% remaining
                'critical': 0.1   # 10% remaining
            }
        }
        
        # Initialize components
        try:
            self.queue_manager = QueueManager()
            self.health_checker = get_health_checker()
            self.rate_limiter = get_rate_limiter()
            self.monetization_engine = MonetizationEngine()
        except Exception as e:
            logger.error(f"❌ Failed to initialize components: {e}")
            sys.exit(1)
        
        # Metrics history for trend analysis
        self.metrics_history = []
        self.max_history = 100  # Keep last 100 data points
        
        logger.info("📊 MetricsMonitor initialized")
    
    def get_queue_metrics(self) -> Dict[str, Any]:
        """Get queue system metrics."""
        try:
            queues = ['posting_tasks', 'scraping_tasks', 'analytics_tasks']
            queue_metrics = {}
            
            total_pending = 0
            for queue in queues:
                try:
                    size = self.queue_manager.get_queue_size(queue)
                    pending = self.queue_manager.get_pending_count(queue)
                    processing = self.queue_manager.get_processing_count(queue)
                    
                    queue_metrics[queue] = {
                        'total_size': size,
                        'pending': pending,
                        'processing': processing,
                        'completion_rate': self._calculate_completion_rate(queue)
                    }
                    
                    total_pending += pending
                    
                except Exception as e:
                    logger.warning(f"⚠️ Could not get metrics for queue {queue}: {e}")
                    queue_metrics[queue] = {
                        'total_size': 0,
                        'pending': 0,
                        'processing': 0,
                        'completion_rate': 0.0,
                        'error': str(e)
                    }
            
            return {
                'queues': queue_metrics,
                'total_pending': total_pending,
                'total_queues': len(queues)
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get queue metrics: {e}")
            return {'error': str(e)}
    
    def get_worker_metrics(self) -> Dict[str, Any]:
        """Get worker status and performance metrics."""
        try:
            health = self.health_checker.get_health(['worker_manager'])
            
            worker_metrics = {
                'active_workers': 0,
                'total_workers': 0,
                'worker_utilization': 0.0,
                'average_processing_time': 0.0,
                'workers_status': 'unknown'
            }
            
            if 'worker_manager' in health.component_health:
                worker_health = health.component_health['worker_manager']
                
                if worker_health.get('details'):
                    details = worker_health['details']
                    worker_metrics.update({
                        'active_workers': details.get('active_workers', 0),
                        'total_workers': details.get('total_workers', 0),
                        'worker_utilization': details.get('utilization', 0.0),
                        'average_processing_time': details.get('avg_processing_time', 0.0),
                        'workers_status': worker_health.get('status', 'unknown')
                    })
            
            return worker_metrics
            
        except Exception as e:
            logger.error(f"❌ Failed to get worker metrics: {e}")
            return {'error': str(e)}
    
    def get_rate_limit_metrics(self) -> Dict[str, Any]:
        """Get rate limiting status for all platforms."""
        try:
            platforms = ['twitter', 'reddit', 'instagram', 'shopify']
            rate_metrics = {}
            
            for platform in platforms:
                try:
                    # Check current rate limit status
                    result = self.rate_limiter.check_platform_limit(platform, cost=0)
                    
                    rate_metrics[platform] = {
                        'allowed': result.allowed,
                        'remaining': result.remaining,
                        'limit': result.limit,
                        'reset_time': result.reset_time,
                        'retry_after': result.retry_after,
                        'utilization': (1 - (result.remaining / max(result.limit, 1))) * 100
                    }
                    
                except Exception as e:
                    rate_metrics[platform] = {
                        'error': str(e),
                        'allowed': False,
                        'remaining': 0,
                        'limit': 0
                    }
            
            return rate_metrics
            
        except Exception as e:
            logger.error(f"❌ Failed to get rate limit metrics: {e}")
            return {'error': str(e)}
    
    def get_system_metrics(self) -> Dict[str, Any]:
        """Get system resource usage metrics."""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            
            # Memory usage
            memory = psutil.virtual_memory()
            
            # Disk usage
            disk = psutil.disk_usage('/')
            
            # Network I/O
            network = psutil.net_io_counters()
            
            return {
                'cpu': {
                    'usage_percent': cpu_percent,
                    'count': cpu_count,
                    'load_average': os.getloadavg() if hasattr(os, 'getloadavg') else None
                },
                'memory': {
                    'usage_percent': memory.percent,
                    'used_gb': memory.used / (1024**3),
                    'total_gb': memory.total / (1024**3),
                    'available_gb': memory.available / (1024**3)
                },
                'disk': {
                    'usage_percent': (disk.used / disk.total) * 100,
                    'used_gb': disk.used / (1024**3),
                    'total_gb': disk.total / (1024**3),
                    'free_gb': disk.free / (1024**3)
                },
                'network': {
                    'bytes_sent': network.bytes_sent,
                    'bytes_recv': network.bytes_recv,
                    'packets_sent': network.packets_sent,
                    'packets_recv': network.packets_recv
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get system metrics: {e}")
            return {'error': str(e)}
    
    def get_monetization_metrics(self) -> Dict[str, Any]:
        """Get monetization and revenue metrics."""
        try:
            # Get recent performance data
            report = self.monetization_engine.generate_analytics_report(
                time_period='hourly',
                include_projections=False
            )
            
            return {
                'total_revenue': report.get('total_revenue', 0),
                'conversions_today': report.get('conversions_today', 0),
                'clicks_today': report.get('clicks_today', 0),
                'conversion_rate': report.get('conversion_rate', 0),
                'average_commission': report.get('average_commission', 0),
                'top_performing_deals': report.get('top_deals', [])[:3]  # Top 3
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to get monetization metrics: {e}")
            return {'error': str(e)}
    
    def _calculate_completion_rate(self, queue_name: str) -> float:
        """Calculate queue completion rate based on historical data."""
        try:
            # Simple completion rate calculation based on queue size changes
            current_size = self.queue_manager.get_queue_size(queue_name)
            
            if len(self.metrics_history) >= 2:
                previous_metrics = self.metrics_history[-2]
                if 'queue_metrics' in previous_metrics:
                    prev_size = previous_metrics['queue_metrics']['queues'].get(queue_name, {}).get('total_size', 0)
                    if prev_size > 0:
                        return max(0, (prev_size - current_size) / prev_size) * 100
            
            return 0.0
            
        except Exception:
            return 0.0
    
    def collect_all_metrics(self) -> Dict[str, Any]:
        """Collect all system metrics."""
        timestamp = datetime.now()
        
        metrics = {
            'timestamp': timestamp.isoformat(),
            'queue_metrics': self.get_queue_metrics(),
            'worker_metrics': self.get_worker_metrics(),
            'rate_limit_metrics': self.get_rate_limit_metrics(),
            'system_metrics': self.get_system_metrics(),
            'monetization_metrics': self.get_monetization_metrics()
        }
        
        # Store in history
        self.metrics_history.append(metrics)
        if len(self.metrics_history) > self.max_history:
            self.metrics_history.pop(0)
        
        return metrics
    
    def check_alerts(self, metrics: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Check metrics against alert thresholds."""
        alerts = []
        
        try:
            # Check queue length alerts
            queue_metrics = metrics.get('queue_metrics', {})
            total_pending = queue_metrics.get('total_pending', 0)
            
            if total_pending >= self.thresholds['queue_length']['critical']:
                alerts.append({
                    'level': 'CRITICAL',
                    'component': 'queue',
                    'message': f'Queue length critical: {total_pending} pending items',
                    'value': total_pending,
                    'threshold': self.thresholds['queue_length']['critical']
                })
            elif total_pending >= self.thresholds['queue_length']['warning']:
                alerts.append({
                    'level': 'WARNING',
                    'component': 'queue',
                    'message': f'Queue length warning: {total_pending} pending items',
                    'value': total_pending,
                    'threshold': self.thresholds['queue_length']['warning']
                })
            
            # Check system resource alerts
            system_metrics = metrics.get('system_metrics', {})
            
            # CPU alerts
            cpu_usage = system_metrics.get('cpu', {}).get('usage_percent', 0)
            if cpu_usage >= self.thresholds['cpu_usage']['critical']:
                alerts.append({
                    'level': 'CRITICAL',
                    'component': 'cpu',
                    'message': f'CPU usage critical: {cpu_usage:.1f}%',
                    'value': cpu_usage,
                    'threshold': self.thresholds['cpu_usage']['critical']
                })
            elif cpu_usage >= self.thresholds['cpu_usage']['warning']:
                alerts.append({
                    'level': 'WARNING',
                    'component': 'cpu',
                    'message': f'CPU usage warning: {cpu_usage:.1f}%',
                    'value': cpu_usage,
                    'threshold': self.thresholds['cpu_usage']['warning']
                })
            
            # Memory alerts
            memory_usage = system_metrics.get('memory', {}).get('usage_percent', 0)
            if memory_usage >= self.thresholds['memory_usage']['critical']:
                alerts.append({
                    'level': 'CRITICAL',
                    'component': 'memory',
                    'message': f'Memory usage critical: {memory_usage:.1f}%',
                    'value': memory_usage,
                    'threshold': self.thresholds['memory_usage']['critical']
                })
            elif memory_usage >= self.thresholds['memory_usage']['warning']:
                alerts.append({
                    'level': 'WARNING',
                    'component': 'memory',
                    'message': f'Memory usage warning: {memory_usage:.1f}%',
                    'value': memory_usage,
                    'threshold': self.thresholds['memory_usage']['warning']
                })
            
            # Rate limit alerts
            rate_metrics = metrics.get('rate_limit_metrics', {})
            for platform, data in rate_metrics.items():
                if isinstance(data, dict) and 'remaining' in data and 'limit' in data:
                    remaining_ratio = data['remaining'] / max(data['limit'], 1)
                    
                    if remaining_ratio <= self.thresholds['rate_limit_remaining']['critical']:
                        alerts.append({
                            'level': 'CRITICAL',
                            'component': 'rate_limit',
                            'message': f'{platform} rate limit critical: {data["remaining"]}/{data["limit"]} remaining',
                            'value': remaining_ratio,
                            'threshold': self.thresholds['rate_limit_remaining']['critical']
                        })
                    elif remaining_ratio <= self.thresholds['rate_limit_remaining']['warning']:
                        alerts.append({
                            'level': 'WARNING',
                            'component': 'rate_limit',
                            'message': f'{platform} rate limit warning: {data["remaining"]}/{data["limit"]} remaining',
                            'value': remaining_ratio,
                            'threshold': self.thresholds['rate_limit_remaining']['warning']
                        })
            
        except Exception as e:
            logger.error(f"❌ Error checking alerts: {e}")
        
        return alerts
    
    def print_metrics(self, metrics: Dict[str, Any], alerts: List[Dict[str, Any]] = None):
        """Print formatted metrics to console."""
        timestamp = metrics.get('timestamp', datetime.now().isoformat())
        
        print(f"\n{'='*80}")
        print(f"📊 AutoAffiliateHub-X2 Metrics - {timestamp}")
        print(f"{'='*80}")
        
        # Queue Metrics
        queue_metrics = metrics.get('queue_metrics', {})
        print(f"\n📬 QUEUE STATUS:")
        if 'queues' in queue_metrics:
            for queue_name, data in queue_metrics['queues'].items():
                completion = data.get('completion_rate', 0)
                print(f"   {queue_name}: {data.get('pending', 0)} pending, {data.get('processing', 0)} processing ({completion:.1f}% completion rate)")
        print(f"   Total pending: {queue_metrics.get('total_pending', 0)}")
        
        # Worker Metrics
        worker_metrics = metrics.get('worker_metrics', {})
        print(f"\n👷 WORKER STATUS:")
        print(f"   Active workers: {worker_metrics.get('active_workers', 0)}/{worker_metrics.get('total_workers', 0)}")
        print(f"   Utilization: {worker_metrics.get('worker_utilization', 0):.1f}%")
        print(f"   Avg processing time: {worker_metrics.get('average_processing_time', 0):.2f}s")
        
        # Rate Limit Status
        rate_metrics = metrics.get('rate_limit_metrics', {})
        print(f"\n🚦 RATE LIMITS:")
        for platform, data in rate_metrics.items():
            if isinstance(data, dict) and 'remaining' in data:
                utilization = data.get('utilization', 0)
                print(f"   {platform}: {data['remaining']}/{data['limit']} remaining ({utilization:.1f}% used)")
        
        # System Resources
        system_metrics = metrics.get('system_metrics', {})
        print(f"\n🖥️  SYSTEM RESOURCES:")
        if 'cpu' in system_metrics:
            print(f"   CPU: {system_metrics['cpu'].get('usage_percent', 0):.1f}% ({system_metrics['cpu'].get('count', 0)} cores)")
        if 'memory' in system_metrics:
            mem = system_metrics['memory']
            print(f"   Memory: {mem.get('usage_percent', 0):.1f}% ({mem.get('used_gb', 0):.1f}GB / {mem.get('total_gb', 0):.1f}GB)")
        if 'disk' in system_metrics:
            disk = system_metrics['disk']
            print(f"   Disk: {disk.get('usage_percent', 0):.1f}% ({disk.get('free_gb', 0):.1f}GB free)")
        
        # Monetization
        monetization = metrics.get('monetization_metrics', {})
        print(f"\n💰 MONETIZATION:")
        print(f"   Total revenue: ${monetization.get('total_revenue', 0):.2f}")
        print(f"   Conversions today: {monetization.get('conversions_today', 0)}")
        print(f"   Conversion rate: {monetization.get('conversion_rate', 0):.2f}%")
        
        # Alerts
        if alerts and self.enable_alerts:
            print(f"\n🚨 ALERTS:")
            for alert in alerts:
                emoji = "🔴" if alert['level'] == 'CRITICAL' else "🟡"
                print(f"   {emoji} {alert['level']}: {alert['message']}")
        
        print(f"\n{'='*80}")
    
    def save_metrics_json(self, metrics: Dict[str, Any]):
        """Save metrics to JSON file for dashboard ingestion."""
        if not self.json_output:
            return
        
        try:
            # Ensure directory exists
            os.makedirs(os.path.dirname(self.json_output), exist_ok=True)
            
            # Append to JSON file
            if os.path.exists(self.json_output):
                with open(self.json_output, 'r') as f:
                    data = json.load(f)
                if not isinstance(data, list):
                    data = [data]
            else:
                data = []
            
            data.append(metrics)
            
            # Keep only last 1000 entries
            if len(data) > 1000:
                data = data[-1000:]
            
            with open(self.json_output, 'w') as f:
                json.dump(data, f, indent=2, default=str)
            
        except Exception as e:
            logger.error(f"❌ Failed to save metrics JSON: {e}")
    
    def run_monitoring(self):
        """Main monitoring loop."""
        logger.info(f"🚀 Starting metrics monitoring (interval: {self.interval}s)")
        
        try:
            while not self.shutdown_event.is_set():
                start_time = time.time()
                
                # Collect metrics
                metrics = self.collect_all_metrics()
                
                # Check for alerts
                alerts = []
                if self.enable_alerts:
                    alerts = self.check_alerts(metrics)
                
                # Display metrics
                self.print_metrics(metrics, alerts)
                
                # Save to JSON if configured
                if self.json_output:
                    self.save_metrics_json(metrics)
                
                # Calculate sleep time to maintain interval
                elapsed = time.time() - start_time
                sleep_time = max(0, self.interval - elapsed)
                
                if self.shutdown_event.wait(sleep_time):
                    break
                    
        except KeyboardInterrupt:
            logger.info("🛑 Monitoring stopped by user")
        except Exception as e:
            logger.error(f"❌ Monitoring error: {e}")
        finally:
            logger.info("📊 Metrics monitoring stopped")
    
    def stop(self):
        """Stop monitoring."""
        self.shutdown_event.set()

def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description='AutoAffiliateHub-X2 Metrics Monitor')
    parser.add_argument('--interval', '-i', type=int, default=10,
                       help='Monitoring interval in seconds (default: 10)')
    parser.add_argument('--json-output', '-j', type=str,
                       help='JSON output file for dashboard integration')
    parser.add_argument('--alert-thresholds', '-a', action='store_true',
                       help='Enable alert checking and notifications')
    parser.add_argument('--quiet', '-q', action='store_true',
                       help='Quiet mode - minimal output')
    args = parser.parse_args()
    
    if args.quiet:
        logging.getLogger().setLevel(logging.WARNING)
    
    # Ensure logs directory exists
    os.makedirs('deployment/logs', exist_ok=True)
    
    try:
        # Initialize monitor
        monitor = MetricsMonitor(
            interval=args.interval,
            json_output=args.json_output,
            enable_alerts=args.alert_thresholds
        )
        
        print("🚀 Starting AutoAffiliateHub-X2 Metrics Monitor")
        print(f"⏱️  Monitoring interval: {args.interval} seconds")
        if args.json_output:
            print(f"📄 JSON output: {args.json_output}")
        if args.alert_thresholds:
            print("🚨 Alert monitoring enabled")
        print("Press Ctrl+C to stop monitoring\n")
        
        # Start monitoring
        monitor.run_monitoring()
        
    except KeyboardInterrupt:
        print("\n🛑 Monitoring stopped by user")
    except Exception as e:
        logger.error(f"❌ Monitor failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()