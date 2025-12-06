#!/usr/bin/env python3
"""
Integration tests for StockSpot Twitter functionality
Tests the Twitter posting service with mock data
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'app'))

from twitter_client import TwitterClient, post_to_twitter


class TestTwitterIntegration(unittest.TestCase):
    """Test Twitter posting functionality"""
    
    def setUp(self):
        """Set up test environment"""
        # Mock environment variables
        self.env_patcher = patch.dict(os.environ, {
            'TWITTER_API_KEY': 'test_api_key',
            'TWITTER_API_SECRET': 'test_api_secret', 
            'TWITTER_ACCESS_TOKEN': 'test_access_token',
            'TWITTER_ACCESS_SECRET': 'test_access_secret',
            'TWITTER_BEARER_TOKEN': 'test_bearer_token'
        })
        self.env_patcher.start()
    
    def tearDown(self):
        """Clean up test environment"""
        self.env_patcher.stop()
    
    @patch('twitter_client.tweepy')
    def test_twitter_client_initialization(self, mock_tweepy):
        """Test that TwitterClient initializes without errors"""
        # Mock tweepy components
        mock_client = MagicMock()
        mock_api = MagicMock()
        mock_user = MagicMock()
        mock_user.data.username = 'test_user'
        
        mock_tweepy.Client.return_value = mock_client
        mock_tweepy.API.return_value = mock_api
        mock_tweepy.OAuthHandler.return_value = MagicMock()
        mock_client.get_me.return_value = mock_user
        
        # Test initialization
        try:
            client = TwitterClient()
            self.assertIsNotNone(client)
            self.assertTrue(client.is_connected())
        except Exception as e:
            self.fail(f"TwitterClient initialization failed: {e}")
    
    @patch('twitter_client.tweepy')
    def test_post_to_twitter_success(self, mock_tweepy):
        """Test successful Twitter posting"""
        # Mock successful response
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = {'id': '123456789'}
        
        mock_client.create_tweet.return_value = mock_response
        mock_client.get_me.return_value = MagicMock()
        mock_client.get_me.return_value.data.username = 'test_user'
        
        mock_tweepy.Client.return_value = mock_client
        mock_tweepy.API.return_value = MagicMock()
        mock_tweepy.OAuthHandler.return_value = MagicMock()
        
        # Test posting
        try:
            client = TwitterClient()
            result = client.post_to_twitter("Test tweet from StockSpot integration test")
            self.assertTrue(result, "Tweet posting should succeed with mocked response")
        except Exception as e:
            self.fail(f"Twitter posting failed: {e}")
    
    @patch('twitter_client.tweepy')
    def test_post_to_twitter_with_long_message(self, mock_tweepy):
        """Test posting with message that exceeds Twitter limit"""
        # Mock client setup
        mock_client = MagicMock()
        mock_client.get_me.return_value = MagicMock()
        mock_client.get_me.return_value.data.username = 'test_user'
        
        mock_tweepy.Client.return_value = mock_client
        mock_tweepy.API.return_value = MagicMock()
        mock_tweepy.OAuthHandler.return_value = MagicMock()
        
        # Test with long message (over 280 characters)
        long_message = "This is a test message " * 20  # Way over 280 characters
        
        try:
            client = TwitterClient()
            result = client.post_to_twitter(long_message)
            self.assertFalse(result, "Long message should fail validation")
        except Exception as e:
            self.fail(f"Long message test failed with exception: {e}")
    
    @patch('twitter_client.tweepy')  
    def test_post_to_twitter_empty_message(self, mock_tweepy):
        """Test posting with empty message"""
        # Mock client setup
        mock_client = MagicMock()
        mock_client.get_me.return_value = MagicMock()
        mock_client.get_me.return_value.data.username = 'test_user'
        
        mock_tweepy.Client.return_value = mock_client
        mock_tweepy.API.return_value = MagicMock()
        mock_tweepy.OAuthHandler.return_value = MagicMock()
        
        try:
            client = TwitterClient()
            result = client.post_to_twitter("")
            self.assertFalse(result, "Empty message should fail validation")
        except Exception as e:
            self.fail(f"Empty message test failed with exception: {e}")
    
    @patch('twitter_client.tweepy')
    def test_convenience_function(self, mock_tweepy):
        """Test the convenience post_to_twitter function"""
        # Mock successful response
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = {'id': '123456789'}
        
        mock_client.create_tweet.return_value = mock_response
        mock_client.get_me.return_value = MagicMock()
        mock_client.get_me.return_value.data.username = 'test_user'
        
        mock_tweepy.Client.return_value = mock_client
        mock_tweepy.API.return_value = MagicMock()
        mock_tweepy.OAuthHandler.return_value = MagicMock()
        
        try:
            result = post_to_twitter("Test convenience function")
            self.assertTrue(result, "Convenience function should work")
        except Exception as e:
            self.fail(f"Convenience function failed: {e}")
    
    def test_missing_credentials(self):
        """Test behavior with missing credentials"""
        # Clear environment variables
        with patch.dict(os.environ, {}, clear=True):
            try:
                client = TwitterClient()
                self.assertFalse(client.is_connected(), "Should fail with missing credentials")
            except Exception as e:
                # This is acceptable - missing credentials should cause issues
                pass


class TestStockSpotIntegration(unittest.TestCase):
    """Test complete StockSpot integration"""
    
    @patch('twitter_client.tweepy')
    def test_deal_posting_workflow(self, mock_tweepy):
        """Test posting a stock deal to Twitter"""
        # Mock Twitter client
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.data = {'id': '123456789'}
        
        mock_client.create_tweet.return_value = mock_response
        mock_client.get_me.return_value = MagicMock()
        mock_client.get_me.return_value.data.username = 'stockspot_test'
        
        mock_tweepy.Client.return_value = mock_client
        mock_tweepy.API.return_value = MagicMock()
        mock_tweepy.OAuthHandler.return_value = MagicMock()
        
        # Set up environment
        with patch.dict(os.environ, {
            'TWITTER_API_KEY': 'test_key',
            'TWITTER_API_SECRET': 'test_secret',
            'TWITTER_ACCESS_TOKEN': 'test_token',
            'TWITTER_ACCESS_SECRET': 'test_token_secret'
        }):
            try:
                # Test a realistic deal posting scenario
                deal_message = "🔥 DEAL ALERT: Amazon Echo Dot (5th Gen) $24.99 (was $49.99) 50% OFF #TechDeals #AmazonDeals https://amazon.com/dp/test123"
                
                result = post_to_twitter(deal_message)
                self.assertTrue(result, "Deal posting should succeed")
                
                # Verify the tweet was attempted with correct content
                mock_client.create_tweet.assert_called_once()
                call_args = mock_client.create_tweet.call_args
                self.assertIn(deal_message, str(call_args))
                
            except Exception as e:
                self.fail(f"Deal posting integration test failed: {e}")


if __name__ == '__main__':
    # Run the tests
    print("🧪 Running StockSpot Twitter Integration Tests...")
    unittest.main(verbosity=2)