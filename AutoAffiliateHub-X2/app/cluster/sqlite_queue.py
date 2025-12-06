#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 SQLite Queue Implementation

Provides SQLite-based queue functionality as a fallback when Redis is unavailable.
Implements the same interface as RedisQueue for seamless fallback operation.
"""

import json
import sqlite3
import time
import threading
import uuid
import logging
from typing import Dict, List, Any, Optional, Tuple
from datetime import datetime, timedelta
from contextlib import contextmanager

from .config_cluster import get_cluster_config

logger = logging.getLogger(__name__)


class SQLiteQueueError(Exception):
    """SQLite queue specific errors."""
    pass


class SQLiteQueue:
    """
    SQLite-based queue implementation with consumer group simulation.
    
    Provides similar functionality to Redis Streams using SQLite tables
    for message storage, consumer tracking, and acknowledgments.
    """
    
    def __init__(self, db_path: Optional[str] = None):
        """
        Initialize SQLite queue.
        
        Args:
            db_path: Path to SQLite database file, uses config default if None
        """
        self.config = get_cluster_config()
        self.db_path = db_path or self.config.queue.sqlite_fallback_db
        self._lock = threading.RLock()
        
        # Ensure directory exists
        import os
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        # Initialize database
        self._init_database()
        
        logger.info(f"Initialized SQLite queue at {self.db_path}")
    
    def _init_database(self) -> None:
        """Initialize SQLite database tables."""
        with self._get_connection() as conn:
            cursor = conn.cursor()
            
            # Messages table - equivalent to Redis stream
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stream_name TEXT NOT NULL,
                    message_id TEXT UNIQUE NOT NULL,
                    data TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            ''')
            
            # Consumer groups table
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS consumer_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stream_name TEXT NOT NULL,
                    group_name TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(stream_name, group_name)
                )
            ''')
            
            # Consumer assignments table - tracks which consumer is processing which message
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS consumer_assignments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT NOT NULL,
                    stream_name TEXT NOT NULL,
                    group_name TEXT NOT NULL,
                    consumer_name TEXT NOT NULL,
                    assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    acknowledged BOOLEAN DEFAULT FALSE,
                    ack_at DATETIME NULL,
                    FOREIGN KEY (message_id) REFERENCES messages(message_id),
                    UNIQUE(message_id, group_name)
                )
            ''')
            
            # Indexes for performance
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_stream ON messages(stream_name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_assignments_consumer ON consumer_assignments(consumer_name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_assignments_group ON consumer_assignments(group_name)')
            cursor.execute('CREATE INDEX IF NOT EXISTS idx_assignments_ack ON consumer_assignments(acknowledged)')
            
            conn.commit()
    
    @contextmanager
    def _get_connection(self):
        """Get SQLite connection with proper locking."""
        with self._lock:
            conn = sqlite3.connect(self.db_path, timeout=30.0)
            conn.row_factory = sqlite3.Row  # Enable dict-like access
            try:
                yield conn
            finally:
                conn.close()
    
    def is_connected(self) -> bool:
        """Check if SQLite database is accessible."""
        try:
            with self._get_connection() as conn:
                conn.execute('SELECT 1')
                return True
        except Exception:
            return False
    
    def _ensure_consumer_group(self, stream_name: str, group_name: str) -> None:
        """
        Ensure consumer group exists for stream.
        
        Args:
            stream_name: Name of the stream
            group_name: Name of the consumer group
        """
        with self._get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT OR IGNORE INTO consumer_groups (stream_name, group_name)
                VALUES (?, ?)
            ''', (stream_name, group_name))
            conn.commit()
    
    def push(self, stream_name: str, item_dict: Dict[str, Any], 
             max_length: int = 10000) -> str:
        """
        Push item to SQLite queue.
        
        Args:
            stream_name: Name of the stream to push to
            item_dict: Dictionary to push as message
            max_length: Maximum stream length (for cleanup)
            
        Returns:
            str: Message ID assigned
        """
        try:
            # Generate unique message ID
            message_id = f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
            
            # Serialize the item
            data_json = json.dumps(item_dict)
            timestamp = time.time()
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Insert message
                cursor.execute('''
                    INSERT INTO messages (stream_name, message_id, data, timestamp)
                    VALUES (?, ?, ?, ?)
                ''', (stream_name, message_id, data_json, timestamp))
                
                # Cleanup old messages if needed
                cursor.execute('SELECT COUNT(*) FROM messages WHERE stream_name = ?', (stream_name,))
                count = cursor.fetchone()[0]
                
                if count > max_length:
                    # Remove oldest messages
                    cursor.execute('''
                        DELETE FROM messages 
                        WHERE stream_name = ? 
                        AND id NOT IN (
                            SELECT id FROM messages 
                            WHERE stream_name = ? 
                            ORDER BY timestamp DESC 
                            LIMIT ?
                        )
                    ''', (stream_name, stream_name, max_length))
                
                conn.commit()
            
            logger.debug(f"Pushed message {message_id} to stream {stream_name}")
            return message_id
            
        except (sqlite3.Error, json.JSONEncodeError) as e:
            logger.error(f"Failed to push to stream {stream_name}: {e}")
            raise SQLiteQueueError(f"Push failed: {e}")
    
    def read(self, group_name: str, consumer_name: str, 
             stream_names: List[str] = None, count: int = 10, 
             block: int = 1000) -> List[Tuple[str, str, Dict[str, Any]]]:
        """
        Read messages from SQLite queue using consumer group simulation.
        
        Args:
            group_name: Consumer group name
            consumer_name: Unique consumer identifier
            stream_names: List of streams to read from
            count: Maximum messages to read
            block: Block time in milliseconds (simulated with polling)
            
        Returns:
            List of tuples: (stream_name, message_id, data_dict)
        """
        if stream_names is None:
            stream_names = [self.config.queue.default_stream]
        
        # Ensure consumer groups exist
        for stream_name in stream_names:
            self._ensure_consumer_group(stream_name, group_name)
        
        start_time = time.time()
        timeout_seconds = block / 1000.0 if block > 0 else 0
        
        while True:
            try:
                results = []
                
                with self._get_connection() as conn:
                    cursor = conn.cursor()
                    
                    for stream_name in stream_names:
                        # Find messages not yet assigned to this consumer group
                        cursor.execute('''
                            SELECT m.stream_name, m.message_id, m.data
                            FROM messages m
                            LEFT JOIN consumer_assignments ca ON (
                                m.message_id = ca.message_id AND 
                                ca.group_name = ? AND
                                ca.acknowledged = FALSE
                            )
                            WHERE m.stream_name = ? AND ca.message_id IS NULL
                            ORDER BY m.timestamp ASC
                            LIMIT ?
                        ''', (group_name, stream_name, count))
                        
                        rows = cursor.fetchall()
                        
                        for row in rows:
                            stream_name_db = row['stream_name']
                            message_id = row['message_id']
                            data_json = row['data']
                            
                            # Assign message to this consumer
                            cursor.execute('''
                                INSERT OR IGNORE INTO consumer_assignments 
                                (message_id, stream_name, group_name, consumer_name)
                                VALUES (?, ?, ?, ?)
                            ''', (message_id, stream_name_db, group_name, consumer_name))
                            
                            # Parse data
                            try:
                                data = json.loads(data_json)
                                results.append((stream_name_db, message_id, data))
                            except json.JSONDecodeError as e:
                                logger.warning(f"Failed to parse message {message_id}: {e}")
                                results.append((stream_name_db, message_id, {'error': str(e)}))
                            
                            if len(results) >= count:
                                break
                        
                        if len(results) >= count:
                            break
                    
                    conn.commit()
                
                if results or timeout_seconds <= 0:
                    logger.debug(f"Read {len(results)} messages for consumer {consumer_name}")
                    return results
                
                # Check timeout
                if time.time() - start_time >= timeout_seconds:
                    return []
                
                # Sleep briefly before retry
                time.sleep(0.1)
                
            except sqlite3.Error as e:
                logger.error(f"Failed to read from streams: {e}")
                raise SQLiteQueueError(f"Read failed: {e}")
    
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
        if not message_ids:
            return 0
        
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Mark messages as acknowledged
                placeholders = ','.join('?' for _ in message_ids)
                cursor.execute(f'''
                    UPDATE consumer_assignments 
                    SET acknowledged = TRUE, ack_at = CURRENT_TIMESTAMP
                    WHERE group_name = ? AND message_id IN ({placeholders})
                ''', (group_name, *message_ids))
                
                acked = cursor.rowcount
                conn.commit()
                
                logger.debug(f"Acknowledged {acked}/{len(message_ids)} messages in {stream_name}")
                return acked
                
        except sqlite3.Error as e:
            logger.error(f"Failed to acknowledge messages: {e}")
            raise SQLiteQueueError(f"Ack failed: {e}")
    
    def get_length(self, stream_name: str) -> int:
        """
        Get stream length.
        
        Args:
            stream_name: Name of the stream
            
        Returns:
            int: Number of messages in stream
        """
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('SELECT COUNT(*) FROM messages WHERE stream_name = ?', (stream_name,))
                return cursor.fetchone()[0]
        except sqlite3.Error as e:
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
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT COUNT(*) FROM consumer_assignments 
                    WHERE stream_name = ? AND group_name = ? AND acknowledged = FALSE
                ''', (stream_name, group_name))
                return cursor.fetchone()[0]
        except sqlite3.Error as e:
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
            min_idle_time: Minimum idle time in milliseconds
            
        Returns:
            List of claimed messages: (message_id, data_dict)
        """
        min_idle_seconds = min_idle_time / 1000.0
        cutoff_time = datetime.now() - timedelta(seconds=min_idle_seconds)
        
        try:
            results = []
            
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Find stale assignments
                cursor.execute('''
                    SELECT ca.message_id, m.data
                    FROM consumer_assignments ca
                    JOIN messages m ON ca.message_id = m.message_id
                    WHERE ca.stream_name = ? 
                    AND ca.group_name = ?
                    AND ca.consumer_name != ?
                    AND ca.acknowledged = FALSE
                    AND ca.assigned_at < ?
                    LIMIT 100
                ''', (stream_name, group_name, consumer_name, cutoff_time))
                
                stale_assignments = cursor.fetchall()
                
                for row in stale_assignments:
                    message_id = row['message_id']
                    data_json = row['data']
                    
                    # Claim the message by updating the consumer
                    cursor.execute('''
                        UPDATE consumer_assignments 
                        SET consumer_name = ?, assigned_at = CURRENT_TIMESTAMP
                        WHERE message_id = ? AND group_name = ?
                    ''', (consumer_name, message_id, group_name))
                    
                    # Parse data
                    try:
                        data = json.loads(data_json)
                        results.append((message_id, data))
                    except json.JSONDecodeError as e:
                        logger.warning(f"Failed to parse claimed message {message_id}: {e}")
                        results.append((message_id, {'error': str(e)}))
                
                conn.commit()
            
            if results:
                logger.info(f"Claimed {len(results)} stale messages for {consumer_name}")
            
            return results
            
        except sqlite3.Error as e:
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
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Get basic stream info
                cursor.execute('SELECT COUNT(*) as length FROM messages WHERE stream_name = ?', (stream_name,))
                length = cursor.fetchone()[0]
                
                cursor.execute('''
                    SELECT MIN(timestamp) as first_entry, MAX(timestamp) as last_entry 
                    FROM messages WHERE stream_name = ?
                ''', (stream_name,))
                time_info = cursor.fetchone()
                
                # Get consumer groups
                cursor.execute('SELECT group_name FROM consumer_groups WHERE stream_name = ?', (stream_name,))
                groups = [row[0] for row in cursor.fetchall()]
                
                return {
                    'length': length,
                    'first-entry': time_info['first_entry'] if time_info else None,
                    'last-entry': time_info['last_entry'] if time_info else None,
                    'groups': len(groups),
                    'group_names': groups
                }
                
        except sqlite3.Error as e:
            logger.warning(f"Failed to get stream info: {e}")
            return {}
    
    def cleanup_stream(self, stream_name: str, max_age_seconds: int = 86400) -> int:
        """
        Clean up old messages from stream.
        
        Args:
            stream_name: Stream to clean up
            max_age_seconds: Maximum age of messages to keep
            
        Returns:
            int: Number of messages trimmed
        """
        cutoff_time = time.time() - max_age_seconds
        
        try:
            with self._get_connection() as conn:
                cursor = conn.cursor()
                
                # Count messages to be deleted
                cursor.execute('''
                    SELECT COUNT(*) FROM messages 
                    WHERE stream_name = ? AND timestamp < ?
                ''', (stream_name, cutoff_time))
                old_count = cursor.fetchone()[0]
                
                if old_count == 0:
                    return 0
                
                # Delete old messages (this will cascade to assignments due to foreign key)
                cursor.execute('''
                    DELETE FROM messages 
                    WHERE stream_name = ? AND timestamp < ?
                ''', (stream_name, cutoff_time))
                
                # Clean up orphaned assignments
                cursor.execute('''
                    DELETE FROM consumer_assignments 
                    WHERE message_id NOT IN (SELECT message_id FROM messages)
                ''')
                
                conn.commit()
                
                if old_count > 0:
                    logger.info(f"Trimmed {old_count} old messages from {stream_name}")
                
                return old_count
                
        except sqlite3.Error as e:
            logger.error(f"Failed to cleanup stream: {e}")
            return 0


def create_sqlite_queue(db_path: str = None) -> SQLiteQueue:
    """
    Factory function to create SQLite queue.
    
    Args:
        db_path: Optional database path override
        
    Returns:
        SQLiteQueue: Configured queue instance
    """
    return SQLiteQueue(db_path)


if __name__ == "__main__":
    # Demo the SQLite queue functionality
    print("AutoAffiliateHub-X2 SQLite Queue Demo")
    print("=" * 40)
    
    try:
        # Create queue with test database
        import tempfile
        import os
        
        temp_dir = tempfile.mkdtemp()
        db_path = os.path.join(temp_dir, "test_queue.db")
        
        queue = SQLiteQueue(db_path)
        
        stream_name = "demo_stream"
        group_name = "demo_group"
        consumer_name = "demo_consumer"
        
        print(f"✅ Created SQLite queue at {db_path}")
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
        print(f"\n📋 Stream info: length={info.get('length', 'N/A')}, groups={info.get('groups', 'N/A')}")
        
        print(f"\n🎉 SQLite Queue demo completed successfully!")
        
        # Cleanup
        os.unlink(db_path)
        os.rmdir(temp_dir)
        
    except Exception as e:
        print(f"❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()