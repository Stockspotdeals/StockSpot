#!/usr/bin/env python3
"""
Safe Twitter Engine for StockSpot
Uses safe imports to prevent crashes and provides graceful fallbacks
"""

import os
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Union

# Import safe import utilities
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from src.utils.safe_import import get_tweepy, get_dotenv, validate_environment_vars

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables safely
load_dotenv = get_dotenv()
if load_dotenv:
    load_dotenv()


class TwitterEngine:
    """Safe Twitter posting engine with fallback handling"""
    
    def __init__(self):
        """Initialize Twitter engine with safe imports and validation"""
        # Get Tweepy safely
        self.tweepy = get_tweepy()
        self.client = None
        self.api_v1 = None
        
        # Load and validate credentials
        self.credentials = self._load_credentials()
        self.is_configured = self._validate_credentials()
        
        # Initialize if properly configured
        if self.is_configured:
            self._initialize_client()
        
        logger.info(f"TwitterEngine initialized - Configured: {self.is_configured}")
    
    def _load_credentials(self) -> dict:
        """Load Twitter credentials from environment variables"""
        required_vars = [
            'TWITTER_API_KEY',
            'TWITTER_API_SECRET', 
            'TWITTER_ACCESS_TOKEN',
            'TWITTER_ACCESS_SECRET'
        ]
        
        validation = validate_environment_vars(required_vars)
        
        credentials = {}
        for var in required_vars:
            if validation[var]['set']:
                credentials[var.lower()] = validation[var]['value']
            else:
                logger.warning(f"Missing environment variable: {var}")
                credentials[var.lower()] = None
        
        # Optional bearer token
        bearer_token = os.getenv('TWITTER_BEARER_TOKEN')
        credentials['twitter_bearer_token'] = bearer_token
        
        return credentials
    
    def _validate_credentials(self) -> bool:
        """Check if all required credentials are present"""
        required = [
            'twitter_api_key',
            'twitter_api_secret',
            'twitter_access_token', 
            'twitter_access_secret'
        ]
        
        missing = [key for key in required if not self.credentials.get(key)]
        if missing:
            logger.warning(f"Missing Twitter credentials: {missing}")
            return False
        
        return True
    
    def _initialize_client(self) -> bool:
        """Initialize Twitter API client safely"""
        try:
            if not hasattr(self.tweepy, 'Client'):
                logger.error("Tweepy not available - cannot initialize client")
                return False
            
            # Initialize Twitter API v2 client
            self.client = self.tweepy.Client(
                bearer_token=self.credentials.get('twitter_bearer_token'),
                consumer_key=self.credentials['twitter_api_key'],
                consumer_secret=self.credentials['twitter_api_secret'],
                access_token=self.credentials['twitter_access_token'],
                access_token_secret=self.credentials['twitter_access_secret'],
                wait_on_rate_limit=True
            )
            
            # Initialize API v1.1 for media uploads
            if hasattr(self.tweepy, 'OAuthHandler'):
                auth = self.tweepy.OAuthHandler(
                    self.credentials['twitter_api_key'],
                    self.credentials['twitter_api_secret']
                )
                auth.set_access_token(
                    self.credentials['twitter_access_token'],
                    self.credentials['twitter_access_secret']
                )
                self.api_v1 = self.tweepy.API(auth, wait_on_rate_limit=True)
            
            # Test connection
            user = self.client.get_me()
            if user and hasattr(user, 'data') and user.data:
                username = getattr(user.data, 'username', 'unknown')
                logger.info(f"Twitter client connected successfully: @{username}")
                return True
            else:
                logger.warning("Twitter client connected but user verification failed")
                return True  # Still consider it working
                
        except Exception as e:
            logger.error(f"Failed to initialize Twitter client: {e}")
            return False
    
    def post_tweet(self, text: str, image_path: Optional[str] = None) -> bool:
        """
        Post a tweet to Twitter/X
        
        Args:
            text: Tweet content (max 280 characters)
            image_path: Optional path to image file
            
        Returns:
            bool: True if posted successfully, False otherwise
        """
        if not self.is_configured:
            logger.error("Twitter engine not configured - check credentials")
            return False
        
        if not self.client:
            logger.error("Twitter client not initialized")
            return False
        
        try:
            # Validate text
            if not text or not text.strip():
                logger.error("Tweet text cannot be empty")
                return False
            
            if len(text) > 280:
                logger.error(f"Tweet too long: {len(text)} characters (max 280)")
                return False
            
            media_ids = []
            
            # Upload image if provided
            if image_path and self.api_v1:
                try:
                    if os.path.exists(image_path):
                        media = self.api_v1.media_upload(image_path)
                        media_ids = [media.media_id]
                        logger.info(f"Image uploaded: {image_path}")
                    else:
                        logger.warning(f"Image file not found: {image_path}")
                except Exception as e:
                    logger.error(f"Failed to upload image: {e}")
            
            # Post the tweet
            response = self.client.create_tweet(
                text=text,
                media_ids=media_ids if media_ids else None
            )
            
            if response and hasattr(response, 'data') and response.data:
                tweet_id = response.data.get('id', 'unknown')
                logger.info(f"Tweet posted successfully (ID: {tweet_id})")
                return True
            else:
                logger.error("Twitter API returned no response data")
                return False
                
        except Exception as e:
            if hasattr(self.tweepy, 'TooManyRequests') and isinstance(e, self.tweepy.TooManyRequests):
                logger.error("Twitter rate limit exceeded")
                return False
            elif hasattr(self.tweepy, 'Forbidden') and isinstance(e, self.tweepy.Forbidden):
                logger.error("Twitter API access forbidden")
                return False
            else:
                logger.error(f"Failed to post tweet: {e}")
                return False
    
    def test_post(self, test_message: str = "StockSpot test tweet") -> bool:
        """
        Test the Twitter posting functionality
        
        Args:
            test_message: Test message to use (default test message)
            
        Returns:
            bool: True if test passes, False otherwise
        """
        if not self.is_configured:
            logger.info("Twitter test skipped - not configured")
            return False
        
        if not self.client:
            logger.info("Twitter test skipped - client not initialized")
            return False
        
        # For testing, we'll just validate the setup without actually posting
        try:
            # Test credential validation
            user = self.client.get_me()
            if user and hasattr(user, 'data'):
                logger.info("✅ Twitter test passed - credentials valid")
                return True
            else:
                logger.warning("⚠️ Twitter test partial - credentials work but user info unavailable")
                return True  # Still consider it working
                
        except Exception as e:
            logger.error(f"❌ Twitter test failed: {e}")
            return False
    
    def get_status(self) -> dict:
        """Get current engine status"""
        return {
            'configured': self.is_configured,
            'client_initialized': self.client is not None,
            'tweepy_available': hasattr(self.tweepy, 'Client'),
            'credentials_loaded': bool(self.credentials),
            'api_v1_available': self.api_v1 is not None
        }
    
    def format_deal_tweet(self, deal: dict) -> str:
        """
        Format a deal into a Twitter-optimized post
        
        Args:
            deal: Deal dictionary with title, price, etc.
            
        Returns:
            Formatted tweet text
        """
        title = deal.get('title', 'Great Deal!')
        price = deal.get('price', '')
        original_price = deal.get('original_price', '')
        discount = deal.get('discount_percent', 0)
        url = deal.get('url', deal.get('affiliate_url', ''))
        
        # Create compelling tweet
        emoji = "🔥" if discount > 50 else "💰" if discount > 30 else "🛍️"
        
        # Build price text
        price_text = ""
        if price and original_price:
            price_text = f" ${price} (was ${original_price})"
        elif price:
            price_text = f" ${price}"
        
        # Build discount text  
        discount_text = f" {int(discount)}% OFF" if discount > 0 else ""
        
        # Truncate title if needed
        title_max = 80
        display_title = title[:title_max] + "..." if len(title) > title_max else title
        
        # Build tweet
        tweet_parts = [
            f"{emoji} DEAL:",
            display_title,
            price_text,
            discount_text
        ]
        
        base_tweet = " ".join(filter(None, tweet_parts))
        
        # Add hashtags if there's room
        hashtags = ["#AmazonDeals", "#Savings"]
        if deal.get('category'):
            category_tags = {
                'electronics': '#TechDeals',
                'fashion': '#FashionDeals', 
                'home': '#HomeDeals'
            }
            if deal['category'].lower() in category_tags:
                hashtags.insert(0, category_tags[deal['category'].lower()])
        
        # Reserve space for URL (24 chars for t.co)
        url_space = 24 if url else 0
        available_length = 280 - url_space
        
        # Add hashtags if they fit
        hashtag_text = " " + " ".join(hashtags[:2])  # Limit to 2 hashtags
        if len(base_tweet + hashtag_text) <= available_length:
            base_tweet += hashtag_text
        
        # Ensure we don't exceed length
        if len(base_tweet) > available_length:
            base_tweet = base_tweet[:available_length-3] + "..."
        
        # Add URL if provided
        if url:
            base_tweet += f" {url}"
        
        return base_tweet


# Global engine instance with lazy initialization
_twitter_engine = None


def get_twitter_engine() -> TwitterEngine:
    """Get or create the global Twitter engine instance"""
    global _twitter_engine
    if _twitter_engine is None:
        _twitter_engine = TwitterEngine()
    return _twitter_engine


def post_tweet(text: str, image_path: Optional[str] = None) -> bool:
    """Convenience function to post a tweet"""
    engine = get_twitter_engine()
    return engine.post_tweet(text, image_path)


if __name__ == "__main__":
    # Test the Twitter engine
    print("🐦 Testing Twitter Engine...")
    
    engine = TwitterEngine()
    status = engine.get_status()
    
    print(f"Configuration Status:")
    for key, value in status.items():
        emoji = "✅" if value else "❌"
        print(f"  {emoji} {key}: {value}")
    
    if engine.is_configured:
        test_result = engine.test_post()
        print(f"Test Result: {'✅ PASS' if test_result else '❌ FAIL'}")
    else:
        print("⚠️ Engine not configured - add Twitter credentials to .env file")
    
    print("Twitter engine test complete")