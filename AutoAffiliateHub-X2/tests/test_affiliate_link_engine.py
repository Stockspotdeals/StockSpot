#!/usr/bin/env python3
"""
Test Suite: Affiliate Link Engine

Tests affiliate link generation, tracking, and commission optimization.
All tests use mock affiliate networks and do not require real API keys.

Coverage:
- Affiliate link generation for multiple networks
- Commission rate optimization
- Link tracking and analytics
- Network integration validation
- Monetization scoring
"""

import sys
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import json
import urllib.parse

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set test mode
os.environ['TEST_MODE'] = 'true'
os.environ['DRY_RUN'] = 'true'

from app.affiliate_link_engine import AffiliateLinkEngine

class TestAffiliateLinkEngine(unittest.TestCase):
    """Test cases for AffiliateLinkEngine functionality."""

    def setUp(self):
        """Set up test fixtures."""
        self.engine = AffiliateLinkEngine()
        
        # Mock affiliate network configurations
        self.mock_networks = {
            'amazon_associates': {
                'tracking_id': 'testaffiliate-20',
                'commission_rates': {
                    'Electronics': 4.0,
                    'Fashion': 8.0,
                    'Books': 10.0,
                    'default': 3.0
                },
                'base_url': 'https://amazon.com'
            },
            'impact_radius': {
                'campaign_id': 'TEST123',
                'commission_rates': {
                    'Electronics': 2.5,
                    'Fashion': 6.0,
                    'Sports': 5.0,
                    'default': 2.0
                }
            },
            'shareasale': {
                'merchant_id': 'TEST456',
                'commission_rates': {
                    'Health': 12.0,
                    'Beauty': 10.0,
                    'default': 4.0
                }
            }
        }

    def test_generate_amazon_affiliate_link(self):
        """Test Amazon Associates affiliate link generation."""
        print("🔗 Testing Amazon affiliate link generation...")
        
        product_url = "https://amazon.com/dp/B08N5WRWNW"
        category = "Electronics"
        
        with patch.object(self.engine, '_get_network_config') as mock_config:
            mock_config.return_value = self.mock_networks['amazon_associates']
            
            affiliate_link = self.engine.generate_affiliate_link(
                product_url, 
                'amazon_associates', 
                category
            )
            
            # Verify affiliate link structure
            self.assertIsInstance(affiliate_link, dict)
            self.assertIn('url', affiliate_link)
            self.assertIn('network', affiliate_link)
            self.assertIn('commission_rate', affiliate_link)
            self.assertIn('tracking_id', affiliate_link)
            
            # Verify tracking ID is included
            parsed_url = urllib.parse.urlparse(affiliate_link['url'])
            query_params = urllib.parse.parse_qs(parsed_url.query)
            
            self.assertIn('tag', query_params)
            self.assertEqual(query_params['tag'][0], 'testaffiliate-20')
            
            # Verify commission rate
            expected_rate = self.mock_networks['amazon_associates']['commission_rates'][category]
            self.assertEqual(affiliate_link['commission_rate'], expected_rate)
            
            print(f"   ✅ Generated: {affiliate_link['url'][:60]}...")
            print(f"   💰 Commission rate: {affiliate_link['commission_rate']}%")

    def test_commission_optimization(self):
        """Test commission rate optimization across networks."""
        print("📊 Testing commission optimization...")
        
        test_products = [
            {
                'url': 'https://example.com/electronics-item',
                'category': 'Electronics',
                'price': 299.99
            },
            {
                'url': 'https://example.com/fashion-item',
                'category': 'Fashion',
                'price': 89.99
            },
            {
                'url': 'https://example.com/health-item',
                'category': 'Health',
                'price': 49.99
            }
        ]
        
        with patch.object(self.engine, '_get_all_network_configs') as mock_all_configs:
            mock_all_configs.return_value = self.mock_networks
            
            for product in test_products:
                best_network = self.engine.find_best_commission_network(
                    product['category'],
                    product['price']
                )
                
                self.assertIsInstance(best_network, dict)
                self.assertIn('network', best_network)
                self.assertIn('commission_rate', best_network)
                self.assertIn('estimated_commission', best_network)
                
                # Verify commission calculation
                expected_commission = (
                    product['price'] * best_network['commission_rate'] / 100
                )
                self.assertAlmostEqual(
                    best_network['estimated_commission'],
                    expected_commission,
                    places=2
                )
                
                print(f"   🎯 {product['category']}: {best_network['network']} "
                      f"({best_network['commission_rate']}% = "
                      f"${best_network['estimated_commission']:.2f})")

    def test_link_tracking_data(self):
        """Test affiliate link tracking data generation."""
        print("📈 Testing link tracking data...")
        
        test_link = {
            'url': 'https://amazon.com/dp/TEST?tag=testaffiliate-20',
            'network': 'amazon_associates',
            'commission_rate': 4.0,
            'product_id': 'TEST123',
            'category': 'Electronics'
        }
        
        tracking_data = self.engine.generate_tracking_data(test_link)
        
        required_fields = [
            'link_id', 'created_at', 'network', 'commission_rate',
            'click_count', 'conversion_count', 'total_earnings'
        ]
        
        for field in required_fields:
            self.assertIn(field, tracking_data)
        
        # Verify initial values
        self.assertEqual(tracking_data['click_count'], 0)
        self.assertEqual(tracking_data['conversion_count'], 0)
        self.assertEqual(tracking_data['total_earnings'], 0.0)
        self.assertIsInstance(tracking_data['link_id'], str)
        
        print(f"   🆔 Link ID: {tracking_data['link_id']}")
        print(f"   📊 Initial tracking data created")
        print("   ✅ Tracking data generation passed")

    @patch('app.affiliate_link_engine.requests.get')
    def test_network_validation(self, mock_get):
        """Test affiliate network API validation (mocked)."""
        print("🔍 Testing network validation...")
        
        # Mock successful API validation
        mock_response = Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            'status': 'active',
            'account_id': 'TEST123',
            'commission_rates': {'default': 3.0}
        }
        mock_get.return_value = mock_response
        
        validation_result = self.engine.validate_network_credentials('amazon_associates')
        
        self.assertTrue(validation_result['valid'])
        self.assertEqual(validation_result['status'], 'active')
        
        # Mock failed API validation
        mock_response.status_code = 401
        mock_response.json.return_value = {'error': 'Invalid credentials'}
        
        validation_result = self.engine.validate_network_credentials('amazon_associates')
        
        self.assertFalse(validation_result['valid'])
        self.assertIn('error', validation_result)
        
        print("   ✅ Network credential validation passed")

    def test_monetization_scoring(self):
        """Test affiliate link monetization potential scoring."""
        print("💰 Testing monetization scoring...")
        
        test_products = [
            {
                'title': 'Premium Laptop',
                'category': 'Electronics',
                'price': 1299.99,
                'brand': 'Apple',
                'popularity_score': 95,
                'conversion_rate': 3.2
            },
            {
                'title': 'Basic Phone Case',
                'category': 'Accessories',
                'price': 12.99,
                'brand': 'Generic',
                'popularity_score': 45,
                'conversion_rate': 1.8
            },
            {
                'title': 'Designer Handbag',
                'category': 'Fashion',
                'price': 899.99,
                'brand': 'Gucci',
                'popularity_score': 88,
                'conversion_rate': 2.1
            }
        ]
        
        for product in test_products:
            monetization_score = self.engine.calculate_monetization_score(product)
            
            self.assertIsInstance(monetization_score, dict)
            self.assertIn('score', monetization_score)
            self.assertIn('factors', monetization_score)
            self.assertIn('estimated_monthly_revenue', monetization_score)
            
            # Score should be between 0 and 100
            self.assertGreaterEqual(monetization_score['score'], 0)
            self.assertLessEqual(monetization_score['score'], 100)
            
            # High-value items should have higher scores
            if product['price'] > 1000 and product['popularity_score'] > 80:
                self.assertGreaterEqual(monetization_score['score'], 70)
            
            print(f"   📊 {product['title']}: Score {monetization_score['score']:.1f}")
            print(f"      💵 Est. monthly revenue: ${monetization_score['estimated_monthly_revenue']:.2f}")

    def test_bulk_link_generation(self):
        """Test bulk affiliate link generation for multiple products."""
        print("🔄 Testing bulk link generation...")
        
        test_products = [
            {'url': 'https://example.com/product1', 'category': 'Electronics'},
            {'url': 'https://example.com/product2', 'category': 'Fashion'},
            {'url': 'https://example.com/product3', 'category': 'Books'},
            {'url': 'https://example.com/product4', 'category': 'Sports'},
            {'url': 'https://example.com/product5', 'category': 'Health'}
        ]
        
        with patch.object(self.engine, '_get_all_network_configs') as mock_configs:
            mock_configs.return_value = self.mock_networks
            
            bulk_results = self.engine.generate_bulk_affiliate_links(test_products)
            
            self.assertEqual(len(bulk_results), len(test_products))
            
            for i, result in enumerate(bulk_results):
                self.assertIn('original_url', result)
                self.assertIn('affiliate_link', result)
                self.assertIn('network', result)
                self.assertIn('commission_rate', result)
                
                # Verify original URL matches
                self.assertEqual(result['original_url'], test_products[i]['url'])
                
            successful_generations = sum(1 for r in bulk_results if r.get('success', False))
            
            print(f"   ✅ Generated {successful_generations}/{len(test_products)} affiliate links")
            print("   🔄 Bulk generation completed")

    def test_revenue_tracking(self):
        """Test revenue tracking and reporting."""
        print("💹 Testing revenue tracking...")
        
        # Mock historical revenue data
        mock_revenue_data = [
            {
                'date': '2024-11-01',
                'network': 'amazon_associates',
                'clicks': 150,
                'conversions': 8,
                'revenue': 24.50
            },
            {
                'date': '2024-11-02',
                'network': 'amazon_associates',
                'clicks': 200,
                'conversions': 12,
                'revenue': 38.75
            },
            {
                'date': '2024-11-01',
                'network': 'shareasale',
                'clicks': 80,
                'conversions': 5,
                'revenue': 31.20
            }
        ]
        
        with patch.object(self.engine, '_get_revenue_data') as mock_data:
            mock_data.return_value = mock_revenue_data
            
            revenue_report = self.engine.generate_revenue_report(
                start_date='2024-11-01',
                end_date='2024-11-02'
            )
            
            self.assertIn('total_revenue', revenue_report)
            self.assertIn('total_clicks', revenue_report)
            self.assertIn('total_conversions', revenue_report)
            self.assertIn('conversion_rate', revenue_report)
            self.assertIn('network_breakdown', revenue_report)
            
            # Verify calculations
            expected_total_revenue = sum(item['revenue'] for item in mock_revenue_data)
            expected_total_clicks = sum(item['clicks'] for item in mock_revenue_data)
            expected_total_conversions = sum(item['conversions'] for item in mock_revenue_data)
            
            self.assertEqual(revenue_report['total_revenue'], expected_total_revenue)
            self.assertEqual(revenue_report['total_clicks'], expected_total_clicks)
            self.assertEqual(revenue_report['total_conversions'], expected_total_conversions)
            
            expected_conversion_rate = (expected_total_conversions / expected_total_clicks) * 100
            self.assertAlmostEqual(
                revenue_report['conversion_rate'],
                expected_conversion_rate,
                places=2
            )
            
            print(f"   💰 Total revenue: ${revenue_report['total_revenue']:.2f}")
            print(f"   👆 Total clicks: {revenue_report['total_clicks']:,}")
            print(f"   🎯 Conversion rate: {revenue_report['conversion_rate']:.2f}%")

def run_tests():
    """Run all affiliate link engine tests with formatted output."""
    print("\n" + "="*80)
    print("🔗 RUNNING AFFILIATE LINK ENGINE TESTS")
    print("="*80)
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestAffiliateLinkEngine)
    
    # Run tests with custom result handler
    runner = unittest.TextTestRunner(verbosity=0, stream=open(os.devnull, 'w'))
    result = runner.run(suite)
    
    # Print summary
    total_tests = result.testsRun
    failures = len(result.failures)
    errors = len(result.errors)
    passed = total_tests - failures - errors
    
    print(f"\n📊 TEST RESULTS:")
    print(f"   ✅ Passed: {passed}")
    print(f"   ❌ Failed: {failures}")
    print(f"   🚫 Errors: {errors}")
    print(f"   📈 Success Rate: {(passed/total_tests)*100:.1f}%")
    
    if failures > 0:
        print(f"\n❌ FAILURES:")
        for test, traceback in result.failures:
            print(f"   • {test}: {traceback.split('AssertionError: ')[-1].split('\n')[0]}")
    
    if errors > 0:
        print(f"\n🚫 ERRORS:")
        for test, traceback in result.errors:
            print(f"   • {test}: {traceback.split('\n')[-2]}")
    
    print("\n" + "="*80)
    print("💰 AFFILIATE LINK ENGINE TESTS COMPLETED")
    print("="*80 + "\n")
    
    return result.wasSuccessful()

if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)