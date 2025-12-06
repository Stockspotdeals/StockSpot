#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Leader Election Module

Provides Redis-based leader election with SQLite file lock fallback.
Ensures only one scheduler instance is active across the cluster.
"""

import os
import time
import logging
import threading
import fcntl
from typing import Optional, ContextManager
from contextlib import contextmanager
from datetime import datetime, timedelta

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

logger = logging.getLogger(__name__)


class LeaderElectionError(Exception):
    """Leader election specific errors."""
    pass


class RedisLeaderElection:
    """
    Redis-based leader election using TTL keys.
    
    Uses Redis SET with NX (if not exists) and PX (TTL) options to implement
    a simple but effective leader election mechanism.
    """
    
    def __init__(self, redis_client: Optional[redis.Redis] = None, node_id: str = None):
        """
        Initialize Redis leader election.
        
        Args:
            redis_client: Optional Redis client, will create from config if None
            node_id: Unique identifier for this node, auto-generated if None
        """
        self.config = get_cluster_config()
        self.redis_client = redis_client
        self.node_id = node_id or f"node_{os.getpid()}_{int(time.time())}"
        self.election_key = self.config.leader.election_key
        self.ttl_ms = self.config.leader.ttl_seconds * 1000
        self.renewal_interval = self.config.leader.renewal_interval
        
        self._is_leader = False
        self._leader_thread: Optional[threading.Thread] = None
        self._stop_renewal = threading.Event()
        
        if not REDIS_AVAILABLE:
            raise LeaderElectionError("Redis package not available")
        
        self._connect()
    
    def _connect(self) -> None:
        """Establish Redis connection if not provided."""
        if self.redis_client is None:
            try:
                queue = create_redis_queue()
                self.redis_client = queue.redis_client
                logger.debug("Connected to Redis for leader election")
            except (RedisQueueError, ConnectionError) as e:
                raise LeaderElectionError(f"Failed to connect to Redis: {e}")
    
    def is_connected(self) -> bool:
        """Check if Redis connection is available."""
        try:
            self.redis_client.ping()
            return True
        except (ConnectionError, RedisError):
            return False
    
    def acquire_leadership(self) -> bool:
        """
        Attempt to acquire leadership.
        
        Returns:
            bool: True if leadership acquired, False otherwise
        """
        if not self.is_connected():
            logger.warning("Redis not connected, cannot acquire leadership")
            return False
        
        try:
            # Use SET with NX (only if not exists) and PX (TTL in milliseconds)
            result = self.redis_client.set(
                self.election_key,
                self.node_id,
                nx=True,
                px=self.ttl_ms
            )
            
            if result:
                self._is_leader = True
                logger.info(f"🎖️  Leadership acquired by {self.node_id}")
                self._start_renewal_thread()
                return True
            else:
                # Check who is the current leader
                current_leader = self.redis_client.get(self.election_key)
                if current_leader:
                    current_leader = current_leader.decode() if isinstance(current_leader, bytes) else current_leader
                    logger.debug(f"Leadership held by {current_leader}")
                return False
                
        except RedisError as e:
            logger.error(f"Failed to acquire leadership: {e}")
            return False
    
    def release_leadership(self) -> bool:
        """
        Release leadership if currently held.
        
        Returns:
            bool: True if leadership was released, False otherwise
        """
        if not self._is_leader:
            return True
        
        self._stop_renewal.set()
        
        if self._leader_thread and self._leader_thread.is_alive():
            self._leader_thread.join(timeout=5.0)
        
        try:
            if self.is_connected():
                # Use Lua script for atomic check-and-delete
                lua_script = '''
                if redis.call("get", KEYS[1]) == ARGV[1] then
                    return redis.call("del", KEYS[1])
                else
                    return 0
                end
                '''
                result = self.redis_client.eval(lua_script, 1, self.election_key, self.node_id)
                
                if result:
                    logger.info(f"🎖️  Leadership released by {self.node_id}")
                else:
                    logger.warning(f"Could not release leadership - not current leader")
            
            self._is_leader = False
            return True
            
        except RedisError as e:
            logger.error(f"Failed to release leadership: {e}")
            self._is_leader = False  # Assume released on error
            return False
    
    def renew_leadership(self) -> bool:
        """
        Renew leadership TTL.
        
        Returns:
            bool: True if renewal successful, False otherwise
        """
        if not self._is_leader or not self.is_connected():
            return False
        
        try:
            # Use Lua script for atomic check-and-renew
            lua_script = '''
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("pexpire", KEYS[1], ARGV[2])
            else
                return 0
            end
            '''
            result = self.redis_client.eval(
                lua_script, 1, self.election_key, self.node_id, self.ttl_ms
            )
            
            if result:
                logger.debug(f"Leadership renewed by {self.node_id}")
                return True
            else:
                logger.warning(f"Failed to renew leadership - no longer leader")
                self._is_leader = False
                return False
                
        except RedisError as e:
            logger.error(f"Failed to renew leadership: {e}")
            self._is_leader = False
            return False
    
    def is_leader(self) -> bool:
        """
        Check if this node is currently the leader.
        
        Returns:
            bool: True if this node is the leader
        """
        return self._is_leader
    
    def get_current_leader(self) -> Optional[str]:
        """
        Get the current leader node ID.
        
        Returns:
            Optional[str]: Current leader node ID, None if no leader
        """
        if not self.is_connected():
            return None
        
        try:
            leader = self.redis_client.get(self.election_key)
            return leader.decode() if isinstance(leader, bytes) else leader
        except RedisError as e:
            logger.warning(f"Failed to get current leader: {e}")
            return None
    
    def _start_renewal_thread(self) -> None:
        """Start background thread for leadership renewal."""
        self._stop_renewal.clear()
        self._leader_thread = threading.Thread(
            target=self._renewal_worker,
            name=f"LeaderRenewal-{self.node_id}",
            daemon=True
        )
        self._leader_thread.start()
    
    def _renewal_worker(self) -> None:
        """Background worker to renew leadership."""
        logger.debug(f"Started leadership renewal thread for {self.node_id}")
        
        while not self._stop_renewal.is_set():
            if self._stop_renewal.wait(self.renewal_interval):
                break  # Stop event was set
            
            if not self.renew_leadership():
                logger.warning(f"Leadership renewal failed, stepping down")
                self._is_leader = False
                break
        
        logger.debug(f"Leadership renewal thread stopped for {self.node_id}")
    
    @contextmanager
    def leadership(self) -> ContextManager[bool]:
        """
        Context manager for leadership acquisition.
        
        Yields:
            bool: True if leadership acquired, False otherwise
        """
        acquired = self.acquire_leadership()
        try:
            yield acquired
        finally:
            if acquired:
                self.release_leadership()


class FileLeaderElection:
    """
    File-based leader election using advisory locks.
    
    Fallback mechanism when Redis is not available. Uses file locking
    to coordinate between processes on the same machine.
    """
    
    def __init__(self, lock_file: str = None, node_id: str = None):
        """
        Initialize file-based leader election.
        
        Args:
            lock_file: Path to lock file, uses config default if None
            node_id: Unique identifier for this node
        """
        self.config = get_cluster_config()
        self.lock_file = lock_file or self.config.leader.fallback_lock_file
        self.node_id = node_id or f"node_{os.getpid()}_{int(time.time())}"
        
        self._lock_fd: Optional[int] = None
        self._is_leader = False
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(self.lock_file), exist_ok=True)
    
    def acquire_leadership(self) -> bool:
        """
        Attempt to acquire leadership using file lock.
        
        Returns:
            bool: True if leadership acquired, False otherwise
        """
        try:
            # Open lock file
            self._lock_fd = os.open(self.lock_file, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600)
            
            # Try to acquire exclusive lock (non-blocking)
            fcntl.flock(self._lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            
            # Write node ID to file
            os.write(self._lock_fd, self.node_id.encode())
            os.fsync(self._lock_fd)
            
            self._is_leader = True
            logger.info(f"🎖️  File-based leadership acquired by {self.node_id}")
            return True
            
        except (OSError, IOError) as e:
            if self._lock_fd is not None:
                try:
                    os.close(self._lock_fd)
                except:
                    pass
                self._lock_fd = None
            
            logger.debug(f"Failed to acquire file lock: {e}")
            return False
    
    def release_leadership(self) -> bool:
        """
        Release file-based leadership.
        
        Returns:
            bool: True if leadership was released
        """
        if not self._is_leader or self._lock_fd is None:
            return True
        
        try:
            # Release the lock and close file
            fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
            os.close(self._lock_fd)
            
            # Try to remove lock file
            try:
                os.unlink(self.lock_file)
            except FileNotFoundError:
                pass
            
            self._lock_fd = None
            self._is_leader = False
            
            logger.info(f"🎖️  File-based leadership released by {self.node_id}")
            return True
            
        except (OSError, IOError) as e:
            logger.error(f"Failed to release file lock: {e}")
            return False
    
    def is_leader(self) -> bool:
        """
        Check if this node is currently the leader.
        
        Returns:
            bool: True if this node is the leader
        """
        return self._is_leader
    
    def get_current_leader(self) -> Optional[str]:
        """
        Get the current leader node ID from lock file.
        
        Returns:
            Optional[str]: Current leader node ID, None if no leader
        """
        try:
            if os.path.exists(self.lock_file):
                with open(self.lock_file, 'r') as f:
                    return f.read().strip()
        except (OSError, IOError):
            pass
        
        return None
    
    @contextmanager
    def leadership(self) -> ContextManager[bool]:
        """
        Context manager for leadership acquisition.
        
        Yields:
            bool: True if leadership acquired, False otherwise
        """
        acquired = self.acquire_leadership()
        try:
            yield acquired
        finally:
            if acquired:
                self.release_leadership()


class LeaderElection:
    """
    Unified leader election that tries Redis first, falls back to file locking.
    """
    
    def __init__(self, node_id: str = None):
        """
        Initialize leader election with Redis and file fallback.
        
        Args:
            node_id: Unique identifier for this node
        """
        self.config = get_cluster_config()
        self.node_id = node_id or f"node_{os.getpid()}_{int(time.time())}"
        
        self.redis_election: Optional[RedisLeaderElection] = None
        self.file_election: Optional[FileLeaderElection] = None
        self.use_redis = not self.config.force_sqlite
        
        self._initialize()
    
    def _initialize(self) -> None:
        """Initialize the appropriate election mechanism."""
        if self.use_redis and REDIS_AVAILABLE:
            try:
                self.redis_election = RedisLeaderElection(node_id=self.node_id)
                logger.info(f"Initialized Redis leader election for {self.node_id}")
                return
            except LeaderElectionError as e:
                logger.warning(f"Redis leader election failed, falling back to file: {e}")
        
        # Fall back to file-based election
        self.file_election = FileLeaderElection(node_id=self.node_id)
        logger.info(f"Initialized file-based leader election for {self.node_id}")
    
    def acquire_leadership(self) -> bool:
        """Attempt to acquire leadership."""
        if self.redis_election:
            return self.redis_election.acquire_leadership()
        elif self.file_election:
            return self.file_election.acquire_leadership()
        else:
            logger.error("No election mechanism available")
            return False
    
    def release_leadership(self) -> bool:
        """Release leadership if currently held."""
        if self.redis_election:
            return self.redis_election.release_leadership()
        elif self.file_election:
            return self.file_election.release_leadership()
        else:
            return True
    
    def is_leader(self) -> bool:
        """Check if this node is currently the leader."""
        if self.redis_election:
            return self.redis_election.is_leader()
        elif self.file_election:
            return self.file_election.is_leader()
        else:
            return False
    
    def get_current_leader(self) -> Optional[str]:
        """Get the current leader node ID."""
        if self.redis_election:
            return self.redis_election.get_current_leader()
        elif self.file_election:
            return self.file_election.get_current_leader()
        else:
            return None
    
    @contextmanager
    def leadership(self) -> ContextManager[bool]:
        """Context manager for leadership acquisition."""
        acquired = self.acquire_leadership()
        try:
            yield acquired
        finally:
            if acquired:
                self.release_leadership()


def create_leader_election(node_id: str = None) -> LeaderElection:
    """
    Factory function to create leader election instance.
    
    Args:
        node_id: Optional node identifier
        
    Returns:
        LeaderElection: Configured election instance
    """
    return LeaderElection(node_id)


if __name__ == "__main__":
    # Demo the leader election functionality
    print("AutoAffiliateHub-X2 Leader Election Demo")
    print("=" * 40)
    
    import sys
    
    node_id = f"demo_node_{os.getpid()}"
    
    try:
        election = create_leader_election(node_id)
        
        print(f"Node ID: {node_id}")
        print(f"Using: {'Redis' if election.redis_election else 'File'} election")
        print()
        
        # Check current leader
        current_leader = election.get_current_leader()
        if current_leader:
            print(f"Current leader: {current_leader}")
        else:
            print("No current leader")
        
        # Try to acquire leadership
        print(f"\n🗳️  Attempting to acquire leadership...")
        
        with election.leadership() as is_leader:
            if is_leader:
                print(f"✅ Successfully acquired leadership!")
                print(f"Current leader: {election.get_current_leader()}")
                
                # Hold leadership for a few seconds
                print("Holding leadership for 5 seconds...")
                time.sleep(5)
                
            else:
                print(f"❌ Failed to acquire leadership")
                current_leader = election.get_current_leader()
                if current_leader:
                    print(f"Current leader is: {current_leader}")
        
        print(f"\n🎖️  Leadership context exited")
        print(f"Current leader: {election.get_current_leader()}")
        
        print(f"\n🎉 Leader election demo completed!")
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)