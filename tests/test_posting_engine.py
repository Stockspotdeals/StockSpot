"""
Test Posting Engine Module
Tests social media posting and scheduling using mock data.

Run with:
    python -m unittest test_posting_engine.py
    
No real API credentials required - uses mocked Buffer API responses.
"""

import unittest
from unittest.mock import patch, MagicMock
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.posting_engine import PostingEngine


class TestPostingEngine(unittest.TestCase):
    
    def setUp(self):
        """Initialize test environment"""
        self.posting_engine = PostingEngine()
        
    @patch('requests.post')
    def test_post_to_buffer_api(self, mock_post):
        """Test posting to Buffer API with mocked response"""
        # Mock successful Buffer API response
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'updates': [{
                'id': 'buffer_post_12345',
                'text': 'Test post content',
                'profile_id': 'twitter_profile_123',
                'status': 'buffer',
                'scheduled_at': 1635724800
            }]
        }
        mock_post.return_value = mock_response
        
        post_data = {
            'text': '🔥 Amazing deal on Apple AirPods Pro! 28% OFF - Was $249.99, Now $179.99! #deal #apple #airpods',
            'profile_ids': ['twitter_profile_123', 'facebook_profile_456'],
            'scheduled_at': '2025-11-11T15:30:00Z'
        }
        
        result = self.posting_engine.post_to_buffer(post_data)
        
        self.assertTrue(result['success'])
        self.assertIn('updates', result)
        self.assertEqual(result['updates'][0]['id'], 'buffer_post_12345')
        
        print("✅ Buffer API posting test passed")
        
    def test_schedule_post_for_optimal_time(self):
        """Test optimal posting time calculation"""
        post_content = {
            'caption': 'Great deal on electronics!',
            'hashtags': ['#deal', '#electronics', '#tech'],
            'platform': 'twitter'
        }
        
        optimal_time = self.posting_engine.calculate_optimal_posting_time(
            post_content,
            timezone='America/New_York'
        )
        
        self.assertIsInstance(optimal_time, str)
        self.assertIn('T', optimal_time)  # ISO format
        
        # Should be within reasonable hours (8 AM - 10 PM)
        hour = int(optimal_time.split('T')[1].split(':')[0])
        self.assertGreaterEqual(hour, 8)
        self.assertLessEqual(hour, 22)
        
        print(f"✅ Optimal posting time calculation test passed - Time: {optimal_time}")
        
    @patch('requests.post')
    def test_post_to_multiple_platforms(self, mock_post):
        """Test posting to multiple social media platforms"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'updates': [
                {
                    'id': 'twitter_post_123',
                    'profile_id': 'twitter_profile_123',
                    'status': 'sent'
                },
                {
                    'id': 'facebook_post_456',
                    'profile_id': 'facebook_profile_456',
                    'status': 'sent'
                },
                {
                    'id': 'instagram_post_789',
                    'profile_id': 'instagram_profile_789',
                    'status': 'sent'
                }
            ]
        }
        mock_post.return_value = mock_response
        
        post_content = {
            'deal': {
                'title': 'Samsung Galaxy Watch',
                'discount': 35,
                'current_price': 199.99
            },
            'caption': 'Incredible deal on Samsung Galaxy Watch! 35% off!',
            'hashtags': ['#samsung', '#smartwatch', '#deal'],
            'platforms': ['twitter', 'facebook', 'instagram']
        }
        
        results = self.posting_engine.post_to_multiple_platforms(post_content)
        
        self.assertEqual(len(results['updates']), 3)
        self.assertTrue(all(update['status'] == 'sent' for update in results['updates']))
        
        print(f"✅ Multi-platform posting test passed - Posted to {len(results['updates'])} platforms")
        
    def test_queue_management(self):
        """Test posting queue management functionality"""
        # Add posts to queue
        post1 = {
            'id': 'queue_item_1',
            'content': 'Deal 1 content',
            'platforms': ['twitter'],
            'scheduled_time': '2025-11-11T10:00:00Z'
        }
        
        post2 = {
            'id': 'queue_item_2', 
            'content': 'Deal 2 content',
            'platforms': ['facebook', 'instagram'],
            'scheduled_time': '2025-11-11T14:00:00Z'
        }
        
        self.posting_engine.add_to_queue(post1)
        self.posting_engine.add_to_queue(post2)
        
        # Test queue retrieval
        queue = self.posting_engine.get_queue()
        self.assertEqual(len(queue), 2)
        
        # Test queue item removal
        self.posting_engine.remove_from_queue('queue_item_1')
        updated_queue = self.posting_engine.get_queue()
        self.assertEqual(len(updated_queue), 1)
        
        # Test queue clearing
        self.posting_engine.clear_queue()
        empty_queue = self.posting_engine.get_queue()
        self.assertEqual(len(empty_queue), 0)
        
        print("✅ Queue management test passed")
        
    @patch('requests.get')
    def test_get_posting_analytics(self, mock_get):
        """Test posting analytics retrieval"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'analytics': {
                'total_posts': 45,
                'successful_posts': 42,
                'failed_posts': 3,
                'engagement': {
                    'total_clicks': 1250,
                    'total_likes': 890,
                    'total_shares': 156
                },
                'top_performing_post': {
                    'id': 'post_12345',
                    'clicks': 89,
                    'engagement_rate': 0.067
                }
            }
        }
        mock_get.return_value = mock_response
        
        analytics = self.posting_engine.get_posting_analytics(period='last_7_days')
        
        self.assertIn('analytics', analytics)
        self.assertEqual(analytics['analytics']['total_posts'], 45)
        self.assertEqual(analytics['analytics']['successful_posts'], 42)
        self.assertIn('engagement', analytics['analytics'])
        
        print("✅ Posting analytics test passed")
        
    def test_platform_specific_formatting(self):
        """Test platform-specific content formatting"""
        base_content = {
            'caption': 'Amazing deal on wireless headphones! Perfect for music lovers and gamers. High quality sound with noise cancellation.',
            'hashtags': ['#headphones', '#music', '#gaming', '#deal', '#wireless', '#tech'],
            'deal': {
                'title': 'Sony WH-1000XM4 Headphones',
                'discount': 40
            }
        }
        
        # Twitter formatting (character limit)
        twitter_formatted = self.posting_engine.format_content_for_platform(
            base_content, 
            'twitter'
        )
        self.assertLessEqual(len(twitter_formatted['text']), 280)
        
        # Instagram formatting (more hashtags)
        instagram_formatted = self.posting_engine.format_content_for_platform(
            base_content,
            'instagram'
        )
        self.assertGreaterEqual(len(instagram_formatted['hashtags']), 6)
        
        # Facebook formatting (longer description)
        facebook_formatted = self.posting_engine.format_content_for_platform(
            base_content,
            'facebook'
        )
        self.assertGreater(len(facebook_formatted['text']), 100)
        
        print("✅ Platform-specific formatting test passed")
        
    @patch('requests.post')
    def test_posting_error_handling(self, mock_post):
        """Test error handling for failed API requests"""
        # Mock API failure
        mock_response = MagicMock()
        mock_response.status_code = 429  # Rate limit error
        mock_response.json.return_value = {
            'error': 'Rate limit exceeded',
            'retry_after': 3600
        }
        mock_post.return_value = mock_response
        
        post_data = {
            'text': 'Test post',
            'profile_ids': ['twitter_profile_123']
        }
        
        result = self.posting_engine.post_to_buffer(post_data)
        
        self.assertFalse(result['success'])
        self.assertIn('error', result)
        self.assertIn('retry_after', result)
        
        print("✅ Error handling test passed")
        
    def test_posting_schedule_validation(self):
        """Test posting schedule validation"""
        # Valid schedule
        valid_schedule = {
            'days': ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
            'hours': [9, 12, 15, 18],
            'timezone': 'America/New_York'
        }
        
        self.assertTrue(self.posting_engine.validate_posting_schedule(valid_schedule))
        
        # Invalid schedule (weekend only)
        invalid_schedule = {
            'days': ['saturday', 'sunday'],
            'hours': [2, 3, 4],  # Too early
            'timezone': 'Invalid/Timezone'
        }
        
        self.assertFalse(self.posting_engine.validate_posting_schedule(invalid_schedule))
        
        print("✅ Schedule validation test passed")
        
    @patch('requests.post')
    def test_batch_posting(self, mock_post):
        """Test batch posting of multiple deals"""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'success': True,
            'batch_id': 'batch_12345',
            'updates': [
                {'id': 'post_1', 'status': 'scheduled'},
                {'id': 'post_2', 'status': 'scheduled'},
                {'id': 'post_3', 'status': 'scheduled'}
            ]
        }
        mock_post.return_value = mock_response
        
        batch_posts = [
            {
                'content': 'Deal 1: Electronics sale!',
                'platforms': ['twitter'],
                'scheduled_time': '2025-11-11T10:00:00Z'
            },
            {
                'content': 'Deal 2: Fashion discount!',
                'platforms': ['facebook', 'instagram'],
                'scheduled_time': '2025-11-11T14:00:00Z'
            },
            {
                'content': 'Deal 3: Home appliances!',
                'platforms': ['pinterest'],
                'scheduled_time': '2025-11-11T18:00:00Z'
            }
        ]
        
        result = self.posting_engine.batch_post(batch_posts)
        
        self.assertTrue(result['success'])
        self.assertEqual(len(result['updates']), 3)
        self.assertIn('batch_id', result)
        
        print(f"✅ Batch posting test passed - Processed {len(batch_posts)} posts")
        
    def test_posting_frequency_limits(self):
        """Test posting frequency limit enforcement"""
        # Set daily limit
        daily_limit = 10
        self.posting_engine.set_daily_posting_limit(daily_limit)
        
        # Simulate reaching limit
        for i in range(daily_limit):
            self.posting_engine.track_daily_post()
            
        # Should prevent additional posts
        can_post_more = self.posting_engine.can_post_today()
        self.assertFalse(can_post_more)
        
        # Reset daily count
        self.posting_engine.reset_daily_count()
        can_post_after_reset = self.posting_engine.can_post_today()
        self.assertTrue(can_post_after_reset)
        
        print("✅ Posting frequency limits test passed")
        
    def test_content_duplicate_detection(self):
        """Test duplicate content detection"""
        content1 = "Amazing deal on Apple AirPods Pro! 28% off today only!"
        content2 = "Amazing deal on Apple AirPods Pro! 28% off today only!"  # Exact duplicate
        content3 = "Great savings on Apple AirPods Pro! Save 28% now!"  # Similar but different
        
        # Add first content to history
        self.posting_engine.add_to_content_history(content1)
        
        # Test exact duplicate detection
        is_duplicate_exact = self.posting_engine.is_duplicate_content(content2)
        self.assertTrue(is_duplicate_exact)
        
        # Test similar content detection
        is_duplicate_similar = self.posting_engine.is_duplicate_content(content3)
        self.assertFalse(is_duplicate_similar)  # Should be different enough
        
        print("✅ Duplicate content detection test passed")


if __name__ == '__main__':
    print("🧪 Starting Posting Engine Tests...")
    unittest.main(verbosity=2)