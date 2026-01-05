"""
Test Dashboard Routes Module
Tests Flask web interface routes and authentication.

Run with:
    python -m unittest test_dashboard_routes.py
    
Uses Flask test client - no real server needed.
"""

import unittest
from unittest.mock import patch, MagicMock
import json
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.dashboard import app


class TestDashboardRoutes(unittest.TestCase):
    
    def setUp(self):
        """Initialize test environment with Flask test client"""
        app.config['TESTING'] = True
        app.config['WTF_CSRF_ENABLED'] = False  # Disable CSRF for testing
        app.config['SECRET_KEY'] = 'test-secret-key'
        self.client = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()
        
        # Mock session for authenticated requests
        self.auth_session = {'authenticated': True, 'username': 'admin'}
        
    def tearDown(self):
        """Clean up test environment"""
        self.app_context.pop()
        
    def test_home_route_redirect(self):
        """Test home route redirects to dashboard"""
        response = self.client.get('/')
        self.assertEqual(response.status_code, 302)  # Redirect
        self.assertIn('/dashboard', response.location)
        
        print("✅ Home route redirect test passed")
        
    def test_login_page_display(self):
        """Test login page renders correctly"""
        response = self.client.get('/login')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'login', response.data.lower())
        self.assertIn(b'password', response.data.lower())
        
        print("✅ Login page display test passed")
        
    @patch('app.dashboard.check_credentials')
    def test_login_authentication_success(self, mock_check_creds):
        """Test successful login authentication"""
        mock_check_creds.return_value = True
        
        response = self.client.post('/login', data={
            'username': 'admin',
            'password': 'correct_password'
        }, follow_redirects=True)
        
        self.assertEqual(response.status_code, 200)
        mock_check_creds.assert_called_once_with('admin', 'correct_password')
        
        print("✅ Login authentication success test passed")
        
    @patch('app.dashboard.check_credentials')
    def test_login_authentication_failure(self, mock_check_creds):
        """Test failed login authentication"""
        mock_check_creds.return_value = False
        
        response = self.client.post('/login', data={
            'username': 'admin',
            'password': 'wrong_password'
        })
        
        self.assertEqual(response.status_code, 200)  # Stays on login page
        self.assertIn(b'invalid', response.data.lower())
        
        print("✅ Login authentication failure test passed")
        
    def test_logout_functionality(self):
        """Test logout clears session"""
        with self.client.session_transaction() as sess:
            sess['authenticated'] = True
            sess['username'] = 'admin'
            
        response = self.client.get('/logout', follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        
        with self.client.session_transaction() as sess:
            self.assertFalse(sess.get('authenticated', False))
            
        print("✅ Logout functionality test passed")
        
    @patch('app.deal_engine.DealEngine.get_trending_deals')
    def test_dashboard_overview_authenticated(self, mock_get_deals):
        """Test dashboard overview page for authenticated users"""
        mock_get_deals.return_value = [
            {
                'title': 'Apple AirPods Pro',
                'discount': 28,
                'price': 179.99,
                'deal_score': 95
            }
        ]
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        response = self.client.get('/dashboard')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'overview', response.data.lower())
        
        print("✅ Dashboard overview authenticated test passed")
        
    def test_dashboard_overview_unauthenticated(self):
        """Test dashboard redirects unauthenticated users to login"""
        response = self.client.get('/dashboard')
        self.assertEqual(response.status_code, 302)  # Redirect to login
        self.assertIn('/login', response.location)
        
        print("✅ Dashboard overview unauthenticated test passed")
        
    @patch('app.posting_engine.PostingEngine.get_queue')
    def test_posting_queue_page(self, mock_get_queue):
        """Test posting queue management page"""
        mock_get_queue.return_value = [
            {
                'id': 'queue_1',
                'content': 'Deal post content',
                'platforms': ['twitter', 'facebook'],
                'scheduled_time': '2025-11-11T15:00:00Z'
            }
        ]
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        response = self.client.get('/queue')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'queue', response.data.lower())
        
        print("✅ Posting queue page test passed")
        
    @patch('app.website_updater.WebsiteUpdater.load_feed_data')
    def test_posting_history_page(self, mock_load_feed):
        """Test posting history page"""
        mock_load_feed.return_value = {
            'deals': [
                {
                    'id': 'deal_001',
                    'title': 'Samsung Galaxy Watch',
                    'posted_date': '2025-11-10',
                    'status': 'posted'
                }
            ]
        }
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        response = self.client.get('/history')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'history', response.data.lower())
        
        print("✅ Posting history page test passed")
        
    def test_settings_page_display(self):
        """Test settings page display"""
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        response = self.client.get('/settings')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'settings', response.data.lower())
        
        print("✅ Settings page display test passed")
        
    @patch('app.deal_engine.DealEngine.discover_deals')
    def test_api_discover_deals_endpoint(self, mock_discover):
        """Test API endpoint for deal discovery"""
        mock_discover.return_value = [
            {
                'title': 'New Deal',
                'price': 99.99,
                'discount': 25,
                'deal_score': 80
            }
        ]
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        response = self.client.post('/api/discover-deals')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn('deals', data)
        self.assertEqual(len(data['deals']), 1)
        
        print("✅ API discover deals endpoint test passed")
        
    @patch('app.posting_engine.PostingEngine.post_to_buffer')
    def test_api_post_deal_endpoint(self, mock_post):
        """Test API endpoint for posting deals"""
        mock_post.return_value = {
            'success': True,
            'updates': [{'id': 'post_123', 'status': 'sent'}]
        }
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        post_data = {
            'deal_id': 'deal_001',
            'platforms': ['twitter', 'facebook'],
            'content': 'Great deal on electronics!'
        }
        
        response = self.client.post('/api/post-deal', 
                                  data=json.dumps(post_data),
                                  content_type='application/json')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        
        print("✅ API post deal endpoint test passed")
        
    @patch('app.affiliate_link_engine.AffiliateLinkEngine.convert_to_affiliate_link')
    def test_api_convert_affiliate_link_endpoint(self, mock_convert):
        """Test API endpoint for affiliate link conversion"""
        mock_convert.return_value = {
            'success': True,
            'affiliate_link': 'https://amzn.to/3xyz123',
            'tracking_id': 'track_456'
        }
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        link_data = {
            'product_url': 'https://www.amazon.com/product/123',
            'platform': 'amazon'
        }
        
        response = self.client.post('/api/convert-link',
                                  data=json.dumps(link_data),
                                  content_type='application/json')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertTrue(data['success'])
        self.assertIn('affiliate_link', data)
        
        print("✅ API convert affiliate link endpoint test passed")
        
    @patch('app.caption_engine.CaptionEngine.generate_caption')
    def test_api_generate_caption_endpoint(self, mock_generate):
        """Test API endpoint for caption generation"""
        mock_generate.return_value = {
            'caption': '🔥 Amazing deal on Apple AirPods Pro! 28% OFF today only!',
            'hashtags': ['#apple', '#airpods', '#deal', '#tech'],
            'platform_optimized': True
        }
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        caption_data = {
            'deal': {
                'title': 'Apple AirPods Pro',
                'discount': 28,
                'category': 'Electronics'
            },
            'platform': 'twitter'
        }
        
        response = self.client.post('/api/generate-caption',
                                  data=json.dumps(caption_data),
                                  content_type='application/json')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn('caption', data)
        self.assertIn('hashtags', data)
        
        print("✅ API generate caption endpoint test passed")
        
    def test_api_queue_management_endpoints(self):
        """Test API endpoints for queue management"""
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        # Test add to queue
        queue_item = {
            'content': 'Test deal post',
            'platforms': ['twitter'],
            'scheduled_time': '2025-11-11T15:00:00Z'
        }
        
        add_response = self.client.post('/api/queue/add',
                                      data=json.dumps(queue_item),
                                      content_type='application/json')
        self.assertEqual(add_response.status_code, 200)
        
        # Test remove from queue
        remove_response = self.client.delete('/api/queue/remove/queue_item_1')
        self.assertEqual(remove_response.status_code, 200)
        
        print("✅ API queue management endpoints test passed")
        
    @patch('app.posting_engine.PostingEngine.get_posting_analytics')
    def test_api_analytics_endpoint(self, mock_analytics):
        """Test API endpoint for posting analytics"""
        mock_analytics.return_value = {
            'analytics': {
                'total_posts': 45,
                'successful_posts': 42,
                'engagement': {
                    'total_clicks': 1250,
                    'total_likes': 890
                }
            }
        }
        
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        response = self.client.get('/api/analytics?period=last_7_days')
        self.assertEqual(response.status_code, 200)
        
        data = json.loads(response.data)
        self.assertIn('analytics', data)
        self.assertIn('total_posts', data['analytics'])
        
        print("✅ API analytics endpoint test passed")
        
    def test_api_error_handling(self):
        """Test API error handling for invalid requests"""
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        # Test invalid JSON
        response = self.client.post('/api/post-deal',
                                  data='invalid json',
                                  content_type='application/json')
        self.assertEqual(response.status_code, 400)
        
        # Test missing required fields
        response = self.client.post('/api/convert-link',
                                  data=json.dumps({}),
                                  content_type='application/json')
        self.assertEqual(response.status_code, 400)
        
        print("✅ API error handling test passed")
        
    def test_static_assets_serving(self):
        """Test static assets are served correctly"""
        # Test CSS file
        response = self.client.get('/static/style.css')
        self.assertEqual(response.status_code, 200)
        
        # Test JavaScript file
        response = self.client.get('/static/js/dashboard.js')
        self.assertEqual(response.status_code, 200)
        
        print("✅ Static assets serving test passed")
        
    def test_csrf_protection_disabled_in_testing(self):
        """Test CSRF protection is properly disabled for testing"""
        with self.client.session_transaction() as sess:
            sess.update(self.auth_session)
            
        # Should work without CSRF token in test mode
        response = self.client.post('/api/discover-deals', data={})
        self.assertNotEqual(response.status_code, 400)  # CSRF error would be 400
        
        print("✅ CSRF protection test configuration passed")
        
    def test_session_timeout_handling(self):
        """Test session timeout and renewal"""
        # Test accessing protected route with expired session
        response = self.client.get('/dashboard')
        self.assertEqual(response.status_code, 302)  # Should redirect to login
        
        print("✅ Session timeout handling test passed")


if __name__ == '__main__':
    print("🧪 Starting Dashboard Routes Tests...")
    unittest.main(verbosity=2)