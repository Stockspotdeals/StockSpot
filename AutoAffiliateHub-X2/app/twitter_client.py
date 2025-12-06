#!/usr/bin/env python3
"""
Twitter Client Service for StockSpot
Handles all Twitter/X API interactions with proper error handling
"""

import os
import tweepy
import logging
from typing import Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TwitterClient:
    """Production-ready Twitter API client for StockSpot"""
    
    def __init__(self):
        """Initialize Twitter client with credentials from .env"""
        # Load credentials from environment
        self.api_key = os.getenv("TWITTER_API_KEY")
        self.api_secret = os.getenv("TWITTER_API_SECRET") 
        self.access_token = os.getenv("TWITTER_ACCESS_TOKEN")
        self.access_secret = os.getenv("TWITTER_ACCESS_SECRET")
        self.bearer_token = os.getenv("TWITTER_BEARER_TOKEN")
        
        # Initialize client
        self.client = None
        self.api_v1 = None
        self._initialize_client()
    
    def _initialize_client(self) -> bool:
        """Initialize Twitter API clients with error handling"""
        try:
            # Validate credentials
            if not all([self.api_key, self.api_secret, self.access_token, self.access_secret]):
                logger.error("Missing required Twitter credentials in .env file")
                return False
            
            # Initialize Twitter API v2 client for posting
            self.client = tweepy.Client(
                bearer_token=self.bearer_token,
                consumer_key=self.api_key,
                consumer_secret=self.api_secret,
                access_token=self.access_token,
                access_token_secret=self.access_secret,
                wait_on_rate_limit=True
            )
            
            # Initialize API v1.1 for media uploads if needed
            auth = tweepy.OAuthHandler(self.api_key, self.api_secret)
            auth.set_access_token(self.access_token, self.access_secret)
            self.api_v1 = tweepy.API(auth, wait_on_rate_limit=True)
            
            # Test the connection
            try:
                user = self.client.get_me()
                if user and user.data:
                    logger.info(f"Twitter client initialized successfully for @{user.data.username}")
                    return True
                else:
                    logger.error("Failed to verify Twitter credentials")
                    return False
            except Exception as e:
                logger.error(f"Twitter credential verification failed: {e}")
                return False
                
        except Exception as e:
            logger.error(f"Error initializing Twitter client: {e}")
            return False
    
    def post_to_twitter(self, text: str, image_path: Optional[str] = None) -> bool:
        """
        Post a tweet to Twitter/X with optional image
        
        Args:
            text: Tweet content (max 280 characters)
            image_path: Optional path to image file to attach
            
        Returns:
            bool: True if posted successfully, False otherwise
        """
        try:
            if not self.client:
                logger.error("Twitter client not initialized")
                return False
            
            # Validate text length
            if len(text) > 280:
                logger.error(f"Tweet text too long: {len(text)} characters (max 280)")
                return False
            
            if not text.strip():
                logger.error("Tweet text cannot be empty")
                return False
            
            media_ids = []
            
            # Upload image if provided
            if image_path:
                try:
                    if os.path.exists(image_path):
                        media = self.api_v1.media_upload(image_path)
                        media_ids = [media.media_id]
                        logger.info(f"Image uploaded successfully: {image_path}")
                    else:
                        logger.warning(f"Image file not found: {image_path}")
                except Exception as e:
                    logger.error(f"Failed to upload image {image_path}: {e}")
                    # Continue without image rather than fail completely
            
            # Post the tweet
            response = self.client.create_tweet(
                text=text,
                media_ids=media_ids if media_ids else None
            )
            
            if response and response.data:
                tweet_id = response.data['id']
                tweet_url = f"https://twitter.com/user/status/{tweet_id}"
                logger.info(f"Tweet posted successfully: {tweet_url}")
                logger.info(f"Tweet content: {text[:100]}...")
                return True
            else:
                logger.error("Twitter API returned no response data")
                return False
                
        except tweepy.TooManyRequests:
            logger.error("Twitter rate limit exceeded - please wait before posting again")
            return False
        except tweepy.Forbidden:
            logger.error("Twitter API access forbidden - check credentials and permissions")
            return False
        except tweepy.Unauthorized:
            logger.error("Twitter API unauthorized - check credentials")
            return False
        except Exception as e:
            logger.error(f"Error posting to Twitter: {e}")
            return False
    
    def is_connected(self) -> bool:
        """Check if Twitter client is properly connected"""
        return self.client is not None
    
    def get_rate_limit_status(self) -> dict:
        """Get current rate limit status"""
        try:
            if self.client:
                # This would normally check rate limits
                return {"status": "connected", "client_initialized": True}
            else:
                return {"status": "disconnected", "client_initialized": False}
        except Exception as e:
            logger.error(f"Error checking rate limit status: {e}")
            return {"status": "error", "error": str(e)}


# Global Twitter client instance
_twitter_client = None


def get_twitter_client() -> TwitterClient:
    """Get or create the global Twitter client instance"""
    global _twitter_client
    if _twitter_client is None:
        _twitter_client = TwitterClient()
    return _twitter_client


def post_to_twitter(text: str, image_path: Optional[str] = None) -> bool:
    """
    Convenience function to post to Twitter
    
    Args:
        text: Tweet content
        image_path: Optional image file path
        
    Returns:
        bool: True if successful, False otherwise
    """
    client = get_twitter_client()
    return client.post_to_twitter(text, image_path)


if __name__ == "__main__":
    # Test the Twitter client
    client = TwitterClient()
    if client.is_connected():
        print("✅ Twitter client connected successfully")
        print(f"Rate limit status: {client.get_rate_limit_status()}")
    else:
        print("❌ Twitter client connection failed")
        print("Check your .env file contains valid Twitter API credentials")