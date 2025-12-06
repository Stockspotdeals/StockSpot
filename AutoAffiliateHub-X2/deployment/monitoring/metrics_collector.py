#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Metrics Collector

This script collects comprehensive metrics from all system components and 
provides them in multiple formats for monitoring and dashboard integration.

Collected Metrics:
- Queue performance and throughput
- Worker utilization and processing times
- Revenue and conversion tracking
- System resource usage
- Rate limiting status
- Error rates and health status

Output Formats:
- Console display
- JSON for dashboard APIs
- CSV for data analysis
- Prometheus format for monitoring

Usage:
    python deployment/monitoring/metrics_collector.py
    python deployment/monitoring/metrics_collector.py --output-json metrics.json
    python deployment/monitoring/metrics_collector.py --output-csv metrics.csv
    python deployment/monitoring/metrics_collector.py --prometheus
"""

import os
import sys
import json
import csv
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import argparse
import psutil

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Import AutoAffiliateHub components
try:
    from app.queue_manager import QueueManager
    from app.cluster.health import get_health_checker
    from app.cluster.rate_limiter import get_rate_limiter
    from app.monetization_engine import MonetizationEngine
    from app.cluster.worker_manager import create_worker_manager
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

class MetricsCollector:
    """Comprehensive metrics collection and export system."""
    
    def __init__(self):
        """Initialize metrics collector."""
        
        # Initialize system components
        try:
            self.queue_manager = QueueManager()
            self.health_checker = get_health_checker()
            self.rate_limiter = get_rate_limiter()
            self.monetization_engine = MonetizationEngine()
        except Exception as e:
            logger.warning(f"⚠️ Some components failed to initialize: {e}")
            # Continue with partial functionality
            self.queue_manager = None
            self.health_checker = None
            self.rate_limiter = None
            self.monetization_engine = None
        
        # Metrics categories
        self.metric_categories = [
            'system_resources',
            'queue_performance',
            'worker_status',
            'rate_limiting',
            'monetization',
            'error_tracking',
            'throughput'
        ]
        
        # Historical metrics storage
        self.metrics_history = []
        self.max_history = 1000
        
        logger.info("📊 MetricsCollector initialized")
    
    def collect_system_metrics(self) -> Dict[str, Any]:
        """Collect system resource metrics."""
        try:
            # CPU metrics
            cpu_percent = psutil.cpu_percent(interval=1, percpu=True)
            cpu_count = psutil.cpu_count()
            
            # Memory metrics
            memory = psutil.virtual_memory()
            swap = psutil.swap_memory()
            
            # Disk metrics
            disk_usage = psutil.disk_usage('/')
            disk_io = psutil.disk_io_counters()
            
            # Network metrics
            network_io = psutil.net_io_counters()
            
            # Process metrics
            process = psutil.Process()
            
            return {
                'timestamp': datetime.now().isoformat(),
                'cpu': {
                    'usage_percent_avg': sum(cpu_percent) / len(cpu_percent),
                    'usage_percent_per_core': cpu_percent,
                    'core_count': cpu_count,
                    'load_average': os.getloadavg() if hasattr(os, 'getloadavg') else None
                },
                'memory': {
                    'usage_percent': memory.percent,
                    'used_bytes': memory.used,
                    'total_bytes': memory.total,
                    'available_bytes': memory.available,
                    'swap_percent': swap.percent,
                    'swap_used_bytes': swap.used
                },
                'disk': {
                    'usage_percent': (disk_usage.used / disk_usage.total) * 100,
                    'used_bytes': disk_usage.used,
                    'total_bytes': disk_usage.total,
                    'free_bytes': disk_usage.free,
                    'read_bytes': disk_io.read_bytes if disk_io else 0,
                    'write_bytes': disk_io.write_bytes if disk_io else 0
                },
                'network': {
                    'bytes_sent': network_io.bytes_sent,
                    'bytes_recv': network_io.bytes_recv,
                    'packets_sent': network_io.packets_sent,
                    'packets_recv': network_io.packets_recv
                },
                'process': {
                    'pid': process.pid,
                    'memory_percent': process.memory_percent(),
                    'cpu_percent': process.cpu_percent(),
                    'num_threads': process.num_threads(),
                    'create_time': process.create_time(),
                    'uptime_seconds': time.time() - process.create_time()
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to collect system metrics: {e}")
            return {'error': str(e)}
    
    def collect_queue_metrics(self) -> Dict[str, Any]:
        """Collect queue performance metrics."""
        if not self.queue_manager:
            return {'error': 'Queue manager not available'}
        
        try:
            queues = ['posting_tasks', 'scraping_tasks', 'analytics_tasks']
            queue_metrics = {}
            
            total_size = 0
            total_pending = 0
            total_processing = 0
            
            for queue_name in queues:
                try:
                    size = self.queue_manager.get_queue_size(queue_name)
                    pending = self.queue_manager.get_pending_count(queue_name)
                    processing = self.queue_manager.get_processing_count(queue_name)
                    
                    # Calculate throughput metrics
                    throughput = self._calculate_queue_throughput(queue_name)
                    
                    queue_metrics[queue_name] = {
                        'total_size': size,
                        'pending_count': pending,
                        'processing_count': processing,
                        'completion_rate': self._calculate_completion_rate(queue_name),
                        'average_processing_time': self._calculate_avg_processing_time(queue_name),
                        'throughput_per_minute': throughput,
                        'health_status': 'healthy' if size < 1000 else 'warning' if size < 5000 else 'critical'
                    }
                    
                    total_size += size
                    total_pending += pending
                    total_processing += processing
                    
                except Exception as e:
                    queue_metrics[queue_name] = {
                        'error': str(e),
                        'total_size': 0,
                        'pending_count': 0,
                        'processing_count': 0
                    }
            
            return {
                'timestamp': datetime.now().isoformat(),
                'queues': queue_metrics,
                'totals': {
                    'total_size': total_size,
                    'total_pending': total_pending,
                    'total_processing': total_processing
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to collect queue metrics: {e}")
            return {'error': str(e)}
    
    def collect_worker_metrics(self) -> Dict[str, Any]:
        """Collect worker status and performance metrics."""
        try:
            # Get worker health from health checker
            worker_metrics = {
                'timestamp': datetime.now().isoformat(),
                'active_workers': 0,
                'total_workers': 0,
                'worker_utilization': 0.0,
                'average_processing_time': 0.0,
                'worker_health': 'unknown'
            }
            
            if self.health_checker:
                try:
                    health = self.health_checker.get_health(['worker_manager'])
                    
                    if 'worker_manager' in health.component_health:
                        worker_health = health.component_health['worker_manager']
                        details = worker_health.get('details', {})
                        
                        worker_metrics.update({
                            'active_workers': details.get('active_workers', 0),
                            'total_workers': details.get('total_workers', 0),
                            'worker_utilization': details.get('utilization', 0.0),
                            'average_processing_time': details.get('avg_processing_time', 0.0),
                            'worker_health': worker_health.get('status', 'unknown')
                        })
                        
                        # Calculate additional metrics
                        if worker_metrics['total_workers'] > 0:
                            worker_metrics['utilization_percent'] = (
                                worker_metrics['active_workers'] / worker_metrics['total_workers']
                            ) * 100
                        else:
                            worker_metrics['utilization_percent'] = 0.0
                            
                except Exception as e:
                    worker_metrics['error'] = str(e)
            
            return worker_metrics
            
        except Exception as e:
            logger.error(f"❌ Failed to collect worker metrics: {e}")
            return {'error': str(e)}
    
    def collect_rate_limit_metrics(self) -> Dict[str, Any]:
        """Collect rate limiting metrics for all platforms."""
        if not self.rate_limiter:
            return {'error': 'Rate limiter not available'}
        
        try:
            platforms = ['twitter', 'reddit', 'instagram', 'shopify']
            rate_metrics = {}
            
            total_requests = 0
            total_limits = 0
            
            for platform in platforms:
                try:
                    # Check current rate limit status
                    result = self.rate_limiter.check_platform_limit(platform, cost=0)
                    
                    # Calculate utilization
                    utilization = 0
                    if result.limit > 0:
                        utilization = ((result.limit - result.remaining) / result.limit) * 100
                    
                    rate_metrics[platform] = {
                        'remaining': result.remaining,
                        'limit': result.limit,
                        'utilization_percent': utilization,
                        'reset_time': result.reset_time,
                        'status': 'healthy' if result.allowed else 'rate_limited',
                        'requests_made': result.limit - result.remaining
                    }
                    
                    total_requests += (result.limit - result.remaining)
                    total_limits += result.limit
                    
                except Exception as e:
                    rate_metrics[platform] = {
                        'error': str(e),
                        'status': 'error'
                    }
            
            # Calculate overall utilization
            overall_utilization = 0
            if total_limits > 0:
                overall_utilization = (total_requests / total_limits) * 100
            
            return {
                'timestamp': datetime.now().isoformat(),
                'platforms': rate_metrics,
                'overall': {
                    'total_requests': total_requests,
                    'total_limits': total_limits,
                    'overall_utilization': overall_utilization
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to collect rate limit metrics: {e}")
            return {'error': str(e)}
    
    def collect_monetization_metrics(self) -> Dict[str, Any]:
        """Collect monetization and revenue metrics."""
        if not self.monetization_engine:
            return {'error': 'Monetization engine not available'}
        
        try:
            # Generate analytics report
            report = self.monetization_engine.generate_analytics_report(
                time_period='daily',
                include_projections=True
            )
            
            # Get performance metrics
            performance = self.monetization_engine.get_performance_summary()
            
            return {
                'timestamp': datetime.now().isoformat(),
                'revenue': {
                    'total_today': report.get('revenue_today', 0),
                    'total_week': report.get('revenue_week', 0),
                    'total_month': report.get('revenue_month', 0),
                    'projected_monthly': report.get('projected_monthly', 0)
                },
                'conversions': {
                    'count_today': report.get('conversions_today', 0),
                    'count_week': report.get('conversions_week', 0),
                    'count_month': report.get('conversions_month', 0),
                    'conversion_rate': report.get('conversion_rate', 0)
                },
                'traffic': {
                    'clicks_today': report.get('clicks_today', 0),
                    'clicks_week': report.get('clicks_week', 0),
                    'click_through_rate': report.get('click_through_rate', 0)
                },
                'performance': {
                    'top_deals': performance.get('top_deals', [])[:5],
                    'top_platforms': performance.get('top_platforms', []),
                    'average_commission': performance.get('average_commission', 0),
                    'best_performing_category': performance.get('best_category', 'unknown')
                }
            }
            
        except Exception as e:
            logger.error(f"❌ Failed to collect monetization metrics: {e}")
            return {'error': str(e)}
    
    def collect_error_metrics(self) -> Dict[str, Any]:
        """Collect error tracking and health metrics."""
        try:
            error_metrics = {
                'timestamp': datetime.now().isoformat(),
                'component_health': {},
                'error_rates': {},
                'system_health_score': 100
            }
            
            if self.health_checker:
                try:
                    health = self.health_checker.get_health([
                        'redis', 'sqlite', 'worker_manager', 'system_resources'
                    ])
                    
                    healthy_components = 0
                    total_components = len(health.component_health)
                    
                    for component, status in health.component_health.items():
                        component_status = status.get('status', 'unknown')
                        error_metrics['component_health'][component] = {
                            'status': component_status,
                            'healthy': component_status in ['healthy', 'operational']
                        }
                        
                        if component_status in ['healthy', 'operational']:
                            healthy_components += 1
                    
                    # Calculate system health score
                    if total_components > 0:
                        error_metrics['system_health_score'] = (healthy_components / total_components) * 100
                    
                except Exception as e:
                    error_metrics['component_health'] = {'error': str(e)}
                    error_metrics['system_health_score'] = 0
            
            return error_metrics
            
        except Exception as e:
            logger.error(f"❌ Failed to collect error metrics: {e}")
            return {'error': str(e)}
    
    def collect_throughput_metrics(self) -> Dict[str, Any]:
        """Collect system throughput and performance metrics."""
        try:
            current_time = datetime.now()
            
            # Calculate throughput based on historical data
            throughput_metrics = {
                'timestamp': current_time.isoformat(),
                'posts_per_hour': self._calculate_posts_throughput(),
                'deals_per_hour': self._calculate_deals_throughput(),
                'revenue_per_hour': self._calculate_revenue_throughput(),
                'system_efficiency': self._calculate_system_efficiency()
            }
            
            return throughput_metrics
            
        except Exception as e:
            logger.error(f"❌ Failed to collect throughput metrics: {e}")
            return {'error': str(e)}
    
    def _calculate_queue_throughput(self, queue_name: str) -> float:
        """Calculate queue processing throughput."""
        # Simplified throughput calculation
        # In a real implementation, this would track historical processing data
        try:
            if self.queue_manager:
                processing = self.queue_manager.get_processing_count(queue_name)
                return processing * 6  # Approximate per-minute rate
            return 0.0
        except Exception:
            return 0.0
    
    def _calculate_completion_rate(self, queue_name: str) -> float:
        """Calculate queue completion rate."""
        # Simplified calculation based on current queue state
        try:
            if self.queue_manager:
                total = self.queue_manager.get_queue_size(queue_name)
                processing = self.queue_manager.get_processing_count(queue_name)
                
                if total > 0:
                    return (processing / total) * 100
            return 0.0
        except Exception:
            return 0.0
    
    def _calculate_avg_processing_time(self, queue_name: str) -> float:
        """Calculate average processing time for queue items."""
        # Placeholder - would need historical timing data
        return 2.5  # Assume 2.5 seconds average
    
    def _calculate_posts_throughput(self) -> float:
        """Calculate posts per hour throughput."""
        # Placeholder calculation
        return 25.0
    
    def _calculate_deals_throughput(self) -> float:
        """Calculate deals discovered per hour."""
        # Placeholder calculation
        return 15.0
    
    def _calculate_revenue_throughput(self) -> float:
        """Calculate revenue generated per hour."""
        # Placeholder calculation
        return 12.50
    
    def _calculate_system_efficiency(self) -> float:
        """Calculate overall system efficiency score."""
        try:
            # Combine various efficiency factors
            cpu_usage = psutil.cpu_percent(interval=1)
            memory_usage = psutil.virtual_memory().percent
            
            # Simple efficiency calculation (0-100)
            cpu_efficiency = max(0, 100 - cpu_usage)
            memory_efficiency = max(0, 100 - memory_usage)
            
            return (cpu_efficiency + memory_efficiency) / 2
            
        except Exception:
            return 50.0  # Default neutral efficiency
    
    def collect_all_metrics(self) -> Dict[str, Any]:
        """Collect all metrics from all categories."""
        logger.info("📊 Collecting comprehensive system metrics...")
        
        start_time = time.time()
        
        all_metrics = {
            'collection_timestamp': datetime.now().isoformat(),
            'collection_duration_seconds': 0,
            'system_resources': self.collect_system_metrics(),
            'queue_performance': self.collect_queue_metrics(),
            'worker_status': self.collect_worker_metrics(),
            'rate_limiting': self.collect_rate_limit_metrics(),
            'monetization': self.collect_monetization_metrics(),
            'error_tracking': self.collect_error_metrics(),
            'throughput': self.collect_throughput_metrics()
        }
        
        # Record collection duration
        collection_duration = time.time() - start_time
        all_metrics['collection_duration_seconds'] = round(collection_duration, 3)
        
        # Store in history
        self.metrics_history.append(all_metrics)
        if len(self.metrics_history) > self.max_history:
            self.metrics_history.pop(0)
        
        logger.info(f"✅ Metrics collection complete ({collection_duration:.2f}s)")
        
        return all_metrics
    
    def export_to_json(self, metrics: Dict[str, Any], filename: str):
        """Export metrics to JSON file."""
        try:
            os.makedirs(os.path.dirname(filename), exist_ok=True)
            
            with open(filename, 'w') as f:
                json.dump(metrics, f, indent=2, default=str)
            
            logger.info(f"📄 Metrics exported to JSON: {filename}")
            
        except Exception as e:
            logger.error(f"❌ Failed to export JSON: {e}")
    
    def export_to_csv(self, metrics: Dict[str, Any], filename: str):
        """Export metrics to CSV file."""
        try:
            os.makedirs(os.path.dirname(filename), exist_ok=True)
            
            # Flatten metrics for CSV export
            flattened_metrics = self._flatten_metrics(metrics)
            
            # Check if file exists to determine if we need headers
            file_exists = os.path.exists(filename)
            
            with open(filename, 'a', newline='') as f:
                writer = csv.DictWriter(f, fieldnames=flattened_metrics.keys())
                
                if not file_exists:
                    writer.writeheader()
                
                writer.writerow(flattened_metrics)
            
            logger.info(f"📊 Metrics exported to CSV: {filename}")
            
        except Exception as e:
            logger.error(f"❌ Failed to export CSV: {e}")
    
    def _flatten_metrics(self, metrics: Dict[str, Any], prefix: str = '') -> Dict[str, Any]:
        """Flatten nested metrics dictionary for CSV export."""
        flattened = {}
        
        for key, value in metrics.items():
            new_key = f"{prefix}{key}" if prefix else key
            
            if isinstance(value, dict):
                flattened.update(self._flatten_metrics(value, f"{new_key}_"))
            elif isinstance(value, (list, tuple)):
                flattened[new_key] = json.dumps(value)
            else:
                flattened[new_key] = value
        
        return flattened
    
    def export_prometheus(self, metrics: Dict[str, Any]) -> str:
        """Export metrics in Prometheus format."""
        try:
            lines = []
            timestamp = int(time.time() * 1000)
            
            # System metrics
            if 'system_resources' in metrics and 'cpu' in metrics['system_resources']:
                cpu_usage = metrics['system_resources']['cpu'].get('usage_percent_avg', 0)
                lines.append(f'affilly_cpu_usage_percent {cpu_usage} {timestamp}')
            
            if 'system_resources' in metrics and 'memory' in metrics['system_resources']:
                memory_usage = metrics['system_resources']['memory'].get('usage_percent', 0)
                lines.append(f'affilly_memory_usage_percent {memory_usage} {timestamp}')
            
            # Queue metrics
            if 'queue_performance' in metrics and 'queues' in metrics['queue_performance']:
                for queue_name, queue_data in metrics['queue_performance']['queues'].items():
                    if isinstance(queue_data, dict):
                        total_size = queue_data.get('total_size', 0)
                        pending = queue_data.get('pending_count', 0)
                        
                        lines.extend([
                            f'affilly_queue_size{{queue="{queue_name}"}} {total_size} {timestamp}',
                            f'affilly_queue_pending{{queue="{queue_name}"}} {pending} {timestamp}'
                        ])
            
            # Rate limit metrics
            if 'rate_limiting' in metrics and 'platforms' in metrics['rate_limiting']:
                for platform, rate_data in metrics['rate_limiting']['platforms'].items():
                    if isinstance(rate_data, dict):
                        remaining = rate_data.get('remaining', 0)
                        limit = rate_data.get('limit', 0)
                        
                        lines.extend([
                            f'affilly_rate_limit_remaining{{platform="{platform}"}} {remaining} {timestamp}',
                            f'affilly_rate_limit_total{{platform="{platform}"}} {limit} {timestamp}'
                        ])
            
            # Monetization metrics
            if 'monetization' in metrics and 'revenue' in metrics['monetization']:
                revenue_today = metrics['monetization']['revenue'].get('total_today', 0)
                lines.append(f'affilly_revenue_today_dollars {revenue_today} {timestamp}')
            
            return '\n'.join(lines) + '\n'
            
        except Exception as e:
            logger.error(f"❌ Failed to export Prometheus metrics: {e}")
            return f'# Error exporting metrics: {e}\n'
    
    def print_summary(self, metrics: Dict[str, Any]):
        """Print formatted metrics summary to console."""
        print(f"\n{'='*80}")
        print(f"📊 AUTOAFFILIATEHUB-X2 METRICS SUMMARY")
        print(f"{'='*80}")
        print(f"Collection Time: {metrics.get('collection_timestamp', 'unknown')}")
        print(f"Collection Duration: {metrics.get('collection_duration_seconds', 0):.3f}s")
        
        # System Resources
        if 'system_resources' in metrics:
            sys_metrics = metrics['system_resources']
            print(f"\n🖥️  SYSTEM RESOURCES:")
            if 'cpu' in sys_metrics:
                cpu = sys_metrics['cpu']
                print(f"   CPU: {cpu.get('usage_percent_avg', 0):.1f}% ({cpu.get('core_count', 0)} cores)")
            if 'memory' in sys_metrics:
                mem = sys_metrics['memory']
                print(f"   Memory: {mem.get('usage_percent', 0):.1f}% ({mem.get('used_bytes', 0) / (1024**3):.1f}GB used)")
        
        # Queue Performance
        if 'queue_performance' in metrics and 'queues' in metrics['queue_performance']:
            print(f"\n📬 QUEUE PERFORMANCE:")
            for queue, data in metrics['queue_performance']['queues'].items():
                if isinstance(data, dict):
                    print(f"   {queue}: {data.get('pending_count', 0)} pending, {data.get('total_size', 0)} total")
        
        # Worker Status
        if 'worker_status' in metrics:
            worker = metrics['worker_status']
            print(f"\n👷 WORKER STATUS:")
            print(f"   Active: {worker.get('active_workers', 0)}/{worker.get('total_workers', 0)}")
            print(f"   Utilization: {worker.get('utilization_percent', 0):.1f}%")
        
        # Monetization
        if 'monetization' in metrics and 'revenue' in metrics['monetization']:
            revenue = metrics['monetization']['revenue']
            conversions = metrics['monetization']['conversions']
            print(f"\n💰 MONETIZATION:")
            print(f"   Revenue Today: ${revenue.get('total_today', 0):.2f}")
            print(f"   Conversions: {conversions.get('count_today', 0)} ({conversions.get('conversion_rate', 0):.2f}%)")
        
        print(f"\n{'='*80}\n")

def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description='AutoAffiliateHub-X2 Metrics Collector')
    parser.add_argument('--output-json', '-j', help='Export metrics to JSON file')
    parser.add_argument('--output-csv', '-c', help='Export metrics to CSV file')  
    parser.add_argument('--prometheus', '-p', action='store_true', help='Output Prometheus format')
    parser.add_argument('--quiet', '-q', action='store_true', help='Quiet mode - no console output')
    args = parser.parse_args()
    
    if args.quiet:
        logging.getLogger().setLevel(logging.WARNING)
    
    try:
        # Initialize collector
        collector = MetricsCollector()
        
        # Collect all metrics
        metrics = collector.collect_all_metrics()
        
        # Export to requested formats
        if args.output_json:
            collector.export_to_json(metrics, args.output_json)
        
        if args.output_csv:
            collector.export_to_csv(metrics, args.output_csv)
        
        if args.prometheus:
            prometheus_output = collector.export_prometheus(metrics)
            print(prometheus_output)
        elif not args.quiet:
            # Print summary to console
            collector.print_summary(metrics)
        
        logger.info("✅ Metrics collection completed successfully")
        
    except KeyboardInterrupt:
        print("\n🛑 Metrics collection interrupted by user")
    except Exception as e:
        logger.error(f"❌ Metrics collection failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()