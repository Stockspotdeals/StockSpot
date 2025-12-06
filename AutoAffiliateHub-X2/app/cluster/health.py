#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Health Monitoring Module

Provides health check endpoints and system monitoring for the cluster.
Monitors Redis, SQLite, worker processes, and system resources.
"""

import os
import sys
import time
import psutil
import logging
import sqlite3
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum

try:
    import redis
    from redis.exceptions import RedisError, ConnectionError
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    redis = None
    RedisError = Exception
    ConnectionError = Exception

from .config_cluster import get_cluster_config
from .redis_queue import create_redis_queue, RedisQueueError
from .sqlite_queue import create_sqlite_queue, SQLiteQueueError

logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """Health check status levels."""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


@dataclass
class ComponentHealth:
    """Health information for a system component."""
    name: str
    status: HealthStatus
    message: str
    details: Dict[str, Any]
    last_check: datetime
    response_time_ms: Optional[float] = None


@dataclass
class SystemHealth:
    """Overall system health information."""
    status: HealthStatus
    timestamp: datetime
    components: List[ComponentHealth]
    summary: Dict[str, Any]
    uptime_seconds: float


class HealthChecker:
    """
    Comprehensive health checker for AutoAffiliateHub-X2 cluster.
    
    Monitors various system components and provides detailed health reports.
    """
    
    def __init__(self):
        """Initialize health checker."""
        self.config = get_cluster_config()
        self.start_time = time.time()
        
        # Component checkers
        self._checkers = {
            'redis': self._check_redis_health,
            'sqlite': self._check_sqlite_health,
            'queue_system': self._check_queue_system_health,
            'system_resources': self._check_system_resources_health,
            'disk_space': self._check_disk_space_health,
            'process': self._check_process_health
        }
    
    def get_health(self, components: Optional[List[str]] = None) -> SystemHealth:
        """
        Get comprehensive system health report.
        
        Args:
            components: Optional list of specific components to check
            
        Returns:
            SystemHealth: Complete health report
        """
        logger.debug("Starting health check")
        start_time = time.time()
        
        # Determine which components to check
        if components is None:
            components = list(self._checkers.keys())
        
        # Run health checks
        component_results = []
        for component in components:
            if component in self._checkers:
                try:
                    checker = self._checkers[component]
                    result = checker()
                    component_results.append(result)
                except Exception as e:
                    logger.error(f"Health check failed for {component}: {e}")
                    component_results.append(ComponentHealth(
                        name=component,
                        status=HealthStatus.CRITICAL,
                        message=f"Health check failed: {str(e)}",
                        details={'error': str(e)},
                        last_check=datetime.now()
                    ))
        
        # Determine overall status
        overall_status = self._calculate_overall_status(component_results)
        
        # Calculate summary statistics
        summary = self._calculate_summary(component_results)
        
        # Calculate uptime
        uptime = time.time() - self.start_time
        
        check_duration = (time.time() - start_time) * 1000
        logger.debug(f"Health check completed in {check_duration:.2f}ms")
        
        return SystemHealth(
            status=overall_status,
            timestamp=datetime.now(),
            components=component_results,
            summary=summary,
            uptime_seconds=uptime
        )
    
    def _calculate_overall_status(self, components: List[ComponentHealth]) -> HealthStatus:
        """Calculate overall health status from component results."""
        if not components:
            return HealthStatus.UNKNOWN
        
        statuses = [comp.status for comp in components]
        
        # If any component is critical, overall is critical
        if HealthStatus.CRITICAL in statuses:
            return HealthStatus.CRITICAL
        
        # If any component is warning, overall is warning
        if HealthStatus.WARNING in statuses:
            return HealthStatus.WARNING
        
        # If all components are healthy, overall is healthy
        if all(status == HealthStatus.HEALTHY for status in statuses):
            return HealthStatus.HEALTHY
        
        # Otherwise, unknown
        return HealthStatus.UNKNOWN
    
    def _calculate_summary(self, components: List[ComponentHealth]) -> Dict[str, Any]:
        """Calculate summary statistics from component results."""
        total_components = len(components)
        healthy_count = sum(1 for comp in components if comp.status == HealthStatus.HEALTHY)
        warning_count = sum(1 for comp in components if comp.status == HealthStatus.WARNING)
        critical_count = sum(1 for comp in components if comp.status == HealthStatus.CRITICAL)
        
        # Calculate average response time
        response_times = [comp.response_time_ms for comp in components if comp.response_time_ms is not None]
        avg_response_time = sum(response_times) / len(response_times) if response_times else None
        
        return {
            'total_components': total_components,
            'healthy_components': healthy_count,
            'warning_components': warning_count,
            'critical_components': critical_count,
            'health_percentage': (healthy_count / total_components * 100) if total_components > 0 else 0,
            'average_response_time_ms': avg_response_time
        }
    
    def _check_redis_health(self) -> ComponentHealth:
        """Check Redis connection and performance."""
        start_time = time.time()
        
        try:
            if not REDIS_AVAILABLE:
                return ComponentHealth(
                    name='redis',
                    status=HealthStatus.WARNING,
                    message='Redis package not available',
                    details={'package_available': False},
                    last_check=datetime.now(),
                    response_time_ms=0
                )
            
            # Try to create Redis connection
            queue = create_redis_queue()
            
            # Test basic operations
            test_key = f"health_check_{int(time.time())}"
            test_value = "health_test"
            
            # Set test key
            queue.redis_client.set(test_key, test_value, ex=60)
            
            # Get test key
            retrieved = queue.redis_client.get(test_key)
            if retrieved.decode() != test_value:
                raise Exception("Redis read/write test failed")
            
            # Clean up
            queue.redis_client.delete(test_key)
            
            # Get Redis info
            redis_info = queue.redis_client.info()
            
            response_time = (time.time() - start_time) * 1000
            
            return ComponentHealth(
                name='redis',
                status=HealthStatus.HEALTHY,
                message='Redis is operational',
                details={
                    'connected': True,
                    'version': redis_info.get('redis_version'),
                    'connected_clients': redis_info.get('connected_clients'),
                    'used_memory_human': redis_info.get('used_memory_human'),
                    'keyspace_hits': redis_info.get('keyspace_hits'),
                    'keyspace_misses': redis_info.get('keyspace_misses')
                },
                last_check=datetime.now(),
                response_time_ms=response_time
            )
            
        except (RedisQueueError, ConnectionError, RedisError) as e:
            response_time = (time.time() - start_time) * 1000
            return ComponentHealth(
                name='redis',
                status=HealthStatus.CRITICAL,
                message=f'Redis connection failed: {str(e)}',
                details={'connected': False, 'error': str(e)},
                last_check=datetime.now(),
                response_time_ms=response_time
            )
    
    def _check_sqlite_health(self) -> ComponentHealth:
        """Check SQLite database health."""
        start_time = time.time()
        
        try:
            # Test SQLite queue
            queue = create_sqlite_queue()
            
            # Test basic operations
            test_message = {'test': 'health_check', 'timestamp': time.time()}
            
            # Push test message
            message_id = queue.push('health_test', test_message)
            
            # Read test message
            messages = queue.read('health_consumer', ['health_test'], count=1, block=False)
            
            if messages:
                # Acknowledge the message
                queue.acknowledge('health_consumer', messages[0]['id'])
            
            # Check database file
            db_path = queue.db_path
            db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
            
            response_time = (time.time() - start_time) * 1000
            
            return ComponentHealth(
                name='sqlite',
                status=HealthStatus.HEALTHY,
                message='SQLite is operational',
                details={
                    'available': True,
                    'database_path': db_path,
                    'database_size_bytes': db_size,
                    'test_message_id': message_id,
                    'test_messages_read': len(messages) if messages else 0
                },
                last_check=datetime.now(),
                response_time_ms=response_time
            )
            
        except (SQLiteQueueError, sqlite3.Error) as e:
            response_time = (time.time() - start_time) * 1000
            return ComponentHealth(
                name='sqlite',
                status=HealthStatus.CRITICAL,
                message=f'SQLite operation failed: {str(e)}',
                details={'available': False, 'error': str(e)},
                last_check=datetime.now(),
                response_time_ms=response_time
            )
    
    def _check_queue_system_health(self) -> ComponentHealth:
        """Check overall queue system health."""
        start_time = time.time()
        
        try:
            # Determine which queue system is active
            if not self.config.force_sqlite and REDIS_AVAILABLE:
                try:
                    queue = create_redis_queue()
                    queue_type = 'redis'
                except:
                    queue = create_sqlite_queue()
                    queue_type = 'sqlite_fallback'
            else:
                queue = create_sqlite_queue()
                queue_type = 'sqlite'
            
            # Get queue statistics
            stats = {
                'queue_type': queue_type,
                'streams': []
            }
            
            # Try to get stream info for configured streams
            for stream in self.config.queue.stream_names:
                try:
                    if hasattr(queue, 'get_stream_info'):
                        stream_info = queue.get_stream_info(stream)
                        if stream_info:
                            stats['streams'].append({
                                'name': stream,
                                'length': stream_info.get('length', 0),
                                'groups': stream_info.get('groups', 0)
                            })
                except Exception as e:
                    logger.debug(f"Could not get info for stream {stream}: {e}")
            
            response_time = (time.time() - start_time) * 1000
            
            return ComponentHealth(
                name='queue_system',
                status=HealthStatus.HEALTHY,
                message=f'Queue system operational ({queue_type})',
                details=stats,
                last_check=datetime.now(),
                response_time_ms=response_time
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            return ComponentHealth(
                name='queue_system',
                status=HealthStatus.CRITICAL,
                message=f'Queue system failed: {str(e)}',
                details={'error': str(e)},
                last_check=datetime.now(),
                response_time_ms=response_time
            )
    
    def _check_system_resources_health(self) -> ComponentHealth:
        """Check system resource utilization."""
        start_time = time.time()
        
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=0.1)
            cpu_count = psutil.cpu_count()
            
            # Memory usage
            memory = psutil.virtual_memory()
            memory_percent = memory.percent
            memory_available_gb = memory.available / (1024**3)
            
            # Determine status based on thresholds
            status = HealthStatus.HEALTHY
            messages = []
            
            if cpu_percent > 90:
                status = HealthStatus.CRITICAL
                messages.append(f'CPU usage critical: {cpu_percent:.1f}%')
            elif cpu_percent > 70:
                status = HealthStatus.WARNING
                messages.append(f'CPU usage high: {cpu_percent:.1f}%')
            
            if memory_percent > 90:
                status = HealthStatus.CRITICAL
                messages.append(f'Memory usage critical: {memory_percent:.1f}%')
            elif memory_percent > 80:
                status = HealthStatus.WARNING
                messages.append(f'Memory usage high: {memory_percent:.1f}%')
            
            if memory_available_gb < 0.5:  # Less than 500MB available
                status = HealthStatus.CRITICAL
                messages.append(f'Low available memory: {memory_available_gb:.1f}GB')
            
            message = 'System resources normal'
            if messages:
                message = '; '.join(messages)
            
            response_time = (time.time() - start_time) * 1000
            
            return ComponentHealth(
                name='system_resources',
                status=status,
                message=message,
                details={
                    'cpu_percent': cpu_percent,
                    'cpu_count': cpu_count,
                    'memory_percent': memory_percent,
                    'memory_total_gb': memory.total / (1024**3),
                    'memory_available_gb': memory_available_gb,
                    'memory_used_gb': memory.used / (1024**3)
                },
                last_check=datetime.now(),
                response_time_ms=response_time
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            return ComponentHealth(
                name='system_resources',
                status=HealthStatus.CRITICAL,
                message=f'System resource check failed: {str(e)}',
                details={'error': str(e)},
                last_check=datetime.now(),
                response_time_ms=response_time
            )
    
    def _check_disk_space_health(self) -> ComponentHealth:
        """Check disk space availability."""
        start_time = time.time()
        
        try:
            # Check disk usage for application directory
            app_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            disk_usage = psutil.disk_usage(app_path)
            
            free_gb = disk_usage.free / (1024**3)
            total_gb = disk_usage.total / (1024**3)
            used_percent = (disk_usage.used / disk_usage.total) * 100
            
            # Determine status
            status = HealthStatus.HEALTHY
            message = 'Disk space sufficient'
            
            if free_gb < 1.0:  # Less than 1GB free
                status = HealthStatus.CRITICAL
                message = f'Critical: Only {free_gb:.1f}GB free'
            elif free_gb < 5.0:  # Less than 5GB free
                status = HealthStatus.WARNING
                message = f'Warning: Only {free_gb:.1f}GB free'
            elif used_percent > 90:  # More than 90% used
                status = HealthStatus.WARNING
                message = f'Warning: Disk {used_percent:.1f}% full'
            
            response_time = (time.time() - start_time) * 1000
            
            return ComponentHealth(
                name='disk_space',
                status=status,
                message=message,
                details={
                    'path': app_path,
                    'total_gb': total_gb,
                    'used_gb': disk_usage.used / (1024**3),
                    'free_gb': free_gb,
                    'used_percent': used_percent
                },
                last_check=datetime.now(),
                response_time_ms=response_time
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            return ComponentHealth(
                name='disk_space',
                status=HealthStatus.CRITICAL,
                message=f'Disk space check failed: {str(e)}',
                details={'error': str(e)},
                last_check=datetime.now(),
                response_time_ms=response_time
            )
    
    def _check_process_health(self) -> ComponentHealth:
        """Check current process health."""
        start_time = time.time()
        
        try:
            # Get current process info
            process = psutil.Process()
            
            # Process metrics
            cpu_percent = process.cpu_percent()
            memory_info = process.memory_info()
            memory_mb = memory_info.rss / (1024**2)
            
            # File descriptors (Unix only)
            open_files = None
            try:
                open_files = len(process.open_files())
            except (AttributeError, psutil.AccessDenied):
                pass
            
            # Process status
            status_info = {
                'pid': process.pid,
                'status': process.status(),
                'create_time': datetime.fromtimestamp(process.create_time()),
                'cpu_percent': cpu_percent,
                'memory_mb': memory_mb,
                'num_threads': process.num_threads()
            }
            
            if open_files is not None:
                status_info['open_files'] = open_files
            
            # Determine health status
            status = HealthStatus.HEALTHY
            message = 'Process running normally'
            
            if memory_mb > 1000:  # More than 1GB
                status = HealthStatus.WARNING
                message = f'High memory usage: {memory_mb:.1f}MB'
            
            if cpu_percent > 80:  # High CPU usage
                status = HealthStatus.WARNING
                message = f'High CPU usage: {cpu_percent:.1f}%'
            
            response_time = (time.time() - start_time) * 1000
            
            return ComponentHealth(
                name='process',
                status=status,
                message=message,
                details=status_info,
                last_check=datetime.now(),
                response_time_ms=response_time
            )
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            return ComponentHealth(
                name='process',
                status=HealthStatus.CRITICAL,
                message=f'Process check failed: {str(e)}',
                details={'error': str(e)},
                last_check=datetime.now(),
                response_time_ms=response_time
            )


def create_health_checker() -> HealthChecker:
    """
    Factory function to create health checker instance.
    
    Returns:
        HealthChecker: Configured health checker instance
    """
    return HealthChecker()


# Global health checker instance
_health_checker: Optional[HealthChecker] = None


def get_health_checker() -> HealthChecker:
    """
    Get global health checker instance (singleton).
    
    Returns:
        HealthChecker: Global health checker instance
    """
    global _health_checker
    if _health_checker is None:
        _health_checker = create_health_checker()
    return _health_checker


def get_health(components: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Convenience function to get health report as dictionary.
    
    Args:
        components: Optional list of specific components to check
        
    Returns:
        Dict[str, Any]: Health report as dictionary
    """
    checker = get_health_checker()
    health = checker.get_health(components)
    
    # Convert to dictionary
    result = asdict(health)
    
    # Convert enums to strings
    result['status'] = health.status.value
    for component in result['components']:
        component['status'] = HealthStatus(component['status']).value
        # Convert datetime to ISO string
        if isinstance(component['last_check'], datetime):
            component['last_check'] = component['last_check'].isoformat()
    
    if isinstance(result['timestamp'], datetime):
        result['timestamp'] = result['timestamp'].isoformat()
    
    return result


if __name__ == "__main__":
    # Demo the health monitoring functionality
    print("AutoAffiliateHub-X2 Health Monitor Demo")
    print("=" * 39)
    
    import sys
    import json
    
    try:
        checker = create_health_checker()
        
        print("Running comprehensive health check...")
        print()
        
        # Get full health report
        health = checker.get_health()
        
        print(f"📊 Overall Status: {health.status.value.upper()}")
        print(f"🕐 Timestamp: {health.timestamp}")
        print(f"⏱️  Uptime: {health.uptime_seconds:.1f} seconds")
        print()
        
        # Show component results
        print("🔍 Component Health:")
        for component in health.components:
            status_icon = {
                HealthStatus.HEALTHY: "✅",
                HealthStatus.WARNING: "⚠️",
                HealthStatus.CRITICAL: "❌",
                HealthStatus.UNKNOWN: "❓"
            }.get(component.status, "❓")
            
            response_time = f" ({component.response_time_ms:.1f}ms)" if component.response_time_ms else ""
            print(f"  {status_icon} {component.name}: {component.message}{response_time}")
        
        print()
        
        # Show summary
        print("📈 Summary:")
        summary = health.summary
        print(f"  Total components: {summary['total_components']}")
        print(f"  Healthy: {summary['healthy_components']}")
        print(f"  Warning: {summary['warning_components']}")
        print(f"  Critical: {summary['critical_components']}")
        print(f"  Health percentage: {summary['health_percentage']:.1f}%")
        
        if summary['average_response_time_ms']:
            print(f"  Average response time: {summary['average_response_time_ms']:.1f}ms")
        
        # Test specific component
        print(f"\n🔍 Testing individual component (Redis):")
        redis_health = checker.get_health(['redis'])
        redis_component = redis_health.components[0]
        print(f"  Status: {redis_component.status.value}")
        print(f"  Message: {redis_component.message}")
        
        if redis_component.details:
            print(f"  Details: {json.dumps(redis_component.details, indent=4, default=str)}")
        
        print(f"\n🎉 Health monitoring demo completed!")
        
        # Exit with appropriate code
        if health.status == HealthStatus.CRITICAL:
            sys.exit(2)
        elif health.status == HealthStatus.WARNING:
            sys.exit(1)
        else:
            sys.exit(0)
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)