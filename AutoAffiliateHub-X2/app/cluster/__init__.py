#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Cluster Coordinator

Main coordination module that brings together all cluster components.
Provides unified interface for cluster operations and management.
"""

import os
import sys
import time
import logging
import threading
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime
from dataclasses import asdict

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from .config_cluster import get_cluster_config
from .redis_queue import create_redis_queue, RedisQueueError
from .sqlite_queue import create_sqlite_queue, SQLiteQueueError
from .leader_election import create_leader_election
from .distributed_lock import create_distributed_lock
from .rate_limiter import create_rate_limiter
from .worker_manager import create_worker_manager
from .health import create_health_checker

logger = logging.getLogger(__name__)


class ClusterCoordinator:
    """
    Main cluster coordination class that manages all cluster components.
    
    Provides a unified interface for:
    - Queue management (Redis/SQLite)
    - Leader election and distributed locking
    - Worker process management and autoscaling
    - Rate limiting across the cluster
    - Health monitoring and reporting
    """
    
    def __init__(self, worker_function: Optional[Callable] = None):
        """
        Initialize cluster coordinator.
        
        Args:
            worker_function: Optional function to execute in worker processes
        """
        self.config = get_cluster_config()
        self.worker_function = worker_function
        
        # Core components
        self.queue = None
        self.leader_election = None
        self.worker_manager = None
        self.rate_limiter = None
        self.health_checker = None
        
        # State
        self.is_running = False
        self.start_time: Optional[datetime] = None
        self.node_id = f"coordinator_{os.getpid()}_{int(time.time())}"
        
        # Initialize components
        self._initialize_components()
    
    def _initialize_components(self) -> None:
        """Initialize all cluster components."""
        logger.info("🔧 Initializing cluster components...")
        
        try:
            # Initialize queue system
            self._initialize_queue()
            
            # Initialize leader election
            self.leader_election = create_leader_election(self.node_id)
            
            # Initialize rate limiter
            self.rate_limiter = create_rate_limiter()
            
            # Initialize health checker
            self.health_checker = create_health_checker()
            
            # Initialize worker manager (if worker function provided)
            if self.worker_function:
                self.worker_manager = create_worker_manager(
                    self.worker_function, 
                    self.config.worker.max_workers
                )
            
            logger.info("✅ All cluster components initialized successfully")
            
        except Exception as e:
            logger.error(f"❌ Failed to initialize cluster components: {e}")
            raise
    
    def _initialize_queue(self) -> None:
        """Initialize queue system with fallback."""
        try:
            if not self.config.force_sqlite:
                self.queue = create_redis_queue()
                logger.info("📊 Using Redis queue system")
            else:
                raise RedisQueueError("Forced SQLite mode")
        except (RedisQueueError, Exception) as e:
            logger.warning(f"Redis queue failed, using SQLite fallback: {e}")
            self.queue = create_sqlite_queue()
            logger.info("📊 Using SQLite queue system")
    
    def start(self) -> bool:
        """
        Start the cluster coordinator and all components.
        
        Returns:
            bool: True if started successfully, False otherwise
        """
        if self.is_running:
            logger.warning("Cluster coordinator is already running")
            return True
        
        logger.info(f"🚀 Starting AutoAffiliateHub-X2 cluster coordinator (Node: {self.node_id})")
        
        try:
            self.start_time = datetime.now()
            
            # Start worker manager if available
            if self.worker_manager:
                if not self.worker_manager.start():
                    logger.error("Failed to start worker manager")
                    return False
                logger.info("✅ Worker manager started")
            
            self.is_running = True
            
            logger.info("🎉 Cluster coordinator started successfully!")
            logger.info(f"   Node ID: {self.node_id}")
            logger.info(f"   Queue System: {'Redis' if hasattr(self.queue, 'redis_client') else 'SQLite'}")
            logger.info(f"   Max Workers: {self.config.worker.max_workers}")
            logger.info(f"   Auto-scaling: {'Enabled' if self.config.worker.auto_scaling_enabled else 'Disabled'}")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to start cluster coordinator: {e}")
            self.is_running = False
            return False
    
    def stop(self, timeout: float = 60.0) -> bool:
        """
        Stop the cluster coordinator and all components.
        
        Args:
            timeout: Maximum time to wait for shutdown
            
        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if not self.is_running:
            return True
        
        logger.info("🛑 Stopping cluster coordinator...")
        
        try:
            # Stop worker manager
            if self.worker_manager:
                if not self.worker_manager.stop(timeout * 0.8):
                    logger.warning("Worker manager did not stop cleanly")
                else:
                    logger.info("✅ Worker manager stopped")
            
            # Release leadership
            if self.leader_election:
                self.leader_election.release_leadership()
                logger.info("✅ Leadership released")
            
            self.is_running = False
            
            uptime = (datetime.now() - self.start_time).total_seconds() if self.start_time else 0
            logger.info(f"✅ Cluster coordinator stopped (uptime: {uptime:.1f}s)")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to stop cluster coordinator cleanly: {e}")
            return False
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get comprehensive cluster status.
        
        Returns:
            Dict[str, Any]: Complete cluster status information
        """
        status = {
            'coordinator': {
                'node_id': self.node_id,
                'is_running': self.is_running,
                'uptime_seconds': (datetime.now() - self.start_time).total_seconds() if self.start_time else 0,
                'queue_type': 'redis' if hasattr(self.queue, 'redis_client') else 'sqlite'
            },
            'leadership': {
                'is_leader': self.leader_election.is_leader() if self.leader_election else False,
                'current_leader': self.leader_election.get_current_leader() if self.leader_election else None
            },
            'workers': {},
            'health': {},
            'queue_stats': {}
        }
        
        # Worker manager status
        if self.worker_manager:
            status['workers'] = self.worker_manager.get_status()
        
        # Health status
        if self.health_checker:
            try:
                health = self.health_checker.get_health(['redis', 'sqlite', 'system_resources'])
                status['health'] = {
                    'overall_status': health.status.value,
                    'components': [
                        {
                            'name': comp.name,
                            'status': comp.status.value,
                            'message': comp.message
                        }
                        for comp in health.components
                    ]
                }
            except Exception as e:
                status['health'] = {'error': str(e)}
        
        # Queue statistics
        try:
            queue_stats = {}
            for stream_name in self.config.queue.stream_names:
                if hasattr(self.queue, 'get_stream_length'):
                    length = self.queue.get_stream_length(stream_name)
                    queue_stats[stream_name] = {'length': length}
            status['queue_stats'] = queue_stats
        except Exception as e:
            status['queue_stats'] = {'error': str(e)}
        
        return status
    
    def acquire_leadership(self) -> bool:
        """
        Attempt to acquire cluster leadership.
        
        Returns:
            bool: True if leadership acquired, False otherwise
        """
        if not self.leader_election:
            logger.error("Leader election not available")
            return False
        
        return self.leader_election.acquire_leadership()
    
    def release_leadership(self) -> bool:
        """
        Release cluster leadership.
        
        Returns:
            bool: True if leadership released, False otherwise
        """
        if not self.leader_election:
            return True
        
        return self.leader_election.release_leadership()
    
    def scale_workers(self, target_workers: int) -> bool:
        """
        Scale workers to target count.
        
        Args:
            target_workers: Target number of workers
            
        Returns:
            bool: True if scaling completed successfully
        """
        if not self.worker_manager:
            logger.error("Worker manager not available")
            return False
        
        return self.worker_manager.scale_workers(target_workers)
    
    def push_task(self, stream_name: str, task_data: Dict[str, Any]) -> Optional[str]:
        """
        Push a task to the queue.
        
        Args:
            stream_name: Name of the stream to push to
            task_data: Task data to queue
            
        Returns:
            Optional[str]: Message ID if successful, None otherwise
        """
        try:
            message_id = self.queue.push(stream_name, task_data)
            logger.debug(f"Pushed task to {stream_name}: {message_id}")
            return message_id
        except Exception as e:
            logger.error(f"Failed to push task to {stream_name}: {e}")
            return None
    
    def check_rate_limit(self, key: str, limit: int, window: int, cost: int = 1) -> bool:
        """
        Check rate limit for a key.
        
        Args:
            key: Rate limit key
            limit: Maximum requests in window
            window: Time window in seconds
            cost: Number of tokens to consume
            
        Returns:
            bool: True if request allowed, False if rate limited
        """
        try:
            result = self.rate_limiter.check_rate_limit(key, limit, window, cost)
            return result.allowed
        except Exception as e:
            logger.error(f"Rate limit check failed for {key}: {e}")
            return True  # Fail open
    
    def get_health_status(self, components: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Get health status for specified components.
        
        Args:
            components: Optional list of components to check
            
        Returns:
            Dict[str, Any]: Health status information
        """
        if not self.health_checker:
            return {'error': 'Health checker not available'}
        
        try:
            health = self.health_checker.get_health(components)
            return asdict(health)
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return {'error': str(e)}
    
    def with_distributed_lock(self, lock_name: str, timeout: int = 30):
        """
        Context manager for distributed locking.
        
        Args:
            lock_name: Name of the lock
            timeout: Lock timeout in seconds
            
        Returns:
            Context manager for the distributed lock
        """
        return create_distributed_lock(lock_name, timeout, self.node_id)
    
    def run_forever(self, check_interval: float = 10.0) -> None:
        """
        Run the coordinator forever with periodic status checks.
        
        Args:
            check_interval: Interval between status checks in seconds
        """
        if not self.is_running:
            logger.error("Coordinator is not running")
            return
        
        logger.info("🔄 Coordinator running in continuous mode...")
        
        try:
            while self.is_running:
                # Periodic status logging
                status = self.get_status()
                
                coordinator_status = status['coordinator']
                worker_status = status.get('workers', {})
                
                logger.info(
                    f"📊 Status - "
                    f"Uptime: {coordinator_status['uptime_seconds']:.0f}s, "
                    f"Workers: {worker_status.get('running_workers', 0)}/{worker_status.get('total_workers', 0)}, "
                    f"Leader: {status['leadership']['is_leader']}"
                )
                
                time.sleep(check_interval)
                
        except KeyboardInterrupt:
            logger.info("⚠️ Received interrupt signal")
        finally:
            logger.info("🛑 Stopping coordinator...")
            self.stop()


def create_cluster_coordinator(worker_function: Optional[Callable] = None) -> ClusterCoordinator:
    """
    Factory function to create cluster coordinator instance.
    
    Args:
        worker_function: Optional function to execute in worker processes
        
    Returns:
        ClusterCoordinator: Configured coordinator instance
    """
    return ClusterCoordinator(worker_function)


if __name__ == "__main__":
    # Demo the cluster coordinator functionality
    print("AutoAffiliateHub-X2 Cluster Coordinator Demo")
    print("=" * 44)
    
    import json
    
    def demo_worker_function(monitoring_context=None, **kwargs):
        """Demo worker function for testing."""
        if monitoring_context:
            logger = monitoring_context['logger']
            worker_id = monitoring_context['worker_id']
            shutdown_event = monitoring_context['shutdown_event']
            
            logger.info(f"Demo worker {worker_id} starting")
            
            work_count = 0
            while not shutdown_event.is_set():
                time.sleep(3)
                work_count += 1
                logger.info(f"Worker {worker_id} completed task {work_count}")
                
                if work_count >= 10:  # Limit work for demo
                    break
            
            logger.info(f"Demo worker {worker_id} finished")
    
    try:
        # Create coordinator
        coordinator = create_cluster_coordinator(demo_worker_function)
        
        print(f"Node ID: {coordinator.node_id}")
        print(f"Queue Type: {'Redis' if hasattr(coordinator.queue, 'redis_client') else 'SQLite'}")
        print()
        
        # Start coordinator
        print("🚀 Starting cluster coordinator...")
        if coordinator.start():
            print("✅ Coordinator started successfully")
        else:
            print("❌ Failed to start coordinator")
            sys.exit(1)
        
        # Try to acquire leadership
        print(f"\n🗳️  Attempting to acquire leadership...")
        if coordinator.acquire_leadership():
            print("✅ Leadership acquired!")
        else:
            current_leader = coordinator.leader_election.get_current_leader()
            print(f"❌ Leadership not acquired (current leader: {current_leader})")
        
        # Show initial status
        print(f"\n📊 Initial status:")
        status = coordinator.get_status()
        print(json.dumps(status, indent=2, default=str))
        
        # Push some test tasks
        print(f"\n📤 Pushing test tasks...")
        for i in range(3):
            task_id = coordinator.push_task('posting_tasks', {
                'task_type': 'demo_task',
                'task_id': i,
                'timestamp': datetime.now().isoformat()
            })
            print(f"  Pushed task {i}: {task_id}")
        
        # Test rate limiting
        print(f"\n🚦 Testing rate limiting...")
        for i in range(5):
            allowed = coordinator.check_rate_limit('demo_limit', 3, 10)  # 3 requests per 10 seconds
            print(f"  Request {i+1}: {'✅ ALLOWED' if allowed else '❌ DENIED'}")
        
        # Scale workers
        print(f"\n🔄 Scaling to 2 workers...")
        coordinator.scale_workers(2)
        time.sleep(2)
        
        # Run for a bit
        print(f"\n⏳ Running for 10 seconds...")
        end_time = time.time() + 10
        while time.time() < end_time:
            time.sleep(2)
            status = coordinator.get_status()
            worker_info = status.get('workers', {})
            print(f"  Workers: {worker_info.get('running_workers', 0)}/{worker_info.get('total_workers', 0)}")
        
        # Get final status
        print(f"\n📊 Final status:")
        status = coordinator.get_status()
        print(f"  Uptime: {status['coordinator']['uptime_seconds']:.1f}s")
        print(f"  Workers: {status['workers'].get('total_started', 0)} started, {status['workers'].get('total_stopped', 0)} stopped")
        print(f"  Leadership: {status['leadership']['is_leader']}")
        
        # Stop coordinator
        print(f"\n🛑 Stopping coordinator...")
        if coordinator.stop():
            print("✅ Coordinator stopped successfully")
        else:
            print("❌ Failed to stop coordinator cleanly")
        
        print(f"\n🎉 Cluster coordinator demo completed!")
        
    except KeyboardInterrupt:
        print(f"\n⚠️ Demo interrupted")
        if 'coordinator' in locals():
            coordinator.stop()
        sys.exit(0)
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)