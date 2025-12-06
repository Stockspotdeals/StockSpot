#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Distributed Lock Module

Provides Redis-based distributed locks with SQLite fallback.
Enables coordination between worker processes across the cluster.
"""

import os
import time
import logging
import threading
import sqlite3
from typing import Optional, ContextManager
from contextlib import contextmanager
from datetime import datetime, timedelta
from uuid import uuid4

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


class DistributedLockError(Exception):
    """Distributed lock specific errors."""
    pass


class RedisDistributedLock:
    """
    Redis-based distributed lock using SET with NX and PX.
    
    Implements a distributed lock with automatic expiration to prevent
    deadlocks and handle node failures gracefully.
    """
    
    def __init__(self, name: str, redis_client: Optional[redis.Redis] = None, 
                 timeout: int = None, node_id: str = None):
        """
        Initialize Redis distributed lock.
        
        Args:
            name: Lock name/identifier
            redis_client: Optional Redis client, will create from config if None
            timeout: Lock timeout in seconds, uses config default if None
            node_id: Unique identifier for lock holder
        """
        self.config = get_cluster_config()
        self.name = name
        self.redis_client = redis_client
        self.timeout = timeout or self.config.distributed_locks.default_timeout
        self.node_id = node_id or f"node_{os.getpid()}_{int(time.time())}"
        self.lock_id = str(uuid4())
        
        self.lock_key = f"{self.config.distributed_locks.redis_key_prefix}:{self.name}"
        self.lock_value = f"{self.node_id}:{self.lock_id}"
        
        self._acquired = False
        self._renewal_thread: Optional[threading.Thread] = None
        self._stop_renewal = threading.Event()
        
        if not REDIS_AVAILABLE:
            raise DistributedLockError("Redis package not available")
        
        self._connect()
    
    def _connect(self) -> None:
        """Establish Redis connection if not provided."""
        if self.redis_client is None:
            try:
                queue = create_redis_queue()
                self.redis_client = queue.redis_client
                logger.debug("Connected to Redis for distributed locks")
            except (RedisQueueError, ConnectionError) as e:
                raise DistributedLockError(f"Failed to connect to Redis: {e}")
    
    def is_connected(self) -> bool:
        """Check if Redis connection is available."""
        try:
            self.redis_client.ping()
            return True
        except (ConnectionError, RedisError):
            return False
    
    def acquire(self, blocking: bool = True, timeout: Optional[float] = None) -> bool:
        """
        Acquire the distributed lock.
        
        Args:
            blocking: If True, block until lock is acquired or timeout
            timeout: Maximum time to wait for lock (None = wait forever)
            
        Returns:
            bool: True if lock acquired, False otherwise
        """
        if self._acquired:
            logger.warning(f"Lock {self.name} already acquired by this instance")
            return True
        
        if not self.is_connected():
            logger.warning("Redis not connected, cannot acquire lock")
            return False
        
        start_time = time.time()
        ttl_ms = self.timeout * 1000
        
        while True:
            try:
                # Use SET with NX (only if not exists) and PX (TTL in milliseconds)
                result = self.redis_client.set(
                    self.lock_key,
                    self.lock_value,
                    nx=True,
                    px=ttl_ms
                )
                
                if result:
                    self._acquired = True
                    logger.debug(f"🔒 Acquired lock '{self.name}' with ID {self.lock_id}")
                    
                    if self.config.distributed_locks.auto_renewal:
                        self._start_renewal_thread()
                    
                    return True
                
                if not blocking:
                    return False
                
                # Check timeout
                if timeout is not None:
                    elapsed = time.time() - start_time
                    if elapsed >= timeout:
                        logger.debug(f"Timeout waiting for lock '{self.name}'")
                        return False
                
                # Wait before retrying
                time.sleep(self.config.distributed_locks.retry_interval)
                
            except RedisError as e:
                logger.error(f"Failed to acquire lock '{self.name}': {e}")
                if not blocking:
                    return False
                
                # Wait before retrying on error
                time.sleep(1.0)
    
    def release(self) -> bool:
        """
        Release the distributed lock.
        
        Returns:
            bool: True if lock was released, False otherwise
        """
        if not self._acquired:
            return True
        
        # Stop renewal thread
        self._stop_renewal.set()
        if self._renewal_thread and self._renewal_thread.is_alive():
            self._renewal_thread.join(timeout=2.0)
        
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
                result = self.redis_client.eval(lua_script, 1, self.lock_key, self.lock_value)
                
                if result:
                    logger.debug(f"🔓 Released lock '{self.name}' with ID {self.lock_id}")
                else:
                    logger.warning(f"Could not release lock '{self.name}' - not current holder")
            
            self._acquired = False
            return True
            
        except RedisError as e:
            logger.error(f"Failed to release lock '{self.name}': {e}")
            self._acquired = False  # Assume released on error
            return False
    
    def extend(self, additional_time: int = None) -> bool:
        """
        Extend lock TTL.
        
        Args:
            additional_time: Additional seconds to extend (uses timeout if None)
            
        Returns:
            bool: True if extension successful, False otherwise
        """
        if not self._acquired or not self.is_connected():
            return False
        
        extend_ms = (additional_time or self.timeout) * 1000
        
        try:
            # Use Lua script for atomic check-and-extend
            lua_script = '''
            if redis.call("get", KEYS[1]) == ARGV[1] then
                return redis.call("pexpire", KEYS[1], ARGV[2])
            else
                return 0
            end
            '''
            result = self.redis_client.eval(
                lua_script, 1, self.lock_key, self.lock_value, extend_ms
            )
            
            if result:
                logger.debug(f"Extended lock '{self.name}' by {extend_ms/1000}s")
                return True
            else:
                logger.warning(f"Failed to extend lock '{self.name}' - not current holder")
                self._acquired = False
                return False
                
        except RedisError as e:
            logger.error(f"Failed to extend lock '{self.name}': {e}")
            return False
    
    def is_acquired(self) -> bool:
        """
        Check if lock is currently held by this instance.
        
        Returns:
            bool: True if lock is held by this instance
        """
        return self._acquired
    
    def get_holder(self) -> Optional[str]:
        """
        Get the current lock holder.
        
        Returns:
            Optional[str]: Current lock holder value, None if no holder
        """
        if not self.is_connected():
            return None
        
        try:
            holder = self.redis_client.get(self.lock_key)
            return holder.decode() if isinstance(holder, bytes) else holder
        except RedisError as e:
            logger.warning(f"Failed to get lock holder for '{self.name}': {e}")
            return None
    
    def _start_renewal_thread(self) -> None:
        """Start background thread for lock renewal."""
        if not self.config.distributed_locks.auto_renewal:
            return
        
        self._stop_renewal.clear()
        self._renewal_thread = threading.Thread(
            target=self._renewal_worker,
            name=f"LockRenewal-{self.name}-{self.lock_id}",
            daemon=True
        )
        self._renewal_thread.start()
    
    def _renewal_worker(self) -> None:
        """Background worker to renew lock."""
        renewal_interval = self.config.distributed_locks.renewal_interval
        logger.debug(f"Started lock renewal thread for '{self.name}'")
        
        while not self._stop_renewal.is_set():
            if self._stop_renewal.wait(renewal_interval):
                break  # Stop event was set
            
            if not self.extend():
                logger.warning(f"Lock renewal failed for '{self.name}', releasing")
                self._acquired = False
                break
        
        logger.debug(f"Lock renewal thread stopped for '{self.name}'")
    
    def __enter__(self):
        """Context manager entry."""
        if not self.acquire():
            raise DistributedLockError(f"Failed to acquire lock '{self.name}'")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.release()


class SQLiteDistributedLock:
    """
    SQLite-based distributed lock for same-machine coordination.
    
    Fallback mechanism when Redis is not available. Uses SQLite database
    to coordinate between processes on the same machine.
    """
    
    def __init__(self, name: str, db_path: str = None, timeout: int = None, 
                 node_id: str = None):
        """
        Initialize SQLite distributed lock.
        
        Args:
            name: Lock name/identifier
            db_path: Path to SQLite database, uses config default if None
            timeout: Lock timeout in seconds, uses config default if None
            node_id: Unique identifier for lock holder
        """
        self.config = get_cluster_config()
        self.name = name
        self.db_path = db_path or self.config.distributed_locks.sqlite_db_path
        self.timeout = timeout or self.config.distributed_locks.default_timeout
        self.node_id = node_id or f"node_{os.getpid()}_{int(time.time())}"
        self.lock_id = str(uuid4())
        
        self.lock_value = f"{self.node_id}:{self.lock_id}"
        self._acquired = False
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        self._init_database()
    
    def _init_database(self) -> None:
        """Initialize SQLite database and locks table."""
        try:
            with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS distributed_locks (
                        name TEXT PRIMARY KEY,
                        holder TEXT NOT NULL,
                        acquired_at TIMESTAMP NOT NULL,
                        expires_at TIMESTAMP NOT NULL
                    )
                ''')
                conn.execute('CREATE INDEX IF NOT EXISTS idx_locks_expires ON distributed_locks(expires_at)')
                conn.commit()
                
                # Clean up expired locks
                self._cleanup_expired_locks(conn)
                
        except sqlite3.Error as e:
            logger.error(f"Failed to initialize lock database: {e}")
            raise DistributedLockError(f"Failed to initialize lock database: {e}")
    
    def _cleanup_expired_locks(self, conn: sqlite3.Connection) -> None:
        """Remove expired locks from database."""
        try:
            now = datetime.now()
            cursor = conn.execute('DELETE FROM distributed_locks WHERE expires_at < ?', (now,))
            if cursor.rowcount > 0:
                logger.debug(f"Cleaned up {cursor.rowcount} expired locks")
                conn.commit()
        except sqlite3.Error as e:
            logger.warning(f"Failed to clean up expired locks: {e}")
    
    def acquire(self, blocking: bool = True, timeout: Optional[float] = None) -> bool:
        """
        Acquire the distributed lock.
        
        Args:
            blocking: If True, block until lock is acquired or timeout
            timeout: Maximum time to wait for lock (None = wait forever)
            
        Returns:
            bool: True if lock acquired, False otherwise
        """
        if self._acquired:
            logger.warning(f"Lock {self.name} already acquired by this instance")
            return True
        
        start_time = time.time()
        
        while True:
            try:
                with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                    # Clean up expired locks first
                    self._cleanup_expired_locks(conn)
                    
                    now = datetime.now()
                    expires_at = now + timedelta(seconds=self.timeout)
                    
                    try:
                        # Try to insert new lock (will fail if name already exists)
                        conn.execute('''
                            INSERT INTO distributed_locks (name, holder, acquired_at, expires_at)
                            VALUES (?, ?, ?, ?)
                        ''', (self.name, self.lock_value, now, expires_at))
                        conn.commit()
                        
                        self._acquired = True
                        logger.debug(f"🔒 Acquired SQLite lock '{self.name}' with ID {self.lock_id}")
                        return True
                        
                    except sqlite3.IntegrityError:
                        # Lock already exists, check if expired
                        cursor = conn.execute(
                            'SELECT holder, expires_at FROM distributed_locks WHERE name = ?',
                            (self.name,)
                        )
                        row = cursor.fetchone()
                        
                        if row:
                            holder, expires_at_str = row
                            expires_at = datetime.fromisoformat(expires_at_str)
                            
                            if expires_at < now:
                                # Lock expired, try to acquire it
                                conn.execute('''
                                    UPDATE distributed_locks 
                                    SET holder = ?, acquired_at = ?, expires_at = ?
                                    WHERE name = ? AND expires_at < ?
                                ''', (self.lock_value, now, expires_at, self.name, now))
                                
                                if conn.total_changes > 0:
                                    conn.commit()
                                    self._acquired = True
                                    logger.debug(f"🔒 Acquired expired SQLite lock '{self.name}'")
                                    return True
                
                if not blocking:
                    return False
                
                # Check timeout
                if timeout is not None:
                    elapsed = time.time() - start_time
                    if elapsed >= timeout:
                        logger.debug(f"Timeout waiting for SQLite lock '{self.name}'")
                        return False
                
                # Wait before retrying
                time.sleep(self.config.distributed_locks.retry_interval)
                
            except sqlite3.Error as e:
                logger.error(f"Failed to acquire SQLite lock '{self.name}': {e}")
                if not blocking:
                    return False
                
                # Wait before retrying on error
                time.sleep(1.0)
    
    def release(self) -> bool:
        """
        Release the distributed lock.
        
        Returns:
            bool: True if lock was released, False otherwise
        """
        if not self._acquired:
            return True
        
        try:
            with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                cursor = conn.execute(
                    'DELETE FROM distributed_locks WHERE name = ? AND holder = ?',
                    (self.name, self.lock_value)
                )
                
                if cursor.rowcount > 0:
                    conn.commit()
                    logger.debug(f"🔓 Released SQLite lock '{self.name}' with ID {self.lock_id}")
                else:
                    logger.warning(f"Could not release SQLite lock '{self.name}' - not current holder")
            
            self._acquired = False
            return True
            
        except sqlite3.Error as e:
            logger.error(f"Failed to release SQLite lock '{self.name}': {e}")
            self._acquired = False  # Assume released on error
            return False
    
    def extend(self, additional_time: int = None) -> bool:
        """
        Extend lock TTL.
        
        Args:
            additional_time: Additional seconds to extend (uses timeout if None)
            
        Returns:
            bool: True if extension successful, False otherwise
        """
        if not self._acquired:
            return False
        
        extend_seconds = additional_time or self.timeout
        
        try:
            with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                now = datetime.now()
                new_expires_at = now + timedelta(seconds=extend_seconds)
                
                cursor = conn.execute('''
                    UPDATE distributed_locks 
                    SET expires_at = ? 
                    WHERE name = ? AND holder = ?
                ''', (new_expires_at, self.name, self.lock_value))
                
                if cursor.rowcount > 0:
                    conn.commit()
                    logger.debug(f"Extended SQLite lock '{self.name}' by {extend_seconds}s")
                    return True
                else:
                    logger.warning(f"Failed to extend SQLite lock '{self.name}' - not current holder")
                    self._acquired = False
                    return False
                    
        except sqlite3.Error as e:
            logger.error(f"Failed to extend SQLite lock '{self.name}': {e}")
            return False
    
    def is_acquired(self) -> bool:
        """Check if lock is currently held by this instance."""
        return self._acquired
    
    def get_holder(self) -> Optional[str]:
        """
        Get the current lock holder.
        
        Returns:
            Optional[str]: Current lock holder value, None if no holder
        """
        try:
            with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                cursor = conn.execute(
                    'SELECT holder FROM distributed_locks WHERE name = ? AND expires_at > ?',
                    (self.name, datetime.now())
                )
                row = cursor.fetchone()
                return row[0] if row else None
                
        except sqlite3.Error as e:
            logger.warning(f"Failed to get SQLite lock holder for '{self.name}': {e}")
            return None
    
    def __enter__(self):
        """Context manager entry."""
        if not self.acquire():
            raise DistributedLockError(f"Failed to acquire SQLite lock '{self.name}'")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.release()


class DistributedLock:
    """
    Unified distributed lock that tries Redis first, falls back to SQLite.
    """
    
    def __init__(self, name: str, timeout: int = None, node_id: str = None):
        """
        Initialize distributed lock with Redis and SQLite fallback.
        
        Args:
            name: Lock name/identifier
            timeout: Lock timeout in seconds
            node_id: Unique identifier for lock holder
        """
        self.config = get_cluster_config()
        self.name = name
        self.timeout = timeout or self.config.distributed_locks.default_timeout
        self.node_id = node_id or f"node_{os.getpid()}_{int(time.time())}"
        
        self.redis_lock: Optional[RedisDistributedLock] = None
        self.sqlite_lock: Optional[SQLiteDistributedLock] = None
        self.use_redis = not self.config.force_sqlite
        
        self._initialize()
    
    def _initialize(self) -> None:
        """Initialize the appropriate lock mechanism."""
        if self.use_redis and REDIS_AVAILABLE:
            try:
                self.redis_lock = RedisDistributedLock(
                    self.name, timeout=self.timeout, node_id=self.node_id
                )
                logger.debug(f"Initialized Redis distributed lock '{self.name}'")
                return
            except DistributedLockError as e:
                logger.warning(f"Redis distributed lock failed, falling back to SQLite: {e}")
        
        # Fall back to SQLite-based lock
        self.sqlite_lock = SQLiteDistributedLock(
            self.name, timeout=self.timeout, node_id=self.node_id
        )
        logger.debug(f"Initialized SQLite distributed lock '{self.name}'")
    
    def acquire(self, blocking: bool = True, timeout: Optional[float] = None) -> bool:
        """Attempt to acquire the lock."""
        if self.redis_lock:
            return self.redis_lock.acquire(blocking, timeout)
        elif self.sqlite_lock:
            return self.sqlite_lock.acquire(blocking, timeout)
        else:
            logger.error("No lock mechanism available")
            return False
    
    def release(self) -> bool:
        """Release the lock if currently held."""
        if self.redis_lock:
            return self.redis_lock.release()
        elif self.sqlite_lock:
            return self.sqlite_lock.release()
        else:
            return True
    
    def extend(self, additional_time: int = None) -> bool:
        """Extend lock TTL."""
        if self.redis_lock:
            return self.redis_lock.extend(additional_time)
        elif self.sqlite_lock:
            return self.sqlite_lock.extend(additional_time)
        else:
            return False
    
    def is_acquired(self) -> bool:
        """Check if lock is currently held by this instance."""
        if self.redis_lock:
            return self.redis_lock.is_acquired()
        elif self.sqlite_lock:
            return self.sqlite_lock.is_acquired()
        else:
            return False
    
    def get_holder(self) -> Optional[str]:
        """Get the current lock holder."""
        if self.redis_lock:
            return self.redis_lock.get_holder()
        elif self.sqlite_lock:
            return self.sqlite_lock.get_holder()
        else:
            return None
    
    def __enter__(self):
        """Context manager entry."""
        if not self.acquire():
            raise DistributedLockError(f"Failed to acquire lock '{self.name}'")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.release()


def create_distributed_lock(name: str, timeout: int = None, node_id: str = None) -> DistributedLock:
    """
    Factory function to create distributed lock instance.
    
    Args:
        name: Lock name/identifier
        timeout: Lock timeout in seconds
        node_id: Optional node identifier
        
    Returns:
        DistributedLock: Configured lock instance
    """
    return DistributedLock(name, timeout, node_id)


@contextmanager
def distributed_lock(name: str, timeout: int = None, blocking: bool = True, 
                    acquire_timeout: Optional[float] = None) -> ContextManager[bool]:
    """
    Context manager for distributed locking.
    
    Args:
        name: Lock name/identifier
        timeout: Lock timeout in seconds
        blocking: Whether to block waiting for lock
        acquire_timeout: Maximum time to wait for lock acquisition
        
    Yields:
        bool: True if lock acquired, False otherwise
    """
    lock = create_distributed_lock(name, timeout)
    acquired = lock.acquire(blocking, acquire_timeout)
    
    try:
        yield acquired
    finally:
        if acquired:
            lock.release()


if __name__ == "__main__":
    # Demo the distributed lock functionality
    print("AutoAffiliateHub-X2 Distributed Lock Demo")
    print("=" * 42)
    
    import sys
    
    node_id = f"demo_node_{os.getpid()}"
    lock_name = "demo_lock"
    
    try:
        lock = create_distributed_lock(lock_name, timeout=30, node_id=node_id)
        
        print(f"Node ID: {node_id}")
        print(f"Lock Name: {lock_name}")
        print(f"Using: {'Redis' if lock.redis_lock else 'SQLite'} lock")
        print()
        
        # Check current holder
        current_holder = lock.get_holder()
        if current_holder:
            print(f"Current holder: {current_holder}")
        else:
            print("No current holder")
        
        # Try to acquire lock
        print(f"\n🔒 Attempting to acquire lock...")
        
        with distributed_lock(lock_name, timeout=30, acquire_timeout=5.0) as acquired:
            if acquired:
                print(f"✅ Successfully acquired lock!")
                print(f"Current holder: {lock.get_holder()}")
                
                # Hold lock for a few seconds
                print("Holding lock for 3 seconds...")
                time.sleep(3)
                
                # Extend lock
                print("Extending lock by 10 seconds...")
                if lock.extend(10):
                    print("✅ Lock extended successfully")
                else:
                    print("❌ Failed to extend lock")
                
            else:
                print(f"❌ Failed to acquire lock within timeout")
                current_holder = lock.get_holder()
                if current_holder:
                    print(f"Current holder is: {current_holder}")
        
        print(f"\n🔓 Lock context exited")
        print(f"Current holder: {lock.get_holder()}")
        
        print(f"\n🎉 Distributed lock demo completed!")
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)