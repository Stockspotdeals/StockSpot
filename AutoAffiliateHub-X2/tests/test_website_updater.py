"""
Test Website Updater Module
Tests website feed management and JSON persistence.

Run with:
    python -m unittest test_website_updater.py
    
No external dependencies - uses mocked file system operations.
"""

import unittest
from unittest.mock import patch, mock_open, MagicMock
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.website_updater import WebsiteUpdater


class TestWebsiteUpdater(unittest.TestCase):
    
    def setUp(self):
        """Initialize test environment"""
        self.website_updater = WebsiteUpdater()
        
        # Mock feed data for testing
        self.mock_feed_data = {
            'deals': [
                {
                    'id': 'deal_001',
                    'title': 'Apple AirPods Pro - 28% OFF',
                    'description': 'Premium noise-canceling earbuds with spatial audio',
                    'price': 179.99,
                    'original_price': 249.99,
                    'discount_percentage': 28,
                    'affiliate_link': 'https://amzn.to/3xyz123',
                    'image_url': 'https://example.com/airpods.jpg',
                    'category': 'Electronics',
                    'brand': 'Apple',
                    'rating': 4.8,
                    'deal_score': 95,
                    'expiry_date': '2025-11-15',
                    'posted_date': '2025-11-11',
                    'status': 'active'
                },
                {
                    'id': 'deal_002',
                    'title': 'Samsung Galaxy Watch - 35% OFF',
                    'description': 'Advanced fitness tracking with health monitoring',
                    'price': 199.99,
                    'original_price': 299.99,
                    'discount_percentage': 35,
                    'affiliate_link': 'https://amzn.to/3abc456',
                    'image_url': 'https://example.com/galaxy-watch.jpg',
                    'category': 'Wearables',
                    'brand': 'Samsung',
                    'rating': 4.6,
                    'deal_score': 88,
                    'expiry_date': '2025-11-18',
                    'posted_date': '2025-11-10',
                    'status': 'active'
                }
            ],
            'metadata': {
                'last_updated': '2025-11-11T10:30:00Z',
                'total_deals': 2,
                'active_deals': 2,
                'expired_deals': 0
            }
        }
        
    @patch('builtins.open', new_callable=mock_open, read_data='{"deals": [], "metadata": {}}')
    @patch('os.path.exists', return_value=True)
    def test_load_feed_data(self, mock_exists, mock_file):
        """Test loading feed data from JSON file"""
        feed_data = self.website_updater.load_feed_data()
        
        self.assertIn('deals', feed_data)
        self.assertIn('metadata', feed_data)
        mock_file.assert_called_once()
        
        print("✅ Feed data loading test passed")
        
    @patch('builtins.open', new_callable=mock_open)
    @patch('os.path.exists', return_value=False)
    def test_create_new_feed_file(self, mock_exists, mock_file):
        """Test creating new feed file when it doesn't exist"""
        feed_data = self.website_updater.load_feed_data()
        
        # Should create default structure
        self.assertEqual(feed_data['deals'], [])
        self.assertIn('metadata', feed_data)
        self.assertEqual(feed_data['metadata']['total_deals'], 0)
        
        print("✅ New feed file creation test passed")
        
    @patch('builtins.open', new_callable=mock_open)
    def test_save_feed_data(self, mock_file):
        """Test saving feed data to JSON file"""
        self.website_updater.save_feed_data(self.mock_feed_data)
        
        mock_file.assert_called_once_with('data/website_feed.json', 'w', encoding='utf-8')
        
        # Verify JSON was written
        written_content = mock_file().write.call_args_list
        self.assertTrue(len(written_content) > 0)
        
        print("✅ Feed data saving test passed")
        
    def test_add_deal_to_feed(self):
        """Test adding new deal to feed"""
        new_deal = {
            'id': 'deal_003',
            'title': 'Sony WH-1000XM4 Headphones - 40% OFF',
            'description': 'Industry-leading noise canceling headphones',
            'price': 199.99,
            'original_price': 329.99,
            'discount_percentage': 40,
            'affiliate_link': 'https://amzn.to/3def789',
            'category': 'Audio',
            'brand': 'Sony',
            'rating': 4.9,
            'deal_score': 92
        }
        
        updated_feed = self.website_updater.add_deal_to_feed(
            self.mock_feed_data.copy(),
            new_deal
        )
        
        self.assertEqual(len(updated_feed['deals']), 3)
        self.assertEqual(updated_feed['metadata']['total_deals'], 3)
        
        # Verify new deal is added
        added_deal = next(deal for deal in updated_feed['deals'] if deal['id'] == 'deal_003')
        self.assertEqual(added_deal['title'], new_deal['title'])
        
        print("✅ Add deal to feed test passed")
        
    def test_remove_deal_from_feed(self):
        """Test removing deal from feed"""
        updated_feed = self.website_updater.remove_deal_from_feed(
            self.mock_feed_data.copy(),
            'deal_001'
        )
        
        self.assertEqual(len(updated_feed['deals']), 1)
        self.assertEqual(updated_feed['metadata']['total_deals'], 1)
        
        # Verify correct deal was removed
        remaining_deal = updated_feed['deals'][0]
        self.assertEqual(remaining_deal['id'], 'deal_002')
        
        print("✅ Remove deal from feed test passed")
        
    def test_update_deal_status(self):
        """Test updating deal status (active/expired/sold_out)"""
        updated_feed = self.website_updater.update_deal_status(
            self.mock_feed_data.copy(),
            'deal_001',
            'expired'
        )
        
        # Find updated deal
        updated_deal = next(deal for deal in updated_feed['deals'] if deal['id'] == 'deal_001')
        self.assertEqual(updated_deal['status'], 'expired')
        
        print("✅ Deal status update test passed")
        
    def test_filter_deals_by_category(self):
        """Test filtering deals by category"""
        electronics_deals = self.website_updater.filter_deals_by_category(
            self.mock_feed_data['deals'],
            'Electronics'
        )
        
        self.assertEqual(len(electronics_deals), 1)
        self.assertEqual(electronics_deals[0]['category'], 'Electronics')
        
        print("✅ Deal filtering by category test passed")
        
    def test_sort_deals_by_score(self):
        """Test sorting deals by deal score"""
        sorted_deals = self.website_updater.sort_deals_by_score(
            self.mock_feed_data['deals']
        )
        
        # Should be sorted by deal_score descending
        self.assertEqual(sorted_deals[0]['deal_score'], 95)  # Apple AirPods
        self.assertEqual(sorted_deals[1]['deal_score'], 88)  # Samsung Watch
        
        print("✅ Deal sorting by score test passed")
        
    def test_get_top_deals(self):
        """Test getting top N deals"""
        top_deals = self.website_updater.get_top_deals(
            self.mock_feed_data['deals'],
            limit=1
        )
        
        self.assertEqual(len(top_deals), 1)
        self.assertEqual(top_deals[0]['deal_score'], 95)
        
        print("✅ Top deals retrieval test passed")
        
    def test_validate_deal_data(self):
        """Test deal data validation"""
        # Valid deal
        valid_deal = {
            'id': 'deal_valid',
            'title': 'Valid Deal',
            'price': 99.99,
            'original_price': 149.99,
            'affiliate_link': 'https://example.com/link',
            'category': 'Electronics'
        }
        
        self.assertTrue(self.website_updater.validate_deal_data(valid_deal))
        
        # Invalid deal (missing required fields)
        invalid_deal = {
            'id': 'deal_invalid',
            'title': 'Invalid Deal'
            # Missing price, original_price, affiliate_link, category
        }
        
        self.assertFalse(self.website_updater.validate_deal_data(invalid_deal))
        
        print("✅ Deal data validation test passed")
        
    def test_generate_rss_feed(self):
        """Test RSS feed generation"""
        rss_content = self.website_updater.generate_rss_feed(
            self.mock_feed_data['deals'][:1]  # Use first deal only
        )
        
        # Should contain RSS structure
        self.assertIn('<?xml version="1.0"', rss_content)
        self.assertIn('<rss version="2.0"', rss_content)
        self.assertIn('<title>Apple AirPods Pro - 28% OFF</title>', rss_content)
        self.assertIn('<description>', rss_content)
        
        print("✅ RSS feed generation test passed")
        
    def test_generate_sitemap(self):
        """Test sitemap generation for SEO"""
        sitemap_content = self.website_updater.generate_sitemap(
            self.mock_feed_data['deals']
        )
        
        # Should contain sitemap structure
        self.assertIn('<?xml version="1.0"', sitemap_content)
        self.assertIn('<urlset', sitemap_content)
        self.assertIn('<url>', sitemap_content)
        self.assertIn('<loc>', sitemap_content)
        
        print("✅ Sitemap generation test passed")
        
    @patch('builtins.open', new_callable=mock_open)
    def test_backup_feed_data(self, mock_file):
        """Test creating backup of feed data"""
        self.website_updater.backup_feed_data(self.mock_feed_data)
        
        # Should create backup file with timestamp
        mock_file.assert_called()
        call_args = str(mock_file.call_args)
        self.assertIn('backup', call_args)
        
        print("✅ Feed data backup test passed")
        
    def test_deal_expiry_check(self):
        """Test checking for expired deals"""
        from datetime import datetime, timedelta
        
        # Create deals with different expiry dates
        test_deals = [
            {
                'id': 'deal_expired',
                'title': 'Expired Deal',
                'expiry_date': (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
            },
            {
                'id': 'deal_active',
                'title': 'Active Deal', 
                'expiry_date': (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
            }
        ]
        
        expired_deals = self.website_updater.get_expired_deals(test_deals)
        active_deals = self.website_updater.get_active_deals(test_deals)
        
        self.assertEqual(len(expired_deals), 1)
        self.assertEqual(len(active_deals), 1)
        self.assertEqual(expired_deals[0]['id'], 'deal_expired')
        
        print("✅ Deal expiry check test passed")
        
    def test_deal_performance_analytics(self):
        """Test deal performance analytics"""
        # Mock click tracking data
        deal_analytics = {
            'deal_001': {'clicks': 156, 'conversions': 12},
            'deal_002': {'clicks': 89, 'conversions': 7}
        }
        
        performance_report = self.website_updater.generate_performance_report(
            self.mock_feed_data['deals'],
            deal_analytics
        )
        
        self.assertIn('total_deals', performance_report)
        self.assertIn('total_clicks', performance_report)
        self.assertIn('total_conversions', performance_report)
        self.assertIn('conversion_rate', performance_report)
        self.assertIn('top_performing_deals', performance_report)
        
        print("✅ Deal performance analytics test passed")
        
    def test_feed_optimization(self):
        """Test feed optimization (remove duplicates, sort, limit)"""
        # Create feed with duplicates and low-scoring deals
        unoptimized_feed = {
            'deals': [
                {'id': 'deal_1', 'title': 'Deal A', 'deal_score': 60},
                {'id': 'deal_2', 'title': 'Deal B', 'deal_score': 95},
                {'id': 'deal_3', 'title': 'Deal A', 'deal_score': 60},  # Duplicate title
                {'id': 'deal_4', 'title': 'Deal C', 'deal_score': 30},  # Low score
                {'id': 'deal_5', 'title': 'Deal D', 'deal_score': 85}
            ]
        }
        
        optimized_feed = self.website_updater.optimize_feed(
            unoptimized_feed,
            min_score=50,
            max_deals=3,
            remove_duplicates=True
        )
        
        # Should remove duplicates and low-scoring deals
        self.assertLessEqual(len(optimized_feed['deals']), 3)
        
        # Should be sorted by score
        scores = [deal['deal_score'] for deal in optimized_feed['deals']]
        self.assertEqual(scores, sorted(scores, reverse=True))
        
        print("✅ Feed optimization test passed")


if __name__ == '__main__':
    print("🧪 Starting Website Updater Tests...")
    unittest.main(verbosity=2)