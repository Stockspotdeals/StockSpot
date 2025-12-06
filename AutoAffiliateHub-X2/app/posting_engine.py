import os
import logging
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import hashlib
import json

# Set up logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Safe tweepy import
try:
    import tweepy
    TWEEPY_AVAILABLE = True
    logger.info("Tweepy imported successfully")
except ImportError as e:
    tweepy = None
    TWEEPY_AVAILABLE = False
    logger.warning(f"Tweepy not available: {e}")

# Safe import of Twitter client service
try:
    from .twitter_client import get_twitter_client
    TWITTER_CLIENT_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Twitter client not available: {e}")
    TWITTER_CLIENT_AVAILABLE = False
    
    def get_twitter_client():
        """Fallback Twitter client"""
        class MockTwitterClient:
            def is_connected(self):
                return False
            def post_tweet(self, message, image_path=None):
                return False
        return MockTwitterClient()

class PostingEngine:
    """Twitter/X posting engine for StockSpot deals"""
    
    def __init__(self):
        """Initialize the Twitter-only posting engine."""
        # Get Twitter client service
        self.twitter_client = get_twitter_client()
        
        # Posting configuration
        self.max_tweet_length = 280
        self.rate_limit_delay = 1  # seconds between tweets
        self.max_hashtags = 3
        
        # Posting history and queue
        self.posting_history = []
        self.posting_queue = []
        
        logger.info("PostingEngine initialized (Twitter/X only)")
        
        if self.twitter_client.is_connected():
            logger.info("Twitter client connected successfully")
        else:
            logger.warning("Twitter client not connected - check credentials")
    
    def format_deal_tweet(self, deal: Dict) -> str:
        """Format a deal into a Twitter-optimized post."""
        title = deal.get('title', 'Great Deal!')
        price = deal.get('price')
        original_price = deal.get('original_price')
        discount = deal.get('discount_percent', 0)
        affiliate_url = deal.get('affiliate_url', deal.get('url'))
        
        # Create compelling tweet text
        emoji = "🔥" if discount > 50 else "💰" if discount > 30 else "🛍️"
        
        # Build price text
        price_text = ""
        if price and original_price:
            price_text = f" ${price} (was ${original_price})"
        elif price:
            price_text = f" ${price}"
        
        # Build discount text
        discount_text = f" {discount:.0f}% OFF" if discount > 0 else ""
        
        # Create base tweet
        tweet_parts = [
            f"{emoji} DEAL ALERT:",
            title[:80] + "..." if len(title) > 80 else title,
            price_text,
            discount_text
        ]
        
        # Join non-empty parts
        tweet_text = " ".join(filter(None, tweet_parts))
        
        # Add hashtags if there's room
        hashtags = self._generate_hashtags(deal)
        hashtag_text = " ".join(hashtags)
        
        # Reserve space for URL (23 characters for t.co)
        url_length = 24  # Twitter's t.co URL length + space
        available_length = self.max_tweet_length - url_length
        
        if len(tweet_text + " " + hashtag_text) <= available_length:
            tweet_text += " " + hashtag_text
        elif len(tweet_text) + len(hashtags[0] if hashtags else "") <= available_length:
            # Try with fewer hashtags
            tweet_text += " " + hashtags[0] if hashtags else ""
        
        # Ensure we don't exceed length even without hashtags
        if len(tweet_text) > available_length:
            tweet_text = tweet_text[:available_length-3] + "..."
        
        # Add URL
        if affiliate_url:
            tweet_text += f" {affiliate_url}"
        
        return tweet_text
    
    def _generate_hashtags(self, deal: Dict) -> List[str]:
        """Generate relevant hashtags for a deal."""
        hashtags = []
        
        # Category-based hashtags
        category = deal.get('category', '').lower()
        category_map = {
            'electronics': ['#TechDeals', '#Electronics'],
            'fashion': ['#FashionDeals', '#Style'],
            'home': ['#HomeDeals', '#Decor'],
            'beauty': ['#BeautyDeals', '#Skincare'],
            'sports': ['#FitnessDeals', '#Sports'],
            'books': ['#BookDeals', '#Reading'],
            'gaming': ['#GamingDeals', '#Games']
        }
        
        if category in category_map:
            hashtags.extend(category_map[category])
        
        # Discount-based hashtags
        discount = deal.get('discount_percent', 0)
        if discount >= 50:
            hashtags.append('#HalfPrice')
        elif discount >= 30:
            hashtags.append('#BigSavings')
        
        # General hashtags
        hashtags.extend(['#AmazonDeals', '#Savings'])
        
        # Limit to max hashtags and ensure they start with #
        hashtags = [tag if tag.startswith('#') else f"#{tag}" for tag in hashtags]
        return hashtags[:self.max_hashtags]
    
    def post_deal_to_twitter(self, deal: Dict) -> bool:
        """Post a single deal to Twitter/X."""
        if not self.twitter_client.is_connected():
            logger.error("Twitter client not connected")
            return False
        
        try:
            tweet_text = self.format_deal_tweet(deal)
            
            # Use our Twitter client service
            success = self.twitter_client.post_to_twitter(tweet_text)
            
            if success:
                # Log successful post
                post_record = {
                    'deal_id': deal.get('id', hashlib.md5(str(deal).encode()).hexdigest()[:8]),
                    'deal_title': deal.get('title'),
                    'tweet_text': tweet_text,
                    'posted_at': datetime.now().isoformat(),
                    'platform': 'twitter'
                }
                
                self.posting_history.append(post_record)
                logger.info(f"Successfully posted deal to Twitter: {deal.get('title')}")
                return True
            else:
                logger.error("Failed to post to Twitter")
                return False
                
        except Exception as e:
            logger.error(f"Error posting to Twitter: {str(e)}")
            return False
    
    def post_deals(self, deals: List[Dict]) -> Dict:
        """Post multiple deals to Twitter with rate limiting."""
        results = {
            'total': len(deals),
            'successful': 0,
            'failed': 0,
            'errors': []
        }
        
        for deal in deals:
            try:
                if self.post_deal_to_twitter(deal):
                    results['successful'] += 1
                else:
                    results['failed'] += 1
                
                # Rate limiting: wait between posts
                if results['successful'] + results['failed'] < len(deals):
                    time.sleep(self.rate_limit_delay)
                    
            except Exception as e:
                error_msg = f"Error posting deal {deal.get('title', 'Unknown')}: {str(e)}"
                logger.error(error_msg)
                results['errors'].append(error_msg)
                results['failed'] += 1
        
        logger.info(f"Posting complete: {results['successful']} successful, {results['failed']} failed")
        return results
    
    def get_posting_history(self, limit: int = 50) -> List[Dict]:
        """Get recent posting history."""
        return self.posting_history[-limit:] if self.posting_history else []
    
    def get_posting_stats(self) -> Dict:
        """Get posting statistics."""
        today = datetime.now().date()
        today_posts = [
            post for post in self.posting_history 
            if datetime.fromisoformat(post['posted_at']).date() == today
        ]
        
        return {
            'total_posts': len(self.posting_history),
            'posts_today': len(today_posts),
            'last_post': self.posting_history[-1] if self.posting_history else None,
            'platforms': ['twitter']  # Only Twitter now
        }
    
    def add_to_queue(self, deal: Dict, schedule_time: Optional[datetime] = None):
        """Add a deal to the posting queue."""
        queue_item = {
            'deal': deal,
            'schedule_time': schedule_time or datetime.now(),
            'status': 'queued',
            'created_at': datetime.now().isoformat()
        }
        self.posting_queue.append(queue_item)
        logger.info(f"Added deal to queue: {deal.get('title')}")
    
    def process_queue(self) -> Dict:
        """Process queued deals that are ready to post."""
        results = {
            'processed': 0,
            'successful': 0,
            'failed': 0,
            'remaining': 0
        }
        
        now = datetime.now()
        ready_items = []
        remaining_items = []
        
        # Separate ready and future items
        for item in self.posting_queue:
            if item['status'] == 'queued' and item['schedule_time'] <= now:
                ready_items.append(item)
            else:
                remaining_items.append(item)
        
        # Process ready items
        for item in ready_items:
            try:
                if self.post_deal_to_twitter(item['deal']):
                    item['status'] = 'posted'
                    item['posted_at'] = datetime.now().isoformat()
                    results['successful'] += 1
                else:
                    item['status'] = 'failed'
                    results['failed'] += 1
                    
                results['processed'] += 1
                
                # Rate limiting between posts
                if len(ready_items) > 1:
                    time.sleep(self.rate_limit_delay)
                    
            except Exception as e:
                logger.error(f"Error processing queue item: {str(e)}")
                item['status'] = 'failed'
                item['error'] = str(e)
                results['failed'] += 1
                results['processed'] += 1
        
        # Update queue with remaining items
        self.posting_queue = remaining_items
        results['remaining'] = len(remaining_items)
        
        logger.info(f"Queue processing complete: {results['processed']} processed, {results['remaining']} remaining")
        return results
    
    def get_queue_status(self) -> Dict:
        """Get current queue status."""
        now = datetime.now()
        
        status_counts = {}
        ready_count = 0
        
        for item in self.posting_queue:
            status = item['status']
            status_counts[status] = status_counts.get(status, 0) + 1
            
            if status == 'queued' and item['schedule_time'] <= now:
                ready_count += 1
        
        return {
            'total_items': len(self.posting_queue),
            'ready_to_post': ready_count,
            'status_breakdown': status_counts,
            'next_scheduled': min([item['schedule_time'] for item in self.posting_queue if item['status'] == 'queued'], default=None)
        }
    
    def clear_queue(self, status_filter: Optional[str] = None):
        """Clear the posting queue, optionally filtering by status."""
        if status_filter:
            self.posting_queue = [item for item in self.posting_queue if item['status'] != status_filter]
            logger.info(f"Cleared queue items with status: {status_filter}")
        else:
            self.posting_queue.clear()
            logger.info("Cleared entire posting queue")
    
    def validate_configuration(self) -> Dict:
        """Validate the posting engine configuration."""
        validation = {
            'twitter_configured': self._validate_twitter_credentials(),
            'twitter_connected': bool(self.twitter_client),
            'queue_size': len(self.posting_queue),
            'history_size': len(self.posting_history)
        }
        
        validation['overall_status'] = 'ready' if validation['twitter_configured'] and validation['twitter_connected'] else 'not_ready'
        
        return validation


# Global function for easy access
def send_tweet(message: str, image_path: Optional[str] = None) -> bool:
    """
    Send a tweet using the posting engine
    
    Args:
        message: Tweet content (max 280 characters)
        image_path: Optional path to image file
        
    Returns:
        bool: True if tweet was sent successfully, False otherwise
    """
    try:
        if not TWEEPY_AVAILABLE:
            logger.error("Cannot send tweet: Tweepy not available")
            return False
            
        if not TWITTER_CLIENT_AVAILABLE:
            logger.error("Cannot send tweet: Twitter client not available")
            return False
        
        # Validate message length
        if not message or len(message.strip()) == 0:
            logger.error("Cannot send empty tweet")
            return False
            
        if len(message) > 280:
            logger.error(f"Tweet too long: {len(message)} characters (max 280)")
            return False
        
        # Initialize posting engine and send tweet
        engine = PostingEngine()
        
        if not engine.twitter_client.is_connected():
            logger.error("Twitter client not connected - check credentials")
            return False
            
        success = engine.twitter_client.post_tweet(message, image_path)
        
        if success:
            logger.info(f"Tweet sent successfully: {message[:50]}...")
            return True
        else:
            logger.error("Failed to send tweet")
            return False
            
    except Exception as e:
        logger.error(f"Error sending tweet: {e}")
        return False