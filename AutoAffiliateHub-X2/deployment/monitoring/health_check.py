#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Health Check Endpoint

This script provides HTTP health check endpoints for monitoring system status.
It can run as a standalone Flask server or be integrated into the main dashboard.

Endpoints:
- GET /health - Basic health status
- GET /health/detailed - Detailed component health
- GET /health/live - Kubernetes liveness probe
- GET /health/ready - Kubernetes readiness probe

Usage:
    python deployment/monitoring/health_check.py
    python deployment/monitoring/health_check.py --port 8080
    python deployment/monitoring/health_check.py --host 0.0.0.0
"""

import os
import sys
import json
import time
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional
import argparse
from flask import Flask, jsonify, request
import psutil

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Import AutoAffiliateHub components
try:
    from app.cluster.health import get_health_checker, HealthStatus
    from app.queue_manager import QueueManager
    from app.cluster.rate_limiter import get_rate_limiter
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

class HealthCheckServer:
    """Health check HTTP server for system monitoring."""
    
    def __init__(self, host: str = '127.0.0.1', port: int = 8080):
        """Initialize health check server."""
        self.host = host
        self.port = port
        
        # Initialize Flask app
        self.app = Flask(__name__)
        self.app.config['JSON_SORT_KEYS'] = False
        
        # Initialize system components
        try:
            self.health_checker = get_health_checker()
            self.queue_manager = QueueManager()
            self.rate_limiter = get_rate_limiter()
        except Exception as e:
            logger.error(f"❌ Failed to initialize components: {e}")
            # Continue with limited functionality
            self.health_checker = None
            self.queue_manager = None
            self.rate_limiter = None
        
        # Setup routes
        self.setup_routes()
        
        # Health check cache (1 minute TTL)
        self._health_cache = {}
        self._cache_ttl = 60
        
        logger.info(f"🏥 HealthCheckServer initialized on {host}:{port}")
    
    def setup_routes(self):
        """Setup Flask routes for health endpoints."""
        
        @self.app.route('/health', methods=['GET'])
        def basic_health():
            """Basic health check endpoint."""
            try:
                health_data = self.get_basic_health()
                status_code = 200 if health_data['status'] == 'healthy' else 503
                return jsonify(health_data), status_code
            except Exception as e:
                logger.error(f"❌ Basic health check failed: {e}")
                return jsonify({
                    'status': 'unhealthy',
                    'timestamp': datetime.now().isoformat(),
                    'error': str(e)
                }), 503
        
        @self.app.route('/health/detailed', methods=['GET'])
        def detailed_health():
            """Detailed health check with component breakdown."""
            try:
                health_data = self.get_detailed_health()
                status_code = 200 if health_data['status'] == 'healthy' else 503
                return jsonify(health_data), status_code
            except Exception as e:
                logger.error(f"❌ Detailed health check failed: {e}")
                return jsonify({
                    'status': 'unhealthy',
                    'timestamp': datetime.now().isoformat(),
                    'error': str(e)
                }), 503
        
        @self.app.route('/health/live', methods=['GET'])
        def liveness_probe():
            """Kubernetes liveness probe - checks if process is alive."""
            try:
                # Simple check that process is responding
                return jsonify({
                    'status': 'alive',
                    'timestamp': datetime.now().isoformat(),
                    'uptime_seconds': time.time() - psutil.Process().create_time()
                }), 200
            except Exception as e:
                return jsonify({
                    'status': 'dead',
                    'timestamp': datetime.now().isoformat(),
                    'error': str(e)
                }), 503
        
        @self.app.route('/health/ready', methods=['GET'])
        def readiness_probe():
            """Kubernetes readiness probe - checks if ready to serve traffic."""
            try:
                ready = self.check_readiness()
                status_code = 200 if ready['ready'] else 503
                return jsonify(ready), status_code
            except Exception as e:
                return jsonify({
                    'ready': False,
                    'timestamp': datetime.now().isoformat(),
                    'error': str(e)
                }), 503
        
        @self.app.route('/health/metrics', methods=['GET'])
        def health_metrics():
            """Prometheus-format health metrics."""
            try:
                metrics = self.get_prometheus_metrics()
                return metrics, 200, {'Content-Type': 'text/plain'}
            except Exception as e:
                logger.error(f"❌ Metrics generation failed: {e}")
                return f"# Error generating metrics: {e}\n", 500
        
        @self.app.errorhandler(404)
        def not_found(error):
            return jsonify({
                'error': 'Health endpoint not found',
                'available_endpoints': [
                    '/health',
                    '/health/detailed', 
                    '/health/live',
                    '/health/ready',
                    '/health/metrics'
                ]
            }), 404
    
    def get_basic_health(self) -> Dict[str, Any]:
        """Get basic system health status."""
        cache_key = 'basic_health'
        
        # Check cache
        if self._is_cached(cache_key):
            return self._health_cache[cache_key]['data']
        
        try:
            # Check critical components
            components_healthy = True
            
            # System resources
            cpu_usage = psutil.cpu_percent(interval=1)
            memory_usage = psutil.virtual_memory().percent
            
            if cpu_usage > 95 or memory_usage > 95:
                components_healthy = False
            
            # Queue system (if available)
            queue_healthy = True
            if self.queue_manager:
                try:
                    # Simple queue accessibility test
                    self.queue_manager.get_queue_size('test_queue')
                except Exception:
                    queue_healthy = False
                    components_healthy = False
            
            health_data = {
                'status': 'healthy' if components_healthy else 'unhealthy',
                'timestamp': datetime.now().isoformat(),
                'uptime_seconds': time.time() - psutil.Process().create_time(),
                'system': {
                    'cpu_usage': cpu_usage,
                    'memory_usage': memory_usage
                },
                'components': {
                    'queue_system': 'healthy' if queue_healthy else 'unhealthy'
                }
            }
            
            # Cache result
            self._cache_result(cache_key, health_data)
            return health_data
            
        except Exception as e:
            logger.error(f"❌ Basic health check error: {e}")
            return {
                'status': 'unhealthy',
                'timestamp': datetime.now().isoformat(),
                'error': str(e)
            }
    
    def get_detailed_health(self) -> Dict[str, Any]:
        """Get detailed health status with component breakdown."""
        cache_key = 'detailed_health'
        
        # Check cache
        if self._is_cached(cache_key):
            return self._health_cache[cache_key]['data']
        
        try:
            health_data = {
                'status': 'healthy',
                'timestamp': datetime.now().isoformat(),
                'uptime_seconds': time.time() - psutil.Process().create_time(),
                'system_resources': self._get_system_resources(),
                'components': {},
                'queues': {},
                'rate_limits': {}
            }
            
            overall_healthy = True
            
            # Get component health from health checker
            if self.health_checker:
                try:
                    component_health = self.health_checker.get_health([
                        'redis', 'sqlite', 'worker_manager', 'system_resources'
                    ])
                    
                    health_data['components'] = {}
                    for component, status in component_health.component_health.items():
                        component_status = status.get('status', 'unknown')
                        health_data['components'][component] = {
                            'status': component_status,
                            'details': status.get('details', {}),
                            'last_check': status.get('timestamp', datetime.now().isoformat())
                        }
                        
                        if component_status not in ['healthy', 'operational']:
                            overall_healthy = False
                            
                except Exception as e:
                    logger.warning(f"⚠️ Component health check failed: {e}")
                    health_data['components']['health_checker'] = {
                        'status': 'error',
                        'error': str(e)
                    }
                    overall_healthy = False
            
            # Get queue status
            if self.queue_manager:
                try:
                    queues = ['posting_tasks', 'scraping_tasks', 'analytics_tasks']
                    for queue in queues:
                        try:
                            size = self.queue_manager.get_queue_size(queue)
                            pending = self.queue_manager.get_pending_count(queue)
                            processing = self.queue_manager.get_processing_count(queue)
                            
                            health_data['queues'][queue] = {
                                'status': 'healthy' if size < 1000 else 'warning',
                                'total_size': size,
                                'pending': pending,
                                'processing': processing
                            }
                            
                            if size > 1000:  # Warning threshold
                                overall_healthy = False
                                
                        except Exception as e:
                            health_data['queues'][queue] = {
                                'status': 'error',
                                'error': str(e)
                            }
                            overall_healthy = False
                            
                except Exception as e:
                    logger.warning(f"⚠️ Queue status check failed: {e}")
                    health_data['queues'] = {'error': str(e)}
            
            # Get rate limit status
            if self.rate_limiter:
                try:
                    platforms = ['twitter', 'reddit', 'instagram']
                    for platform in platforms:
                        try:
                            result = self.rate_limiter.check_platform_limit(platform, cost=0)
                            
                            health_data['rate_limits'][platform] = {
                                'status': 'healthy' if result.allowed else 'rate_limited',
                                'remaining': result.remaining,
                                'limit': result.limit,
                                'reset_time': result.reset_time
                            }
                            
                        except Exception as e:
                            health_data['rate_limits'][platform] = {
                                'status': 'error',
                                'error': str(e)
                            }
                            
                except Exception as e:
                    logger.warning(f"⚠️ Rate limit check failed: {e}")
                    health_data['rate_limits'] = {'error': str(e)}
            
            health_data['status'] = 'healthy' if overall_healthy else 'unhealthy'
            
            # Cache result
            self._cache_result(cache_key, health_data)
            return health_data
            
        except Exception as e:
            logger.error(f"❌ Detailed health check error: {e}")
            return {
                'status': 'unhealthy',
                'timestamp': datetime.now().isoformat(),
                'error': str(e)
            }
    
    def check_readiness(self) -> Dict[str, Any]:
        """Check if system is ready to serve traffic."""
        try:
            ready = True
            checks = {}
            
            # System resources check
            cpu_usage = psutil.cpu_percent(interval=1)
            memory_usage = psutil.virtual_memory().percent
            
            checks['system_resources'] = {
                'ready': cpu_usage < 90 and memory_usage < 90,
                'cpu_usage': cpu_usage,
                'memory_usage': memory_usage
            }
            
            if not checks['system_resources']['ready']:
                ready = False
            
            # Queue system check
            if self.queue_manager:
                try:
                    self.queue_manager.get_queue_size('test_queue')
                    checks['queue_system'] = {'ready': True}
                except Exception as e:
                    checks['queue_system'] = {'ready': False, 'error': str(e)}
                    ready = False
            else:
                checks['queue_system'] = {'ready': False, 'error': 'Queue manager not initialized'}
                ready = False
            
            # Rate limiter check
            if self.rate_limiter:
                try:
                    self.rate_limiter.check_platform_limit('test', cost=0)
                    checks['rate_limiter'] = {'ready': True}
                except Exception as e:
                    checks['rate_limiter'] = {'ready': False, 'error': str(e)}
                    ready = False
            else:
                checks['rate_limiter'] = {'ready': False, 'error': 'Rate limiter not initialized'}
            
            return {
                'ready': ready,
                'timestamp': datetime.now().isoformat(),
                'checks': checks
            }
            
        except Exception as e:
            logger.error(f"❌ Readiness check error: {e}")
            return {
                'ready': False,
                'timestamp': datetime.now().isoformat(),
                'error': str(e)
            }
    
    def _get_system_resources(self) -> Dict[str, Any]:
        """Get current system resource usage."""
        try:
            # CPU information
            cpu_percent = psutil.cpu_percent(interval=1)
            cpu_count = psutil.cpu_count()
            
            # Memory information
            memory = psutil.virtual_memory()
            
            # Disk information
            disk = psutil.disk_usage('/')
            
            # Network information
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
            logger.error(f"❌ System resources check failed: {e}")
            return {'error': str(e)}
    
    def get_prometheus_metrics(self) -> str:
        """Generate Prometheus-format metrics."""
        try:
            metrics = []
            timestamp = int(time.time() * 1000)
            
            # System metrics
            try:
                cpu_usage = psutil.cpu_percent(interval=1)
                memory_usage = psutil.virtual_memory().percent
                
                metrics.extend([
                    f'affilly_cpu_usage_percent {cpu_usage} {timestamp}',
                    f'affilly_memory_usage_percent {memory_usage} {timestamp}'
                ])
            except Exception:
                pass
            
            # Component health metrics
            try:
                basic_health = self.get_basic_health()
                health_value = 1 if basic_health['status'] == 'healthy' else 0
                metrics.append(f'affilly_system_health {health_value} {timestamp}')
            except Exception:
                pass
            
            # Queue metrics
            if self.queue_manager:
                try:
                    queues = ['posting_tasks', 'scraping_tasks', 'analytics_tasks']
                    for queue in queues:
                        try:
                            size = self.queue_manager.get_queue_size(queue)
                            pending = self.queue_manager.get_pending_count(queue)
                            
                            metrics.extend([
                                f'affilly_queue_size{{queue="{queue}"}} {size} {timestamp}',
                                f'affilly_queue_pending{{queue="{queue}"}} {pending} {timestamp}'
                            ])
                        except Exception:
                            pass
                except Exception:
                    pass
            
            # Rate limit metrics
            if self.rate_limiter:
                try:
                    platforms = ['twitter', 'reddit', 'instagram']
                    for platform in platforms:
                        try:
                            result = self.rate_limiter.check_platform_limit(platform, cost=0)
                            
                            metrics.extend([
                                f'affilly_rate_limit_remaining{{platform="{platform}"}} {result.remaining} {timestamp}',
                                f'affilly_rate_limit_total{{platform="{platform}"}} {result.limit} {timestamp}'
                            ])
                        except Exception:
                            pass
                except Exception:
                    pass
            
            # Add help text and type information
            header = [
                '# HELP affilly_system_health System health status (1=healthy, 0=unhealthy)',
                '# TYPE affilly_system_health gauge',
                '# HELP affilly_cpu_usage_percent CPU usage percentage',
                '# TYPE affilly_cpu_usage_percent gauge',
                '# HELP affilly_memory_usage_percent Memory usage percentage',
                '# TYPE affilly_memory_usage_percent gauge',
                '# HELP affilly_queue_size Queue size',
                '# TYPE affilly_queue_size gauge',
                '# HELP affilly_queue_pending Pending items in queue',
                '# TYPE affilly_queue_pending gauge',
                '# HELP affilly_rate_limit_remaining Rate limit remaining',
                '# TYPE affilly_rate_limit_remaining gauge',
                '# HELP affilly_rate_limit_total Rate limit total',
                '# TYPE affilly_rate_limit_total gauge'
            ]
            
            return '\n'.join(header + metrics) + '\n'
            
        except Exception as e:
            logger.error(f"❌ Prometheus metrics generation failed: {e}")
            return f'# Error generating metrics: {e}\n'
    
    def _is_cached(self, cache_key: str) -> bool:
        """Check if result is cached and still valid."""
        if cache_key not in self._health_cache:
            return False
        
        cached_time = self._health_cache[cache_key]['timestamp']
        return (time.time() - cached_time) < self._cache_ttl
    
    def _cache_result(self, cache_key: str, data: Any):
        """Cache result with timestamp."""
        self._health_cache[cache_key] = {
            'timestamp': time.time(),
            'data': data
        }
    
    def run(self, debug: bool = False):
        """Run the health check server."""
        try:
            logger.info(f"🚀 Starting health check server on {self.host}:{self.port}")
            self.app.run(
                host=self.host,
                port=self.port,
                debug=debug,
                threaded=True
            )
        except Exception as e:
            logger.error(f"❌ Failed to start health check server: {e}")
            raise

def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description='AutoAffiliateHub-X2 Health Check Server')
    parser.add_argument('--host', '-H', default='127.0.0.1',
                       help='Host to bind to (default: 127.0.0.1)')
    parser.add_argument('--port', '-p', type=int, default=8080,
                       help='Port to bind to (default: 8080)')
    parser.add_argument('--debug', '-d', action='store_true',
                       help='Enable debug mode')
    args = parser.parse_args()
    
    try:
        # Initialize and run health check server
        server = HealthCheckServer(host=args.host, port=args.port)
        server.run(debug=args.debug)
        
    except KeyboardInterrupt:
        print("\n🛑 Health check server stopped by user")
    except Exception as e:
        logger.error(f"❌ Health check server failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()