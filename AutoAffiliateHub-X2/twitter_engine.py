#!/usr/bin/env python3
"""
StockSpot Twitter/X Posting Engine
Clean implementation focused only on Twitter/X integration
"""

import os
import logging
import time
from datetime import datetime
from typing import Dict, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Set up logging
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


class TwitterClient:
    """Clean Twitter/X client for StockSpot"""
    
    def __init__(self):
        """Initialize Twitter client with credentials from .env"""
        self.api_key = os.getenv('TWITTER_API_KEY')
        self.api_secret = os.getenv('TWITTER_API_SECRET')
        self.access_token = os.getenv('TWITTER_ACCESS_TOKEN')
        self.access_secret = os.getenv('TWITTER_ACCESS_SECRET')
        self.bearer_token = os.getenv('TWITTER_BEARER_TOKEN')
        
        self.client = None
        self.api = None
        self.connected = False
        
        if TWEEPY_AVAILABLE:
            self._initialize_client()
        else:
            logger.warning("Tweepy not available - Twitter client disabled")
    
    def _initialize_client(self):
        """Initialize Twitter API client"""
        if not all([self.api_key, self.api_secret, self.access_token, self.access_secret]):
            logger.error("Missing required Twitter credentials in .env file")
            return
            
        try:
            # Create API client for v2 endpoints
            self.client = tweepy.Client(
                bearer_token=self.bearer_token,
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_secret,
                wait_on_rate_limit=True
            )
            
            # Test connection
            me = self.client.get_me()
            if me.data:
                self.connected = True
                logger.info(f"Twitter client connected as: @{me.data.username}")
            else:
                logger.error("Failed to verify Twitter connection")
                
        except Exception as e:
            logger.error(f"Failed to initialize Twitter client: {e}")
            self.connected = False
    
    def is_connected(self) -> bool:
        """Check if Twitter client is connected"""
        return self.connected and self.client is not None
    
    def post_tweet(self, text: str, image_path: Optional[str] = None) -> bool:
        """
        Post a tweet to Twitter/X
        
        Args:
            text: Tweet content (max 280 characters)
            image_path: Optional path to image file
            
        Returns:
            bool: True if tweet posted successfully
        """
        if not self.is_connected():
            logger.error("Twitter client not connected")
            return False
            
        if not text or len(text.strip()) == 0:
            logger.error("Tweet text cannot be empty")
            return False
            
        if len(text) > 280:
            logger.error(f"Tweet too long: {len(text)} characters (max 280)")
            return False
        
        try:
            media_id = None
            
            # Upload image if provided
            if image_path and os.path.exists(image_path):
                try:
                    # For image uploads, we need the v1.1 API
                    auth = tweepy.OAuthHandler(self.api_key, self.api_secret)
                    auth.set_access_token(self.access_token, self.access_secret)
                    api_v1 = tweepy.API(auth)
                    
                    media = api_v1.media_upload(image_path)
                    media_id = media.media_id
                    logger.info(f"Image uploaded with media ID: {media_id}")
                except Exception as e:
                    logger.warning(f"Failed to upload image: {e}")
            
            # Post tweet
            if media_id:
                response = self.client.create_tweet(text=text, media_ids=[media_id])
            else:
                response = self.client.create_tweet(text=text)
            
            if response.data:
                tweet_id = response.data['id']
                logger.info(f"Tweet posted successfully: {tweet_id}")
                return True
            else:
                logger.error("Failed to post tweet - no response data")
                return False
                
        except Exception as e:
            logger.error(f"Error posting tweet: {e}")
            return False
    
    def format_deal_tweet(self, deal: Dict) -> str:
        """Format a deal dictionary into Twitter-optimized text"""
        title = deal.get('title', 'Great Deal!')
        price = deal.get('price', '')
        original_price = deal.get('original_price', '')
        discount = deal.get('discount_percent', 0)
        url = deal.get('affiliate_url', deal.get('url', ''))
        
        # Create compelling tweet with emoji
        if discount > 50:
            emoji = "🔥"
        elif discount > 30:
            emoji = "💰"
        else:
            emoji = "🛍️"
        
        # Build price display
        if price and original_price:
            price_text = f"${price} (was ${original_price})"
        elif price:
            price_text = f"${price}"
        else:
            price_text = ""
        
        # Build discount display
        discount_text = f"{discount:.0f}% OFF" if discount > 0 else ""
        
        # Construct tweet
        tweet_parts = [
            f"{emoji} DEAL ALERT:",
            title[:80] + "..." if len(title) > 80 else title
        ]
        
        if price_text:
            tweet_parts.append(price_text)
        if discount_text:
            tweet_parts.append(discount_text)
        
        # Add hashtags if space allows
        hashtags = ["#Deal", "#Amazon", "#StockSpot"]
        
        tweet_text = " ".join(tweet_parts)
        
        # Reserve space for URL (24 chars for t.co shortening)
        url_space = 24 if url else 0
        available_space = 280 - len(tweet_text) - url_space - 1  # -1 for space before URL
        
        # Add hashtags that fit
        hashtag_text = ""
        for tag in hashtags:
            if len(hashtag_text + " " + tag) <= available_space:
                hashtag_text += " " + tag
            else:
                break
        
        if hashtag_text:
            tweet_text += hashtag_text
        
        # Add URL if provided
        if url:
            tweet_text += " " + url
        
        # Ensure we don't exceed 280 characters
        if len(tweet_text) > 280:
            excess = len(tweet_text) - 280
            # Remove from title if needed
            if len(title) > 50:
                new_title_length = len(title) - excess - 3
                title = title[:new_title_length] + "..."
                # Rebuild tweet
                tweet_parts[1] = title
                tweet_text = " ".join(tweet_parts) + hashtag_text
                if url:
                    tweet_text += " " + url
        
        return tweet_text


class StockSpotPoster:
    """Main posting engine for StockSpot - Twitter/X only"""
    
    def __init__(self):
        """Initialize posting engine"""
        self.twitter_client = TwitterClient()
        logger.info("StockSpot posting engine initialized (Twitter/X only)")
    
    def post_deal(self, deal: Dict) -> bool:
        """
        Post a deal to Twitter/X
        
        Args:
            deal: Dictionary with deal information
            
        Returns:
            bool: True if posted successfully
        """
        if not self.twitter_client.is_connected():
            logger.error("Twitter client not connected")
            return False
        
        # Format deal as tweet
        tweet_text = self.twitter_client.format_deal_tweet(deal)
        
        # Post to Twitter
        success = self.twitter_client.post_tweet(tweet_text)
        
        if success:
            logger.info(f"Deal posted successfully: {deal.get('title', 'Unknown')}")
        else:
            logger.error(f"Failed to post deal: {deal.get('title', 'Unknown')}")
        
        return success
    
    def send_tweet(self, message: str, image_path: Optional[str] = None) -> bool:
        """
        Send a simple tweet
        
        Args:
            message: Tweet content
            image_path: Optional image path
            
        Returns:
            bool: True if successful
        """
        return self.twitter_client.post_tweet(message, image_path)
    
    def get_status(self) -> Dict:
        """Get posting engine status"""
        return {
            'twitter_connected': self.twitter_client.is_connected(),
            'tweepy_available': TWEEPY_AVAILABLE,
            'enabled_platforms': ['Twitter/X'],
            'ready': self.twitter_client.is_connected()
        }


# Global instances for easy access
_twitter_client = None
_poster = None

def get_twitter_client():
    """Get global Twitter client instance"""
    global _twitter_client
    if _twitter_client is None:
        _twitter_client = TwitterClient()
    return _twitter_client

def get_poster():
    """Get global poster instance"""
    global _poster
    if _poster is None:
        _poster = StockSpotPoster()
    return _poster

def send_tweet(message: str, image_path: Optional[str] = None) -> bool:
    """Convenience function to send a tweet"""
    poster = get_poster()
    return poster.send_tweet(message, image_path)

def post_deal(deal: Dict) -> bool:
    """Convenience function to post a deal"""
    poster = get_poster()
    return poster.post_deal(deal)


# Test function
def test_twitter_connection():
    """Test Twitter connection"""
    print("🐦 Testing Twitter Connection")
    print("-" * 40)
    
    client = TwitterClient()
    
    if client.is_connected():
        print("✅ Twitter connection successful")
        
        # Test posting (commented out to avoid spam)
        # success = client.post_tweet("StockSpot Twitter test")
        # print(f"Test tweet: {'✅ Success' if success else '❌ Failed'}")
        
        return True
    else:
        print("❌ Twitter connection failed")
        return False


if __name__ == '__main__':
    test_twitter_connection()