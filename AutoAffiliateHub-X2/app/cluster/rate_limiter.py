#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Rate Limiter Module

Provides distributed rate limiting using token bucket algorithm.
Shares rate limits across all worker instances in the cluster.
"""

import time
import logging
import threading
import sqlite3
from typing import Optional, Dict, List, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
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

logger = logging.getLogger(__name__)


class RateLimitResult(Enum):
    """Rate limit check results."""
    ALLOWED = "allowed"
    DENIED = "denied"
    ERROR = "error"


@dataclass
class RateLimitInfo:
    """Rate limit information."""
    key: str
    allowed: bool
    tokens_remaining: int
    reset_time: float
    retry_after: Optional[float] = None


class RateLimitError(Exception):
    """Rate limiter specific errors."""
    pass


class RedisRateLimiter:
    """
    Redis-based distributed rate limiter using token bucket algorithm.
    
    Implements rate limiting that works across multiple worker instances
    by storing token bucket state in Redis.
    """
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        """
        Initialize Redis rate limiter.
        
        Args:
            redis_client: Optional Redis client, will create from config if None
        """
        self.config = get_cluster_config()
        self.redis_client = redis_client
        
        if not REDIS_AVAILABLE:
            raise RateLimitError("Redis package not available")
        
        self._connect()
        self._load_lua_scripts()
    
    def _connect(self) -> None:
        """Establish Redis connection if not provided."""
        if self.redis_client is None:
            try:
                queue = create_redis_queue()
                self.redis_client = queue.redis_client
                logger.debug("Connected to Redis for rate limiting")
            except (RedisQueueError, ConnectionError) as e:
                raise RateLimitError(f"Failed to connect to Redis: {e}")
    
    def is_connected(self) -> bool:
        """Check if Redis connection is available."""
        try:
            self.redis_client.ping()
            return True
        except (ConnectionError, RedisError):
            return False
    
    def _load_lua_scripts(self) -> None:
        """Load Lua scripts for atomic operations."""
        # Token bucket rate limiting script
        self.token_bucket_script = self.redis_client.register_script('''
            local key = KEYS[1]
            local capacity = tonumber(ARGV[1])
            local tokens = tonumber(ARGV[2])
            local window = tonumber(ARGV[3])
            local requested = tonumber(ARGV[4])
            local now = tonumber(ARGV[5])
            
            -- Get current bucket state
            local bucket = redis.call("hmget", key, "tokens", "last_refill")
            local current_tokens = tonumber(bucket[1]) or capacity
            local last_refill = tonumber(bucket[2]) or now
            
            -- Calculate tokens to add based on elapsed time
            local elapsed = math.max(0, now - last_refill)
            local tokens_to_add = math.floor(elapsed / window * tokens)
            current_tokens = math.min(capacity, current_tokens + tokens_to_add)
            
            -- Check if request can be satisfied
            local allowed = current_tokens >= requested
            local remaining_tokens = current_tokens
            
            if allowed then
                remaining_tokens = current_tokens - requested
            end
            
            -- Update bucket state
            redis.call("hmset", key, 
                "tokens", remaining_tokens, 
                "last_refill", now,
                "capacity", capacity,
                "refill_rate", tokens,
                "window", window
            )
            
            -- Set expiration (cleanup old buckets)
            redis.call("expire", key, window * 2)
            
            -- Calculate next reset time
            local time_to_full = 0
            if remaining_tokens < capacity then
                time_to_full = (capacity - remaining_tokens) / tokens * window
            end
            
            return {
                allowed and 1 or 0,
                remaining_tokens,
                now + time_to_full,
                allowed and 0 or (window / tokens)
            }
        ''')
    
    def check_rate_limit(self, key: str, limit: int, window: int, 
                        cost: int = 1) -> RateLimitInfo:
        """
        Check rate limit for a key.
        
        Args:
            key: Rate limit key (e.g., "platform:twitter", "user:123")
            limit: Maximum tokens in bucket
            window: Time window in seconds for token refill
            cost: Number of tokens to consume (default: 1)
            
        Returns:
            RateLimitInfo: Rate limit check result
        """
        if not self.is_connected():
            logger.warning("Redis not connected, rate limit check failed")
            return RateLimitInfo(
                key=key,
                allowed=False,
                tokens_remaining=0,
                reset_time=time.time() + window,
                retry_after=window
            )
        
        try:
            redis_key = f"{self.config.rate_limiting.redis_key_prefix}:{key}"
            now = time.time()
            
            # Calculate tokens per window (for refill rate)
            tokens_per_window = limit
            
            # Execute Lua script
            result = self.token_bucket_script(
                keys=[redis_key],
                args=[limit, tokens_per_window, window, cost, now]
            )
            
            allowed, tokens_remaining, reset_time, retry_after = result
            
            return RateLimitInfo(
                key=key,
                allowed=bool(allowed),
                tokens_remaining=int(tokens_remaining),
                reset_time=float(reset_time),
                retry_after=float(retry_after) if not allowed else None
            )
            
        except RedisError as e:
            logger.error(f"Rate limit check failed for '{key}': {e}")
            return RateLimitInfo(
                key=key,
                allowed=False,
                tokens_remaining=0,
                reset_time=time.time() + window,
                retry_after=window
            )
    
    def reset_rate_limit(self, key: str) -> bool:
        """
        Reset rate limit for a key.
        
        Args:
            key: Rate limit key to reset
            
        Returns:
            bool: True if reset successful, False otherwise
        """
        if not self.is_connected():
            return False
        
        try:
            redis_key = f"{self.config.rate_limiting.redis_key_prefix}:{key}"
            result = self.redis_client.delete(redis_key)
            logger.debug(f"Reset rate limit for '{key}'")
            return bool(result)
            
        except RedisError as e:
            logger.error(f"Failed to reset rate limit for '{key}': {e}")
            return False
    
    def get_rate_limit_status(self, key: str) -> Optional[Dict]:
        """
        Get current rate limit status for a key.
        
        Args:
            key: Rate limit key
            
        Returns:
            Optional[Dict]: Current status or None if not found
        """
        if not self.is_connected():
            return None
        
        try:
            redis_key = f"{self.config.rate_limiting.redis_key_prefix}:{key}"
            bucket = self.redis_client.hgetall(redis_key)
            
            if not bucket:
                return None
            
            return {
                'tokens': int(bucket.get(b'tokens', 0)),
                'capacity': int(bucket.get(b'capacity', 0)),
                'refill_rate': int(bucket.get(b'refill_rate', 0)),
                'window': int(bucket.get(b'window', 0)),
                'last_refill': float(bucket.get(b'last_refill', 0))
            }
            
        except RedisError as e:
            logger.error(f"Failed to get rate limit status for '{key}': {e}")
            return None


class SQLiteRateLimiter:
    """
    SQLite-based rate limiter for single-machine fallback.
    
    Provides rate limiting functionality when Redis is not available,
    using SQLite database for persistence.
    """
    
    def __init__(self, db_path: str = None):
        """
        Initialize SQLite rate limiter.
        
        Args:
            db_path: Path to SQLite database, uses config default if None
        """
        self.config = get_cluster_config()
        self.db_path = db_path or self.config.rate_limiting.sqlite_db_path
        
        # Thread lock for SQLite operations
        self._lock = threading.Lock()
        
        # Ensure directory exists
        import os
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        self._init_database()
    
    def _init_database(self) -> None:
        """Initialize SQLite database and rate limit tables."""
        try:
            with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS rate_limits (
                        key TEXT PRIMARY KEY,
                        tokens INTEGER NOT NULL,
                        capacity INTEGER NOT NULL,
                        refill_rate INTEGER NOT NULL,
                        window INTEGER NOT NULL,
                        last_refill REAL NOT NULL,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                
                # Index for cleanup operations
                conn.execute('''
                    CREATE INDEX IF NOT EXISTS idx_rate_limits_updated 
                    ON rate_limits(updated_at)
                ''')
                
                conn.commit()
                
                # Clean up old entries
                self._cleanup_old_entries(conn)
                
        except sqlite3.Error as e:
            logger.error(f"Failed to initialize rate limit database: {e}")
            raise RateLimitError(f"Failed to initialize rate limit database: {e}")
    
    def _cleanup_old_entries(self, conn: sqlite3.Connection) -> None:
        """Remove old rate limit entries."""
        try:
            # Remove entries older than 1 hour
            cutoff = datetime.now() - timedelta(hours=1)
            cursor = conn.execute(
                'DELETE FROM rate_limits WHERE updated_at < ?', 
                (cutoff,)
            )
            if cursor.rowcount > 0:
                logger.debug(f"Cleaned up {cursor.rowcount} old rate limit entries")
                conn.commit()
        except sqlite3.Error as e:
            logger.warning(f"Failed to clean up old rate limit entries: {e}")
    
    def check_rate_limit(self, key: str, limit: int, window: int, 
                        cost: int = 1) -> RateLimitInfo:
        """
        Check rate limit for a key using token bucket algorithm.
        
        Args:
            key: Rate limit key
            limit: Maximum tokens in bucket
            window: Time window in seconds for token refill
            cost: Number of tokens to consume
            
        Returns:
            RateLimitInfo: Rate limit check result
        """
        with self._lock:
            try:
                with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                    now = time.time()
                    
                    # Get current bucket state
                    cursor = conn.execute(
                        'SELECT tokens, last_refill FROM rate_limits WHERE key = ?',
                        (key,)
                    )
                    row = cursor.fetchone()
                    
                    if row:
                        current_tokens, last_refill = row
                    else:
                        # First request for this key
                        current_tokens = limit
                        last_refill = now
                    
                    # Calculate tokens to add based on elapsed time
                    elapsed = max(0, now - last_refill)
                    tokens_per_window = limit
                    tokens_to_add = int(elapsed / window * tokens_per_window)
                    current_tokens = min(limit, current_tokens + tokens_to_add)
                    
                    # Check if request can be satisfied
                    allowed = current_tokens >= cost
                    remaining_tokens = current_tokens
                    
                    if allowed:
                        remaining_tokens = current_tokens - cost
                    
                    # Update or insert bucket state
                    conn.execute('''
                        INSERT OR REPLACE INTO rate_limits 
                        (key, tokens, capacity, refill_rate, window, last_refill, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (key, remaining_tokens, limit, tokens_per_window, window, now, datetime.now()))
                    
                    conn.commit()
                    
                    # Calculate next reset time
                    time_to_full = 0
                    if remaining_tokens < limit:
                        time_to_full = (limit - remaining_tokens) / tokens_per_window * window
                    
                    retry_after = None
                    if not allowed:
                        retry_after = window / tokens_per_window
                    
                    return RateLimitInfo(
                        key=key,
                        allowed=allowed,
                        tokens_remaining=remaining_tokens,
                        reset_time=now + time_to_full,
                        retry_after=retry_after
                    )
                    
            except sqlite3.Error as e:
                logger.error(f"SQLite rate limit check failed for '{key}': {e}")
                return RateLimitInfo(
                    key=key,
                    allowed=False,
                    tokens_remaining=0,
                    reset_time=time.time() + window,
                    retry_after=window
                )
    
    def reset_rate_limit(self, key: str) -> bool:
        """Reset rate limit for a key."""
        with self._lock:
            try:
                with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                    cursor = conn.execute('DELETE FROM rate_limits WHERE key = ?', (key,))
                    conn.commit()
                    logger.debug(f"Reset SQLite rate limit for '{key}'")
                    return cursor.rowcount > 0
                    
            except sqlite3.Error as e:
                logger.error(f"Failed to reset SQLite rate limit for '{key}': {e}")
                return False
    
    def get_rate_limit_status(self, key: str) -> Optional[Dict]:
        """Get current rate limit status for a key."""
        with self._lock:
            try:
                with sqlite3.connect(self.db_path, timeout=30.0) as conn:
                    cursor = conn.execute('''
                        SELECT tokens, capacity, refill_rate, window, last_refill
                        FROM rate_limits WHERE key = ?
                    ''', (key,))
                    row = cursor.fetchone()
                    
                    if not row:
                        return None
                    
                    tokens, capacity, refill_rate, window, last_refill = row
                    return {
                        'tokens': tokens,
                        'capacity': capacity,
                        'refill_rate': refill_rate,
                        'window': window,
                        'last_refill': last_refill
                    }
                    
            except sqlite3.Error as e:
                logger.error(f"Failed to get SQLite rate limit status for '{key}': {e}")
                return None


class RateLimiter:
    """
    Unified rate limiter that tries Redis first, falls back to SQLite.
    """
    
    def __init__(self):
        """Initialize rate limiter with Redis and SQLite fallback."""
        self.config = get_cluster_config()
        
        self.redis_limiter: Optional[RedisRateLimiter] = None
        self.sqlite_limiter: Optional[SQLiteRateLimiter] = None
        self.use_redis = not self.config.force_sqlite
        
        self._initialize()
    
    def _initialize(self) -> None:
        """Initialize the appropriate rate limiting mechanism."""
        if self.use_redis and REDIS_AVAILABLE:
            try:
                self.redis_limiter = RedisRateLimiter()
                logger.info("Initialized Redis rate limiter")
                return
            except RateLimitError as e:
                logger.warning(f"Redis rate limiter failed, falling back to SQLite: {e}")
        
        # Fall back to SQLite-based rate limiter
        self.sqlite_limiter = SQLiteRateLimiter()
        logger.info("Initialized SQLite rate limiter")
    
    def check_rate_limit(self, key: str, limit: int, window: int, 
                        cost: int = 1) -> RateLimitInfo:
        """Check rate limit for a key."""
        if self.redis_limiter:
            return self.redis_limiter.check_rate_limit(key, limit, window, cost)
        elif self.sqlite_limiter:
            return self.sqlite_limiter.check_rate_limit(key, limit, window, cost)
        else:
            logger.error("No rate limiter available")
            return RateLimitInfo(
                key=key,
                allowed=True,  # Fail open
                tokens_remaining=limit,
                reset_time=time.time() + window
            )
    
    def reset_rate_limit(self, key: str) -> bool:
        """Reset rate limit for a key."""
        if self.redis_limiter:
            return self.redis_limiter.reset_rate_limit(key)
        elif self.sqlite_limiter:
            return self.sqlite_limiter.reset_rate_limit(key)
        else:
            return True
    
    def get_rate_limit_status(self, key: str) -> Optional[Dict]:
        """Get current rate limit status for a key."""
        if self.redis_limiter:
            return self.redis_limiter.get_rate_limit_status(key)
        elif self.sqlite_limiter:
            return self.sqlite_limiter.get_rate_limit_status(key)
        else:
            return None
    
    def check_platform_limit(self, platform: str, cost: int = 1) -> RateLimitInfo:
        """
        Check platform-specific rate limit.
        
        Args:
            platform: Platform name (twitter, reddit, etc.)
            cost: Number of operations to consume
            
        Returns:
            RateLimitInfo: Rate limit check result
        """
        # Get platform-specific limits from config
        platform_limits = self.config.rate_limiting.platform_limits.get(
            platform, 
            self.config.rate_limiting.default_limits
        )
        
        return self.check_rate_limit(
            key=f"platform:{platform}",
            limit=platform_limits.get("requests_per_hour", 60),
            window=3600,  # 1 hour
            cost=cost
        )
    
    def check_user_limit(self, user_id: str, cost: int = 1) -> RateLimitInfo:
        """
        Check user-specific rate limit.
        
        Args:
            user_id: User identifier
            cost: Number of operations to consume
            
        Returns:
            RateLimitInfo: Rate limit check result
        """
        default_limits = self.config.rate_limiting.default_limits
        
        return self.check_rate_limit(
            key=f"user:{user_id}",
            limit=default_limits.get("requests_per_minute", 10),
            window=60,  # 1 minute
            cost=cost
        )


def create_rate_limiter() -> RateLimiter:
    """
    Factory function to create rate limiter instance.
    
    Returns:
        RateLimiter: Configured rate limiter instance
    """
    return RateLimiter()


# Global rate limiter instance
_rate_limiter: Optional[RateLimiter] = None


def get_rate_limiter() -> RateLimiter:
    """
    Get global rate limiter instance (singleton).
    
    Returns:
        RateLimiter: Global rate limiter instance
    """
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = create_rate_limiter()
    return _rate_limiter


def check_rate_limit(key: str, limit: int, window: int, cost: int = 1) -> RateLimitInfo:
    """
    Convenience function for rate limit checking.
    
    Args:
        key: Rate limit key
        limit: Maximum requests in window
        window: Time window in seconds
        cost: Number of tokens to consume
        
    Returns:
        RateLimitInfo: Rate limit check result
    """
    return get_rate_limiter().check_rate_limit(key, limit, window, cost)


if __name__ == "__main__":
    # Demo the rate limiter functionality
    print("AutoAffiliateHub-X2 Rate Limiter Demo")
    print("=" * 37)
    
    import sys
    
    try:
        limiter = create_rate_limiter()
        
        print(f"Using: {'Redis' if limiter.redis_limiter else 'SQLite'} rate limiter")
        print()
        
        # Test basic rate limiting
        key = "demo_key"
        limit = 5  # 5 requests
        window = 10  # per 10 seconds
        
        print(f"Testing rate limit: {limit} requests per {window} seconds")
        print(f"Key: {key}")
        print()
        
        # Make several requests
        for i in range(8):
            result = limiter.check_rate_limit(key, limit, window, cost=1)
            
            status = "✅ ALLOWED" if result.allowed else "❌ DENIED"
            print(f"Request {i+1}: {status} (tokens remaining: {result.tokens_remaining})")
            
            if not result.allowed and result.retry_after:
                print(f"  Retry after: {result.retry_after:.2f} seconds")
            
            time.sleep(0.5)
        
        # Test platform limits
        print(f"\n🐦 Testing Twitter platform limits...")
        for i in range(3):
            result = limiter.check_platform_limit("twitter")
            status = "✅ ALLOWED" if result.allowed else "❌ DENIED"
            print(f"Twitter request {i+1}: {status} (tokens: {result.tokens_remaining})")
        
        # Test user limits
        print(f"\n👤 Testing user limits...")
        user_id = "user_123"
        for i in range(3):
            result = limiter.check_user_limit(user_id)
            status = "✅ ALLOWED" if result.allowed else "❌ DENIED"
            print(f"User request {i+1}: {status} (tokens: {result.tokens_remaining})")
        
        # Show current status
        print(f"\n📊 Current rate limit status:")
        status = limiter.get_rate_limit_status(key)
        if status:
            print(f"  Key: {key}")
            print(f"  Tokens: {status['tokens']}/{status['capacity']}")
            print(f"  Window: {status['window']}s")
            print(f"  Last refill: {status['last_refill']}")
        
        print(f"\n🎉 Rate limiter demo completed!")
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)