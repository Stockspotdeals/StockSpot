#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Worker Manager Module

Manages multiple worker processes with autoscaling capabilities.
Coordinates workers across the cluster using Redis Streams and SQLite fallback.
"""

import os
import sys
import time
import signal
import logging
import threading
import multiprocessing
from typing import Dict, List, Optional, Callable, Any
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from .config_cluster import get_cluster_config
from .redis_queue import create_redis_queue, RedisQueueError
from .sqlite_queue import create_sqlite_queue, SQLiteQueueError
from .leader_election import create_leader_election
from .distributed_lock import create_distributed_lock
from .rate_limiter import get_rate_limiter

logger = logging.getLogger(__name__)


class WorkerStatus(Enum):
    """Worker process status."""
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


@dataclass
class WorkerInfo:
    """Information about a worker process."""
    worker_id: str
    pid: Optional[int]
    status: WorkerStatus
    started_at: datetime
    last_heartbeat: Optional[datetime]
    processed_count: int
    error_count: int
    current_task: Optional[str]


class WorkerProcess:
    """
    Individual worker process wrapper.
    
    Manages the lifecycle of a single worker process and provides
    communication channels for monitoring and control.
    """
    
    def __init__(self, worker_id: str, worker_function: Callable, 
                 worker_args: tuple = (), worker_kwargs: dict = None):
        """
        Initialize worker process.
        
        Args:
            worker_id: Unique identifier for this worker
            worker_function: Function to execute in worker process
            worker_args: Arguments to pass to worker function
            worker_kwargs: Keyword arguments to pass to worker function
        """
        self.worker_id = worker_id
        self.worker_function = worker_function
        self.worker_args = worker_args or ()
        self.worker_kwargs = worker_kwargs or {}
        
        self.process: Optional[multiprocessing.Process] = None
        self.status = WorkerStatus.STOPPED
        self.started_at: Optional[datetime] = None
        self.last_heartbeat: Optional[datetime] = None
        self.processed_count = 0
        self.error_count = 0
        self.current_task: Optional[str] = None
        
        # Communication queues
        self.control_queue = multiprocessing.Queue()
        self.status_queue = multiprocessing.Queue()
        
        # Event for shutdown coordination
        self.shutdown_event = multiprocessing.Event()
    
    def start(self) -> bool:
        """
        Start the worker process.
        
        Returns:
            bool: True if started successfully, False otherwise
        """
        if self.process is not None and self.process.is_alive():
            logger.warning(f"Worker {self.worker_id} is already running")
            return True
        
        try:
            self.process = multiprocessing.Process(
                target=self._worker_wrapper,
                name=f"Worker-{self.worker_id}",
                args=(
                    self.worker_function,
                    self.worker_args,
                    self.worker_kwargs,
                    self.control_queue,
                    self.status_queue,
                    self.shutdown_event
                )
            )
            
            self.process.start()
            self.status = WorkerStatus.STARTING
            self.started_at = datetime.now()
            
            logger.info(f"🚀 Started worker {self.worker_id} with PID {self.process.pid}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start worker {self.worker_id}: {e}")
            self.status = WorkerStatus.ERROR
            return False
    
    def stop(self, timeout: float = 30.0) -> bool:
        """
        Stop the worker process gracefully.
        
        Args:
            timeout: Maximum time to wait for graceful shutdown
            
        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if self.process is None or not self.process.is_alive():
            self.status = WorkerStatus.STOPPED
            return True
        
        try:
            self.status = WorkerStatus.STOPPING
            logger.info(f"🛑 Stopping worker {self.worker_id}...")
            
            # Send shutdown signal
            self.shutdown_event.set()
            self.control_queue.put(('SHUTDOWN', None))
            
            # Wait for graceful shutdown
            self.process.join(timeout)
            
            if self.process.is_alive():
                # Force termination
                logger.warning(f"Force terminating worker {self.worker_id}")
                self.process.terminate()
                self.process.join(5.0)
                
                if self.process.is_alive():
                    # Kill if still alive
                    logger.error(f"Force killing worker {self.worker_id}")
                    try:
                        os.kill(self.process.pid, signal.SIGKILL)
                    except (OSError, AttributeError):
                        pass
            
            self.status = WorkerStatus.STOPPED
            logger.info(f"✅ Worker {self.worker_id} stopped")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop worker {self.worker_id}: {e}")
            self.status = WorkerStatus.ERROR
            return False
    
    def is_alive(self) -> bool:
        """Check if worker process is alive."""
        return self.process is not None and self.process.is_alive()
    
    def get_info(self) -> WorkerInfo:
        """Get worker information."""
        return WorkerInfo(
            worker_id=self.worker_id,
            pid=self.process.pid if self.process else None,
            status=self.status,
            started_at=self.started_at or datetime.now(),
            last_heartbeat=self.last_heartbeat,
            processed_count=self.processed_count,
            error_count=self.error_count,
            current_task=self.current_task
        )
    
    def _worker_wrapper(self, worker_function: Callable, worker_args: tuple,
                       worker_kwargs: dict, control_queue: multiprocessing.Queue,
                       status_queue: multiprocessing.Queue, 
                       shutdown_event: multiprocessing.Event) -> None:
        """
        Wrapper function that runs in the worker process.
        
        Provides monitoring, error handling, and communication capabilities.
        """
        # Set up logging for worker
        worker_logger = logging.getLogger(f"worker.{self.worker_id}")
        
        try:
            worker_logger.info(f"Worker {self.worker_id} started in process {os.getpid()}")
            
            # Send status update
            status_queue.put(('STARTED', {'pid': os.getpid(), 'timestamp': datetime.now()}))
            
            # Execute worker function with monitoring
            self._monitored_execution(
                worker_function, worker_args, worker_kwargs,
                control_queue, status_queue, shutdown_event, worker_logger
            )
            
        except Exception as e:
            worker_logger.error(f"Worker {self.worker_id} failed: {e}")
            status_queue.put(('ERROR', {'error': str(e), 'timestamp': datetime.now()}))
        finally:
            worker_logger.info(f"Worker {self.worker_id} exiting")
            status_queue.put(('STOPPED', {'timestamp': datetime.now()}))
    
    def _monitored_execution(self, worker_function: Callable, worker_args: tuple,
                            worker_kwargs: dict, control_queue: multiprocessing.Queue,
                            status_queue: multiprocessing.Queue,
                            shutdown_event: multiprocessing.Event,
                            worker_logger: logging.Logger) -> None:
        """Execute worker function with monitoring and control handling."""
        last_heartbeat = time.time()
        heartbeat_interval = 30.0  # Send heartbeat every 30 seconds
        
        # Add monitoring context to kwargs
        monitoring_context = {
            'worker_id': self.worker_id,
            'control_queue': control_queue,
            'status_queue': status_queue,
            'shutdown_event': shutdown_event,
            'logger': worker_logger
        }
        worker_kwargs.update({'monitoring_context': monitoring_context})
        
        try:
            # Call the actual worker function
            worker_function(*worker_args, **worker_kwargs)
            
        except KeyboardInterrupt:
            worker_logger.info("Worker received keyboard interrupt")
        except Exception as e:
            worker_logger.error(f"Worker function failed: {e}")
            raise


class WorkerManager:
    """
    Manages a pool of worker processes with autoscaling capabilities.
    
    Provides worker lifecycle management, load balancing, and coordination
    across the cluster using leader election and distributed locks.
    """
    
    def __init__(self, worker_function: Callable, max_workers: int = None):
        """
        Initialize worker manager.
        
        Args:
            worker_function: Function to execute in worker processes
            max_workers: Maximum number of workers (uses config default if None)
        """
        self.config = get_cluster_config()
        self.worker_function = worker_function
        self.max_workers = max_workers or self.config.worker.max_workers
        
        self.workers: Dict[str, WorkerProcess] = {}
        self.is_running = False
        
        # Manager thread
        self._manager_thread: Optional[threading.Thread] = None
        self._shutdown_event = threading.Event()
        
        # Components
        self.leader_election = create_leader_election()
        self.queue = None
        self.rate_limiter = get_rate_limiter()
        
        # Statistics
        self.start_time = datetime.now()
        self.total_workers_started = 0
        self.total_workers_stopped = 0
        
        # Initialize queue system
        self._initialize_queue()
    
    def _initialize_queue(self) -> None:
        """Initialize queue system (Redis or SQLite fallback)."""
        try:
            if not self.config.force_sqlite:
                self.queue = create_redis_queue()
                logger.info("Using Redis queue for worker management")
            else:
                raise RedisQueueError("Forced SQLite mode")
        except (RedisQueueError, Exception) as e:
            logger.warning(f"Redis queue failed, using SQLite fallback: {e}")
            self.queue = create_sqlite_queue()
            logger.info("Using SQLite queue for worker management")
    
    def start(self) -> bool:
        """
        Start the worker manager.
        
        Returns:
            bool: True if started successfully, False otherwise
        """
        if self.is_running:
            logger.warning("Worker manager is already running")
            return True
        
        try:
            logger.info(f"🚀 Starting worker manager with up to {self.max_workers} workers")
            
            self.is_running = True
            self._shutdown_event.clear()
            
            # Start manager thread
            self._manager_thread = threading.Thread(
                target=self._management_loop,
                name="WorkerManager",
                daemon=True
            )
            self._manager_thread.start()
            
            # Start initial workers
            initial_workers = min(self.config.worker.initial_workers, self.max_workers)
            for i in range(initial_workers):
                self._create_worker()
            
            logger.info(f"✅ Worker manager started with {len(self.workers)} initial workers")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start worker manager: {e}")
            self.is_running = False
            return False
    
    def stop(self, timeout: float = 60.0) -> bool:
        """
        Stop the worker manager and all workers.
        
        Args:
            timeout: Maximum time to wait for shutdown
            
        Returns:
            bool: True if stopped successfully, False otherwise
        """
        if not self.is_running:
            return True
        
        logger.info("🛑 Stopping worker manager...")
        
        try:
            # Signal shutdown
            self.is_running = False
            self._shutdown_event.set()
            
            # Stop all workers
            self._stop_all_workers(timeout * 0.8)
            
            # Wait for manager thread
            if self._manager_thread and self._manager_thread.is_alive():
                self._manager_thread.join(timeout * 0.2)
            
            logger.info("✅ Worker manager stopped")
            return True
            
        except Exception as e:
            logger.error(f"Failed to stop worker manager: {e}")
            return False
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current worker manager status.
        
        Returns:
            Dict[str, Any]: Status information
        """
        worker_infos = [worker.get_info() for worker in self.workers.values()]
        
        running_workers = sum(1 for info in worker_infos if info.status == WorkerStatus.RUNNING)
        error_workers = sum(1 for info in worker_infos if info.status == WorkerStatus.ERROR)
        
        return {
            'is_running': self.is_running,
            'total_workers': len(self.workers),
            'running_workers': running_workers,
            'error_workers': error_workers,
            'max_workers': self.max_workers,
            'uptime_seconds': (datetime.now() - self.start_time).total_seconds(),
            'total_started': self.total_workers_started,
            'total_stopped': self.total_workers_stopped,
            'workers': [
                {
                    'worker_id': info.worker_id,
                    'pid': info.pid,
                    'status': info.status.value,
                    'started_at': info.started_at.isoformat(),
                    'processed_count': info.processed_count,
                    'error_count': info.error_count
                }
                for info in worker_infos
            ]
        }
    
    def scale_workers(self, target_workers: int) -> bool:
        """
        Scale workers to target count.
        
        Args:
            target_workers: Target number of workers
            
        Returns:
            bool: True if scaling completed successfully
        """
        target_workers = max(0, min(target_workers, self.max_workers))
        current_workers = len([w for w in self.workers.values() if w.is_alive()])
        
        logger.info(f"🔄 Scaling from {current_workers} to {target_workers} workers")
        
        if target_workers > current_workers:
            # Scale up
            for _ in range(target_workers - current_workers):
                self._create_worker()
        elif target_workers < current_workers:
            # Scale down
            excess_workers = current_workers - target_workers
            self._remove_workers(excess_workers)
        
        return True
    
    def _create_worker(self) -> Optional[str]:
        """Create and start a new worker."""
        worker_id = f"worker_{int(time.time() * 1000)}_{len(self.workers)}"
        
        try:
            worker = WorkerProcess(
                worker_id=worker_id,
                worker_function=self.worker_function,
                worker_args=(),
                worker_kwargs={'manager': self}
            )
            
            if worker.start():
                self.workers[worker_id] = worker
                self.total_workers_started += 1
                logger.info(f"✅ Created worker {worker_id}")
                return worker_id
            else:
                logger.error(f"❌ Failed to start worker {worker_id}")
                return None
                
        except Exception as e:
            logger.error(f"Failed to create worker {worker_id}: {e}")
            return None
    
    def _remove_workers(self, count: int) -> None:
        """Remove specified number of workers."""
        alive_workers = [(wid, w) for wid, w in self.workers.items() if w.is_alive()]
        
        for i in range(min(count, len(alive_workers))):
            worker_id, worker = alive_workers[i]
            logger.info(f"🗑️  Removing worker {worker_id}")
            
            if worker.stop():
                self.total_workers_stopped += 1
            
            # Remove from workers dict
            self.workers.pop(worker_id, None)
    
    def _stop_all_workers(self, timeout: float) -> None:
        """Stop all workers."""
        if not self.workers:
            return
        
        logger.info(f"Stopping {len(self.workers)} workers...")
        
        # Stop workers in parallel
        import concurrent.futures
        
        with concurrent.futures.ThreadPoolExecutor() as executor:
            # Submit stop tasks
            stop_tasks = {
                executor.submit(worker.stop, timeout / len(self.workers)): worker_id
                for worker_id, worker in self.workers.items()
                if worker.is_alive()
            }
            
            # Wait for completion
            for future in concurrent.futures.as_completed(stop_tasks, timeout=timeout):
                worker_id = stop_tasks[future]
                try:
                    success = future.result()
                    if success:
                        self.total_workers_stopped += 1
                        logger.debug(f"Worker {worker_id} stopped successfully")
                    else:
                        logger.warning(f"Worker {worker_id} did not stop cleanly")
                except Exception as e:
                    logger.error(f"Error stopping worker {worker_id}: {e}")
        
        # Clear workers dict
        self.workers.clear()
    
    def _management_loop(self) -> None:
        """Main management loop for worker monitoring and autoscaling."""
        logger.info("Worker management loop started")
        
        while not self._shutdown_event.is_set():
            try:
                # Perform management tasks only if we're the leader
                if self.config.worker.leader_only_management:
                    if not self.leader_election.is_leader():
                        # Try to acquire leadership
                        if not self.leader_election.acquire_leadership():
                            # Not the leader, wait and continue
                            time.sleep(self.config.worker.management_interval)
                            continue
                
                # Clean up dead workers
                self._cleanup_dead_workers()
                
                # Check if autoscaling is needed
                if self.config.worker.auto_scaling_enabled:
                    self._check_autoscaling()
                
                # Monitor worker health
                self._monitor_workers()
                
            except Exception as e:
                logger.error(f"Error in management loop: {e}")
            
            # Wait before next iteration
            if self._shutdown_event.wait(self.config.worker.management_interval):
                break  # Shutdown event was set
        
        logger.info("Worker management loop stopped")
    
    def _cleanup_dead_workers(self) -> None:
        """Remove dead workers from the pool."""
        dead_workers = []
        
        for worker_id, worker in self.workers.items():
            if not worker.is_alive():
                dead_workers.append(worker_id)
        
        for worker_id in dead_workers:
            logger.warning(f"💀 Cleaning up dead worker {worker_id}")
            worker = self.workers.pop(worker_id)
            worker.stop()  # Ensure cleanup
            self.total_workers_stopped += 1
    
    def _check_autoscaling(self) -> None:
        """Check if autoscaling is needed based on queue depth."""
        try:
            # Get queue depth for decision making
            queue_depth = self._get_total_queue_depth()
            current_workers = len([w for w in self.workers.values() if w.is_alive()])
            
            # Determine target worker count
            target_workers = self._calculate_target_workers(queue_depth, current_workers)
            
            if target_workers != current_workers:
                logger.info(f"📊 Queue depth: {queue_depth}, scaling from {current_workers} to {target_workers} workers")
                self.scale_workers(target_workers)
                
        except Exception as e:
            logger.error(f"Autoscaling check failed: {e}")
    
    def _get_total_queue_depth(self) -> int:
        """Get total queue depth across all streams."""
        total_depth = 0
        
        try:
            for stream_name in self.config.queue.stream_names:
                if hasattr(self.queue, 'get_stream_length'):
                    depth = self.queue.get_stream_length(stream_name)
                    total_depth += depth
                    
        except Exception as e:
            logger.debug(f"Failed to get queue depth: {e}")
        
        return total_depth
    
    def _calculate_target_workers(self, queue_depth: int, current_workers: int) -> int:
        """Calculate target number of workers based on queue depth."""
        # Simple autoscaling logic
        scale_up_threshold = self.config.worker.scale_up_threshold
        scale_down_threshold = self.config.worker.scale_down_threshold
        
        if queue_depth > scale_up_threshold and current_workers < self.max_workers:
            # Scale up
            return min(current_workers + 1, self.max_workers)
        elif queue_depth < scale_down_threshold and current_workers > self.config.worker.min_workers:
            # Scale down
            return max(current_workers - 1, self.config.worker.min_workers)
        
        return current_workers
    
    def _monitor_workers(self) -> None:
        """Monitor worker health and restart unhealthy workers."""
        for worker_id, worker in list(self.workers.items()):
            try:
                # Check worker status
                if worker.status == WorkerStatus.ERROR:
                    logger.warning(f"🔄 Restarting error worker {worker_id}")
                    worker.stop()
                    self.workers.pop(worker_id)
                    self._create_worker()
                    
            except Exception as e:
                logger.error(f"Error monitoring worker {worker_id}: {e}")


def create_worker_manager(worker_function: Callable, max_workers: int = None) -> WorkerManager:
    """
    Factory function to create worker manager instance.
    
    Args:
        worker_function: Function to execute in worker processes
        max_workers: Maximum number of workers
        
    Returns:
        WorkerManager: Configured worker manager instance
    """
    return WorkerManager(worker_function, max_workers)


if __name__ == "__main__":
    # Demo the worker manager functionality
    print("AutoAffiliateHub-X2 Worker Manager Demo")
    print("=" * 38)
    
    import sys
    import json
    
    def demo_worker_function(monitoring_context=None, **kwargs):
        """Demo worker function that simulates work."""
        if monitoring_context:
            logger = monitoring_context['logger']
            worker_id = monitoring_context['worker_id']
            shutdown_event = monitoring_context['shutdown_event']
            status_queue = monitoring_context['status_queue']
            
            logger.info(f"Demo worker {worker_id} starting work")
            
            work_count = 0
            while not shutdown_event.is_set():
                # Simulate work
                time.sleep(2)
                work_count += 1
                
                # Send status update
                try:
                    status_queue.put(('HEARTBEAT', {
                        'processed_count': work_count,
                        'current_task': f'task_{work_count}',
                        'timestamp': datetime.now()
                    }), block=False)
                except:
                    pass  # Queue might be full
                
                logger.info(f"Worker {worker_id} completed task {work_count}")
                
                # Check for shutdown every few iterations
                if work_count % 5 == 0:
                    if shutdown_event.is_set():
                        break
            
            logger.info(f"Demo worker {worker_id} shutting down after {work_count} tasks")
    
    try:
        # Create worker manager
        manager = create_worker_manager(demo_worker_function, max_workers=3)
        
        print(f"Created worker manager with max {manager.max_workers} workers")
        print()
        
        # Start manager
        print("🚀 Starting worker manager...")
        if manager.start():
            print("✅ Worker manager started successfully")
        else:
            print("❌ Failed to start worker manager")
            sys.exit(1)
        
        # Let it run for a bit
        print("\n⏳ Running for 15 seconds...")
        time.sleep(15)
        
        # Show status
        print("\n📊 Current status:")
        status = manager.get_status()
        print(json.dumps(status, indent=2, default=str))
        
        # Test scaling
        print(f"\n🔄 Scaling to 2 workers...")
        manager.scale_workers(2)
        time.sleep(3)
        
        print("\n📊 Status after scaling:")
        status = manager.get_status()
        print(f"Total workers: {status['total_workers']}")
        print(f"Running workers: {status['running_workers']}")
        
        # Stop manager
        print(f"\n🛑 Stopping worker manager...")
        if manager.stop():
            print("✅ Worker manager stopped successfully")
        else:
            print("❌ Failed to stop worker manager cleanly")
        
        print(f"\n🎉 Worker manager demo completed!")
        
    except KeyboardInterrupt:
        print(f"\n⚠️ Demo interrupted")
        if 'manager' in locals():
            manager.stop()
        sys.exit(0)
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)