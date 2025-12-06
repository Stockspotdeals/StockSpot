#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Redis Queue Implementation

Provides Redis Streams-based queue functionality with consumer groups,
acknowledgments, and automatic claiming of stale messages. Falls back
to SQLite queue if Redis is unavailable.
"""

import json
import time
import logging
from typing import Dict, List, Any, Optional, Tuple
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

logger = logging.getLogger(__name__)


class RedisQueueError(Exception):
    """Redis queue specific errors."""
    pass


class RedisQueue:
    """
    Redis Streams-based distributed queue with consumer groups.
    
    Provides push/pop semantics using Redis Streams with automatic
    consumer group creation, message acknowledgment, and stale message
    claiming for reliability.
    """
    
    def __init__(self, redis_client: Optional[redis.Redis] = None):
        """
        Initialize Redis queue.
        
        Args:
            redis_client: Optional Redis client, will create from config if None
        """
        self.config = get_cluster_config()
        self.redis_client = redis_client
        self._connected = False
        
        if not REDIS_AVAILABLE:
            raise RedisQueueError("Redis package not available")
        
        self._connect()
    
    def _connect(self) -> None:
        """Establish Redis connection."""
        if self.redis_client is None:
            try:
                if self.config.redis.url:
                    self.redis_client = redis.from_url(
                        self.config.redis.url,
                        socket_timeout=self.config.redis.socket_timeout,
                        socket_connect_timeout=self.config.redis.socket_connect_timeout,
                        retry_on_timeout=self.config.redis.retry_on_timeout,
                        max_connections=self.config.redis.max_connections
                    )
                else:
                    self.redis_client = redis.Redis(
                        host=self.config.redis.host,
                        port=self.config.redis.port,
                        db=self.config.redis.db,
                        password=self.config.redis.password,
                        socket_timeout=self.config.redis.socket_timeout,
                        socket_connect_timeout=self.config.redis.socket_connect_timeout,
                        retry_on_timeout=self.config.redis.retry_on_timeout,
                        max_connections=self.config.redis.max_connections
                    )
                
                # Test connection
                self.redis_client.ping()
                self._connected = True
                logger.info("Connected to Redis successfully")
                
            except (ConnectionError, RedisError) as e:
                logger.error(f"Failed to connect to Redis: {e}")
                self._connected = False
                raise RedisQueueError(f"Redis connection failed: {e}")
    
    def is_connected(self) -> bool:
        """Check if Redis is connected and available."""
        if not self._connected:
            return False
        
        try:
            self.redis_client.ping()
            return True
        except (ConnectionError, RedisError):
            self._connected = False
            return False
    
    def _ensure_consumer_group(self, stream_name: str, group_name: str) -> None:
        """
        Ensure consumer group exists for stream.
        
        Args:
            stream_name: Name of the stream
            group_name: Name of the consumer group
        """
        try:
            # Try to create consumer group, ignore if exists
            self.redis_client.xgroup_create(
                stream_name, group_name, id='0', mkstream=True
            )
            logger.debug(f"Created consumer group {group_name} for stream {stream_name}")
        except redis.ResponseError as e:
            if "BUSYGROUP" not in str(e):
                logger.warning(f"Error creating consumer group: {e}")
    
    def push(self, stream_name: str, item_dict: Dict[str, Any], 
             max_length: int = 10000) -> str:
        """
        Push item to Redis stream.
        
        Args:
            stream_name: Name of the stream to push to
            item_dict: Dictionary to push as message
            max_length: Maximum stream length (for trimming)
            
        Returns:
            str: Message ID assigned by Redis
        """
        if not self.is_connected():
            raise RedisQueueError("Redis not connected")
        
        try:
            # Serialize the item
            serialized_item = {
                'data': json.dumps(item_dict),
                'timestamp': str(time.time()),
                'type': item_dict.get('type', 'job')
            }
            
            # Add to stream with trimming
            message_id = self.redis_client.xadd(
                stream_name,
                serialized_item,
                maxlen=max_length,
                approximate=True
            )
            
            logger.debug(f"Pushed message {message_id} to stream {stream_name}")
            return message_id.decode() if isinstance(message_id, bytes) else message_id
            
        except (RedisError, json.JSONEncodeError) as e:
            logger.error(f"Failed to push to stream {stream_name}: {e}")
            raise RedisQueueError(f"Push failed: {e}")
    
    def read(self, group_name: str, consumer_name: str, 
             stream_names: List[str] = None, count: int = 10, 
             block: int = 1000) -> List[Tuple[str, str, Dict[str, Any]]]:
        """
        Read messages from Redis streams using consumer group.
        
        Args:
            group_name: Consumer group name
            consumer_name: Unique consumer identifier
            stream_names: List of streams to read from, defaults to default stream
            count: Maximum messages to read
            block: Block time in milliseconds
            
        Returns:
            List of tuples: (stream_name, message_id, data_dict)
        """
        if not self.is_connected():
            raise RedisQueueError("Redis not connected")
        
        if stream_names is None:
            stream_names = [self.config.queue.default_stream]
        
        try:
            # Ensure consumer groups exist
            for stream_name in stream_names:
                self._ensure_consumer_group(stream_name, group_name)
            
            # Prepare stream mapping for reading
            streams = {stream: '>' for stream in stream_names}
            
            # Read from streams
            messages = self.redis_client.xreadgroup(
                group_name,
                consumer_name,
                streams,
                count=count,
                block=block
            )
            
            results = []
            for stream_name, stream_messages in messages:
                stream_name = stream_name.decode() if isinstance(stream_name, bytes) else stream_name
                
                for message_id, fields in stream_messages:
                    message_id = message_id.decode() if isinstance(message_id, bytes) else message_id
                    
                    # Decode fields
                    decoded_fields = {}
                    for key, value in fields.items():
                        key = key.decode() if isinstance(key, bytes) else key
                        value = value.decode() if isinstance(value, bytes) else value
                        decoded_fields[key] = value
                    
                    # Parse the data
                    try:
                        if 'data' in decoded_fields:
                            data = json.loads(decoded_fields['data'])
                        else:
                            data = decoded_fields
                            
                        results.append((stream_name, message_id, data))
                        
                    except json.JSONDecodeError as e:
                        logger.warning(f"Failed to parse message {message_id}: {e}")
                        # Still return raw fields for manual handling
                        results.append((stream_name, message_id, decoded_fields))
            
            logger.debug(f"Read {len(results)} messages for consumer {consumer_name}")
            return results
            
        except RedisError as e:
            logger.error(f"Failed to read from streams: {e}")
            raise RedisQueueError(f"Read failed: {e}")
    
    def ack(self, stream_name: str, group_name: str, *message_ids: str) -> int:
        """
        Acknowledge processed messages.
        
        Args:
            stream_name: Stream name
            group_name: Consumer group name
            message_ids: Message IDs to acknowledge
            
        Returns:
            int: Number of messages acknowledged
        """
        if not self.is_connected():
            raise RedisQueueError("Redis not connected")
        
        if not message_ids:
            return 0
        
        try:
            acked = self.redis_client.xack(stream_name, group_name, *message_ids)
            logger.debug(f"Acknowledged {acked}/{len(message_ids)} messages in {stream_name}")
            return acked
            
        except RedisError as e:
            logger.error(f"Failed to acknowledge messages: {e}")
            raise RedisQueueError(f"Ack failed: {e}")
    
    def get_length(self, stream_name: str) -> int:
        """
        Get stream length.
        
        Args:
            stream_name: Name of the stream
            
        Returns:
            int: Number of messages in stream
        """
        if not self.is_connected():
            raise RedisQueueError("Redis not connected")
        
        try:
            return self.redis_client.xlen(stream_name)
        except RedisError as e:
            logger.error(f"Failed to get stream length: {e}")
            return 0
    
    def get_pending_count(self, stream_name: str, group_name: str) -> int:
        """
        Get number of pending (unacknowledged) messages for group.
        
        Args:
            stream_name: Stream name
            group_name: Consumer group name
            
        Returns:
            int: Number of pending messages
        """
        if not self.is_connected():
            return 0
        
        try:
            pending_info = self.redis_client.xpending(stream_name, group_name)
            return pending_info['pending'] if pending_info else 0
        except RedisError as e:
            logger.warning(f"Failed to get pending count: {e}")
            return 0
    
    def claim_stale_messages(self, stream_name: str, group_name: str, 
                           consumer_name: str, min_idle_time: int = 300000) -> List[Tuple[str, Dict[str, Any]]]:
        """
        Claim stale messages from other consumers.
        
        Args:
            stream_name: Stream name
            group_name: Consumer group name
            consumer_name: This consumer's name
            min_idle_time: Minimum idle time in milliseconds (default: 5 minutes)
            
        Returns:
            List of claimed messages: (message_id, data_dict)
        """
        if not self.is_connected():
            return []
        
        try:
            # Get pending messages
            pending_messages = self.redis_client.xpending_range(
                stream_name, group_name, '-', '+', count=100
            )
            
            if not pending_messages:
                return []
            
            # Find messages that are idle long enough
            stale_message_ids = []
            for msg_info in pending_messages:
                message_id = msg_info['message_id']
                idle_time = msg_info['time_since_delivered']
                
                if idle_time >= min_idle_time:
                    stale_message_ids.append(message_id)
            
            if not stale_message_ids:
                return []
            
            # Claim stale messages
            claimed_messages = self.redis_client.xclaim(
                stream_name, group_name, consumer_name,
                min_idle_time, *stale_message_ids
            )
            
            results = []
            for message_id, fields in claimed_messages:
                message_id = message_id.decode() if isinstance(message_id, bytes) else message_id
                
                # Decode fields
                decoded_fields = {}
                for key, value in fields.items():
                    key = key.decode() if isinstance(key, bytes) else key
                    value = value.decode() if isinstance(value, bytes) else value
                    decoded_fields[key] = value
                
                # Parse data
                try:
                    if 'data' in decoded_fields:
                        data = json.loads(decoded_fields['data'])
                    else:
                        data = decoded_fields
                        
                    results.append((message_id, data))
                    
                except json.JSONDecodeError as e:
                    logger.warning(f"Failed to parse claimed message {message_id}: {e}")
                    results.append((message_id, decoded_fields))
            
            if results:
                logger.info(f"Claimed {len(results)} stale messages for {consumer_name}")
            
            return results
            
        except RedisError as e:
            logger.error(f"Failed to claim stale messages: {e}")
            return []
    
    def get_stream_info(self, stream_name: str) -> Dict[str, Any]:
        """
        Get detailed stream information.
        
        Args:
            stream_name: Stream name
            
        Returns:
            Dict with stream info including length, groups, etc.
        """
        if not self.is_connected():
            return {}
        
        try:
            info = self.redis_client.xinfo_stream(stream_name)
            
            # Convert bytes to strings for readability
            result = {}
            for key, value in info.items():
                key = key.decode() if isinstance(key, bytes) else key
                if isinstance(value, bytes):
                    value = value.decode()
                result[key] = value
            
            return result
            
        except RedisError as e:
            logger.warning(f"Failed to get stream info: {e}")
            return {}
    
    def cleanup_stream(self, stream_name: str, max_age_seconds: int = 86400) -> int:
        """
        Clean up old messages from stream.
        
        Args:
            stream_name: Stream to clean up
            max_age_seconds: Maximum age of messages to keep (default: 1 day)
            
        Returns:
            int: Number of messages trimmed
        """
        if not self.is_connected():
            return 0
        
        try:
            # Calculate cutoff timestamp
            cutoff_time = int((time.time() - max_age_seconds) * 1000)
            
            # Get current length
            old_length = self.redis_client.xlen(stream_name)
            
            # Trim by time (approximate)
            self.redis_client.xtrim(stream_name, minid=cutoff_time, approximate=True)
            
            # Get new length
            new_length = self.redis_client.xlen(stream_name)
            
            trimmed = old_length - new_length
            if trimmed > 0:
                logger.info(f"Trimmed {trimmed} old messages from {stream_name}")
            
            return trimmed
            
        except RedisError as e:
            logger.error(f"Failed to cleanup stream: {e}")
            return 0


def create_redis_queue(config_override: Dict[str, Any] = None) -> RedisQueue:
    """
    Factory function to create Redis queue with optional config override.
    
    Args:
        config_override: Optional configuration overrides
        
    Returns:
        RedisQueue: Configured queue instance
    """
    try:
        if config_override:
            # Create custom Redis client with overrides
            redis_config = get_cluster_config().redis
            
            # Apply overrides
            for key, value in config_override.items():
                if hasattr(redis_config, key):
                    setattr(redis_config, key, value)
            
            # Create custom client
            redis_client = redis.Redis(
                host=redis_config.host,
                port=redis_config.port,
                db=redis_config.db,
                password=redis_config.password,
                socket_timeout=redis_config.socket_timeout,
                socket_connect_timeout=redis_config.socket_connect_timeout
            )
            
            return RedisQueue(redis_client)
        else:
            return RedisQueue()
            
    except (RedisQueueError, ImportError) as e:
        logger.error(f"Failed to create Redis queue: {e}")
        raise


if __name__ == "__main__":
    # Demo the Redis queue functionality
    print("AutoAffiliateHub-X2 Redis Queue Demo")
    print("=" * 40)
    
    try:
        # Create queue
        queue = RedisQueue()
        
        if not queue.is_connected():
            print("❌ Redis not available - this demo requires Redis")
            exit(1)
        
        stream_name = "demo_stream"
        group_name = "demo_group"
        consumer_name = "demo_consumer"
        
        print(f"✅ Connected to Redis")
        print(f"Stream: {stream_name}")
        print(f"Consumer Group: {group_name}")
        print(f"Consumer: {consumer_name}")
        print()
        
        # Push some test messages
        print("📤 Pushing test messages...")
        for i in range(5):
            message_id = queue.push(stream_name, {
                'job_id': f'test_job_{i}',
                'action': 'process_deal',
                'data': {'deal_id': i, 'platform': 'test'}
            })
            print(f"  Pushed message {message_id}")
        
        print(f"\n📊 Stream length: {queue.get_length(stream_name)}")
        
        # Read messages
        print(f"\n📥 Reading messages as {consumer_name}...")
        messages = queue.read(group_name, consumer_name, [stream_name], count=3, block=1000)
        
        for stream, msg_id, data in messages:
            print(f"  Received: {msg_id} -> {data}")
        
        # Acknowledge some messages
        if messages:
            msg_ids = [msg_id for _, msg_id, _ in messages[:2]]
            acked = queue.ack(stream_name, group_name, *msg_ids)
            print(f"\n✅ Acknowledged {acked} messages")
        
        # Check pending
        pending = queue.get_pending_count(stream_name, group_name)
        print(f"\n⏳ Pending messages: {pending}")
        
        # Stream info
        info = queue.get_stream_info(stream_name)
        print(f"\n📋 Stream info: length={info.get('length', 'N/A')}")
        
        print(f"\n🎉 Redis Queue demo completed successfully!")
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        print("💡 Make sure Redis is running: docker run -d -p 6379:6379 redis")