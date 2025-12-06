"""
Queue Manager for AutoAffiliateHub-X2
Manages prioritized posting queue with scheduling and rate limiting.

Usage:
    queue_manager = QueueManager()
    await queue_manager.add_item(scored_item)
    next_item = await queue_manager.get_next()
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import heapq
import sys
import os
from dataclasses import dataclass, asdict
from enum import Enum

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

logger = logging.getLogger(__name__)

class QueueItemStatus(Enum):
    """Queue item status enumeration"""
    PENDING = "pending"
    PROCESSING = "processing" 
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

@dataclass
class QueueItem:
    """Queue item with priority and metadata"""
    id: str
    score: float
    item_data: Dict[str, Any]
    added_at: datetime
    scheduled_for: datetime
    priority: float  # Negative for min-heap (highest score = lowest priority value)
    release_state: str = 'live'  # 'upcoming' or 'live'
    status: QueueItemStatus = QueueItemStatus.PENDING
    attempts: int = 0
    last_attempt: Optional[datetime] = None
    error_message: Optional[str] = None
    
    def __lt__(self, other):
        """Comparison for heapq (priority queue)"""
        # First by scheduled time, then by priority (score)
        if self.scheduled_for != other.scheduled_for:
            return self.scheduled_for < other.scheduled_for
        return self.priority < other.priority

class QueueManager:
    """Advanced queue manager with priority scheduling and rate limiting"""
    
    def __init__(self):
        """Initialize queue manager"""
        
        # Queue storage
        self.priority_queue = []  # heapq of QueueItem objects
        self.items_by_id = {}     # id -> QueueItem lookup
        
        # Rate limiting settings
        self.max_posts_per_hour = 30      # Default rate limit
        self.min_interval_seconds = 120   # 2 minutes between posts
        self.posting_history = []         # List of posting timestamps
        
        # Retry settings
        self.max_retries = 3
        self.retry_delays = [300, 900, 1800]  # 5min, 15min, 30min
        
        # Queue limits
        self.max_queue_size = 1000
        self.cleanup_interval = 3600  # 1 hour
        
        # Scheduling rules
        self.posting_windows = {
            'weekday': {
                'start_hour': 9,   # 9 AM
                'end_hour': 21,    # 9 PM
                'timezone': 'US/Eastern'
            },
            'weekend': {
                'start_hour': 10,  # 10 AM
                'end_hour': 20,    # 8 PM
                'timezone': 'US/Eastern'
            }
        }
        
        # Category-specific delays (to avoid spamming similar items)
        self.category_delays = {
            'sneakers': 300,      # 5 minutes between sneaker posts
            'gaming': 600,        # 10 minutes between gaming posts
            'luxury': 1800,       # 30 minutes between luxury posts
            'electronics': 900,   # 15 minutes between electronics
            'default': 180        # 3 minutes default
        }
        
        self.last_post_by_category = {}  # category -> last_post_time
        
    def calculate_priority(self, score: float, item: Dict) -> float:
        """Calculate queue priority (lower = higher priority)
        
        Args:
            score: Item score from scorer
            item: Item data dict
            
        Returns:
            Priority value (negative for min-heap)
        """
        # Base priority from score (negate for min-heap)
        priority = -score
        
        # Time-based urgency adjustments
        try:
            release_date = datetime.fromisoformat(item['release_date'].replace('Z', '+00:00'))
            age_hours = (datetime.now() - release_date.replace(tzinfo=None)).total_seconds() / 3600
            
            # Fresher items get higher priority
            if age_hours < 0.5:      # < 30 minutes
                priority -= 20
            elif age_hours < 2:      # < 2 hours
                priority -= 10
            elif age_hours > 12:     # > 12 hours
                priority += 10
                
        except (ValueError, KeyError):
            pass
            
        # Limited edition boost
        if item.get('limited_edition', False):
            priority -= 15
            
        # Brand-based priority adjustments
        brand = item.get('brand', '').lower()
        if brand in ['supreme', 'yeezy', 'travis scott']:
            priority -= 25
        elif brand in ['nike', 'jordan', 'off-white']:
            priority -= 15
        elif brand in ['adidas', 'playstation']:
            priority -= 10
            
        return priority
        
    def calculate_next_post_time(self, item: Dict) -> datetime:
        """Calculate when item should be posted based on rate limits and rules
        
        Args:
            item: Item data dict
            
        Returns:
            Scheduled posting time
        """
        now = datetime.now()
        
        # Check rate limiting
        next_available = now
        
        # Enforce minimum interval
        if self.posting_history:
            last_post = max(self.posting_history)
            min_next = last_post + timedelta(seconds=self.min_interval_seconds)
            if min_next > next_available:
                next_available = min_next
                
        # Check hourly rate limit
        hour_ago = now - timedelta(hours=1)
        recent_posts = [t for t in self.posting_history if t > hour_ago]
        
        if len(recent_posts) >= self.max_posts_per_hour:
            # Find when oldest recent post will be > 1 hour old
            oldest_recent = min(recent_posts)
            next_slot = oldest_recent + timedelta(hours=1, minutes=1)
            if next_slot > next_available:
                next_available = next_slot
                
        # Category-specific delays
        category = item.get('category', 'default')
        category_delay = self.category_delays.get(category, self.category_delays['default'])
        
        last_category_post = self.last_post_by_category.get(category)
        if last_category_post:
            category_next = last_category_post + timedelta(seconds=category_delay)
            if category_next > next_available:
                next_available = category_next
                
        # Respect posting windows (simplified - would use proper timezone handling)
        hour = next_available.hour
        is_weekend = next_available.weekday() >= 5
        
        window = self.posting_windows['weekend' if is_weekend else 'weekday']
        
        if hour < window['start_hour']:
            # Schedule for start of posting window
            next_available = next_available.replace(
                hour=window['start_hour'], 
                minute=0, 
                second=0, 
                microsecond=0
            )
        elif hour >= window['end_hour']:
            # Schedule for next day's posting window
            next_day = next_available + timedelta(days=1)
            next_available = next_day.replace(
                hour=window['start_hour'],
                minute=0,
                second=0,
                microsecond=0
            )
            
        return next_available
        
    async def add_item(self, item_data: Dict, score: float, dedupe_store=None) -> bool:
        """Add item to the posting queue with release state validation
        
        Args:
            item_data: Product item data (must include 'release_state')
            score: Item score from scorer
            dedupe_store: DedupeStore instance for validation (optional)
            
        Returns:
            True if added successfully, False otherwise
        """
        try:
            item_id = item_data.get('id')
            release_state = item_data.get('release_state', 'live')
            
            if not item_id:
                logger.error("Cannot add item without ID to queue")
                return False
                
            # Release state validation with dedupe store if provided
            if dedupe_store:
                is_duplicate, dup_id, match_type = await dedupe_store.is_duplicate(item_data)
                
                if is_duplicate and match_type != "state_transition_allowed":
                    logger.debug(f"Item {item_id} blocked by deduplication: {match_type}")
                    return False
                    
                # Add to dedupe store if not duplicate
                await dedupe_store.add(item_data)
                
            # Check if already in queue (consider both ID and state for limited editions)
            queue_key = f"{item_id}_{release_state}" if item_data.get('limited_edition', False) else item_id
            
            if item_id in self.items_by_id:
                existing_item = self.items_by_id[item_id]
                if existing_item.status in [QueueItemStatus.PENDING, QueueItemStatus.PROCESSING]:
                    # Allow if it's a state transition for limited edition
                    if (item_data.get('limited_edition', False) and 
                        existing_item.release_state == 'upcoming' and 
                        release_state == 'live'):
                        logger.info(f"Allowing state transition for {item_id}: upcoming → live")
                    else:
                        logger.debug(f"Item {item_id} already in queue with status {existing_item.status}")
                        return False
                    
            # Check queue size limits
            if len(self.priority_queue) >= self.max_queue_size:
                logger.warning(f"Queue at capacity ({self.max_queue_size}), cannot add more items")
                return False
                
            # Calculate scheduling
            now = datetime.now()
            scheduled_time = self.calculate_next_post_time(item_data)
            priority = self.calculate_priority(score, item_data)
            
            # Create queue item
            queue_item = QueueItem(
                id=item_id,
                score=score,
                item_data=item_data,
                added_at=now,
                scheduled_for=scheduled_time,
                priority=priority,
                release_state=release_state,
                status=QueueItemStatus.PENDING
            )
            
            # Add to queue structures
            heapq.heappush(self.priority_queue, queue_item)
            self.items_by_id[item_id] = queue_item
            
            logger.info(f"Added item {item_id} to queue (score: {score:.1f}, state: {release_state}, scheduled: {scheduled_time})")
            return True
            
        except Exception as e:
            logger.error(f"Error adding item to queue: {e}")
            return False
            
    async def get_next(self) -> Optional[QueueItem]:
        """Get next item ready for posting
        
        Returns:
            Next queue item ready for processing, or None
        """
        try:
            now = datetime.now()
            
            # Clean up completed/old items first
            await self._cleanup_queue()
            
            # Find next ready item
            while self.priority_queue:
                # Peek at top item
                next_item = self.priority_queue[0]
                
                # Check if item is ready
                if (next_item.status == QueueItemStatus.PENDING and 
                    next_item.scheduled_for <= now):
                    
                    # Remove from queue and mark as processing
                    heapq.heappop(self.priority_queue)
                    next_item.status = QueueItemStatus.PROCESSING
                    next_item.last_attempt = now
                    next_item.attempts += 1
                    
                    logger.info(f"Retrieved item {next_item.id} for posting")
                    return next_item
                    
                elif next_item.status != QueueItemStatus.PENDING:
                    # Remove non-pending items
                    heapq.heappop(self.priority_queue)
                    continue
                    
                else:
                    # Next item not ready yet
                    wait_seconds = (next_item.scheduled_for - now).total_seconds()
                    logger.debug(f"Next item ready in {wait_seconds:.0f} seconds")
                    break
                    
            return None
            
        except Exception as e:
            logger.error(f"Error getting next queue item: {e}")
            return None
            
    async def mark_completed(self, item_id: str, success: bool, error_message: str = None):
        """Mark item as completed (success or failure)
        
        Args:
            item_id: Item ID
            success: Whether posting was successful
            error_message: Error message if failed
        """
        try:
            queue_item = self.items_by_id.get(item_id)
            if not queue_item:
                logger.warning(f"Cannot mark unknown item {item_id} as completed")
                return
                
            if success:
                # Mark as completed
                queue_item.status = QueueItemStatus.COMPLETED
                
                # Record posting time for rate limiting
                now = datetime.now()
                self.posting_history.append(now)
                
                # Update category timing
                category = queue_item.item_data.get('category', 'default')
                self.last_post_by_category[category] = now
                
                # Clean up old posting history (keep last 24 hours)
                cutoff = now - timedelta(hours=24)
                self.posting_history = [t for t in self.posting_history if t > cutoff]
                
                logger.info(f"Marked item {item_id} as completed successfully")
                
            else:
                # Handle failure - retry or mark as failed
                if queue_item.attempts < self.max_retries:
                    # Schedule retry
                    retry_delay = self.retry_delays[min(queue_item.attempts - 1, len(self.retry_delays) - 1)]
                    queue_item.scheduled_for = datetime.now() + timedelta(seconds=retry_delay)
                    queue_item.status = QueueItemStatus.PENDING
                    queue_item.error_message = error_message
                    
                    # Re-add to queue
                    heapq.heappush(self.priority_queue, queue_item)
                    
                    logger.info(f"Scheduled retry for item {item_id} in {retry_delay}s (attempt {queue_item.attempts})")
                    
                else:
                    # Max retries exceeded
                    queue_item.status = QueueItemStatus.FAILED
                    queue_item.error_message = error_message
                    
                    logger.error(f"Item {item_id} failed after {queue_item.attempts} attempts: {error_message}")
                    
        except Exception as e:
            logger.error(f"Error marking item completion: {e}")
            
    async def cancel_item(self, item_id: str) -> bool:
        """Cancel a queued item
        
        Args:
            item_id: Item ID to cancel
            
        Returns:
            True if cancelled successfully
        """
        try:
            queue_item = self.items_by_id.get(item_id)
            if not queue_item:
                return False
                
            if queue_item.status in [QueueItemStatus.PENDING, QueueItemStatus.PROCESSING]:
                queue_item.status = QueueItemStatus.CANCELLED
                logger.info(f"Cancelled item {item_id}")
                return True
                
            return False
            
        except Exception as e:
            logger.error(f"Error cancelling item: {e}")
            return False
            
    async def _cleanup_queue(self):
        """Clean up old/completed items from queue"""
        try:
            # Remove completed/failed/cancelled items older than 1 hour
            cutoff_time = datetime.now() - timedelta(hours=1)
            
            # Create new queue without old items
            new_queue = []
            for item in self.priority_queue:
                if (item.status == QueueItemStatus.PENDING or
                    (item.status in [QueueItemStatus.COMPLETED, QueueItemStatus.FAILED, QueueItemStatus.CANCELLED] 
                     and item.added_at > cutoff_time)):
                    new_queue.append(item)
                else:
                    # Remove from lookup
                    self.items_by_id.pop(item.id, None)
                    
            # Rebuild heap
            self.priority_queue = new_queue
            heapq.heapify(self.priority_queue)
            
        except Exception as e:
            logger.error(f"Error during queue cleanup: {e}")
            
    def get_queue_stats(self) -> Dict[str, Any]:
        """Get queue statistics and status with release state breakdown
        
        Returns:
            Statistics dict
        """
        try:
            now = datetime.now()
            
            # Count by status and release state
            status_counts = {}
            state_counts = {}
            ready_count = 0
            limited_edition_count = 0
            
            for item in self.priority_queue:
                status = item.status.value
                status_counts[status] = status_counts.get(status, 0) + 1
                
                state = getattr(item, 'release_state', 'live')
                state_counts[state] = state_counts.get(state, 0) + 1
                
                if item.item_data.get('limited_edition', False):
                    limited_edition_count += 1
                
                if (item.status == QueueItemStatus.PENDING and 
                    item.scheduled_for <= now):
                    ready_count += 1
                    
            # Next scheduled item
            next_item_time = None
            next_item_state = None
            if self.priority_queue:
                pending_items = [item for item in self.priority_queue 
                               if item.status == QueueItemStatus.PENDING]
                if pending_items:
                    next_item = min(pending_items, key=lambda x: x.scheduled_for)
                    next_item_time = next_item.scheduled_for.isoformat()
                    next_item_state = getattr(next_item, 'release_state', 'live')
                    
            # Recent posting rate
            hour_ago = now - timedelta(hours=1)
            recent_posts = len([t for t in self.posting_history if t > hour_ago])
            
            return {
                'total_items': len(self.priority_queue),
                'limited_edition_items': limited_edition_count,
                'status_counts': status_counts,
                'state_counts': state_counts,
                'ready_to_post': ready_count,
                'next_scheduled': next_item_time,
                'next_item_state': next_item_state,
                'posts_last_hour': recent_posts,
                'rate_limit': self.max_posts_per_hour,
                'queue_capacity': f"{len(self.priority_queue)}/{self.max_queue_size}"
            }
            
        except Exception as e:
            logger.error(f"Error getting queue stats: {e}")
            return {'error': str(e)}


# Example usage and testing
async def main():
    """Example usage of queue manager"""
    
    # Sample scored items
    test_items = [
        ({
            'id': 'test_001',
            'title': 'Travis Scott x Nike Air Jordan 1',
            'brand': 'travis scott',
            'category': 'sneakers',
            'limited_edition': True,
            'release_date': datetime.now().isoformat()
        }, 95.0),
        ({
            'id': 'test_002',
            'title': 'Supreme Box Logo Hoodie',
            'brand': 'supreme',
            'category': 'clothing',
            'limited_edition': True,
            'release_date': (datetime.now() - timedelta(hours=1)).isoformat()
        }, 87.0),
        ({
            'id': 'test_003',
            'title': 'PlayStation 5 Console',
            'brand': 'playstation',
            'category': 'gaming',
            'limited_edition': False,
            'release_date': datetime.now().isoformat()
        }, 72.0)
    ]
    
    queue_manager = QueueManager()
    
    print("Queue Manager Demo")
    print("=" * 40)
    
    # Add items to queue
    for item_data, score in test_items:
        success = await queue_manager.add_item(item_data, score)
        print(f"Added {item_data['title'][:30]}... (score: {score}) - {'✓' if success else '✗'}")
        
    # Show queue stats
    stats = queue_manager.get_queue_stats()
    print(f"\nQueue Stats:")
    print(f"  Total items: {stats['total_items']}")
    print(f"  Ready to post: {stats['ready_to_post']}")
    print(f"  Posts last hour: {stats['posts_last_hour']}")
    
    # Simulate getting next item
    next_item = await queue_manager.get_next()
    if next_item:
        print(f"\nNext item to post: {next_item.item_data['title'][:40]}...")
        print(f"  Score: {next_item.score}")
        print(f"  Attempts: {next_item.attempts}")
        
        # Simulate successful posting
        await queue_manager.mark_completed(next_item.id, success=True)
        print(f"  Marked as completed ✓")


if __name__ == "__main__":
    # Run example when file is executed directly
    asyncio.run(main())