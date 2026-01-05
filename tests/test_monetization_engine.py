#!/usr/bin/env python3
"""
Test Suite: Monetization Engine

Tests AI monetization scoring, revenue tracking, and profit optimization.
All tests use mock data and do not require real payment processor APIs.

Coverage:
- Monetization potential scoring
- Revenue tracking and analytics  
- Commission optimization
- Performance metrics calculation
- Profit margin analysis
- ROI prediction and validation
"""

import sys
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import json

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set test mode
os.environ['TEST_MODE'] = 'true'
os.environ['DRY_RUN'] = 'true'

from app.monetization_engine import MonetizationEngine

class TestMonetizationEngine(unittest.TestCase):
    """Test cases for MonetizationEngine functionality."""

    def setUp(self):
        """Set up test fixtures."""
        self.engine = MonetizationEngine()
        
        # Mock historical performance data
        self.mock_performance_data = [
            {
                'date': '2024-11-01',
                'product_category': 'Electronics',
                'clicks': 1250,
                'conversions': 87,
                'revenue': 2839.45,
                'commission_rate': 4.5,
                'cost_per_click': 0.12
            },
            {
                'date': '2024-11-02', 
                'product_category': 'Fashion',
                'clicks': 890,
                'conversions': 43,
                'revenue': 1205.67,
                'commission_rate': 8.0,
                'cost_per_click': 0.08
            },
            {
                'date': '2024-11-03',
                'product_category': 'Home & Garden',
                'clicks': 750,
                'conversions': 29,
                'revenue': 875.30,
                'commission_rate': 6.5,
                'cost_per_click': 0.10
            }
        ]

        # Mock product data for scoring
        self.sample_products = [
            {
                'title': 'Apple iPhone 15 Pro Max 1TB',
                'price': 1199.99,
                'category': 'Electronics',
                'brand': 'Apple',
                'commission_rate': 3.0,
                'conversion_rate': 2.8,
                'competition_level': 'high',
                'trend_score': 95,
                'seasonality_factor': 1.1
            },
            {
                'title': 'Generic Phone Case',
                'price': 9.99,
                'category': 'Accessories',
                'brand': 'Generic',
                'commission_rate': 15.0,
                'conversion_rate': 0.9,
                'competition_level': 'low',
                'trend_score': 25,
                'seasonality_factor': 1.0
            },
            {
                'title': 'Nike Air Jordan Retro High OG',
                'price': 199.99,
                'category': 'Fashion',
                'brand': 'Nike',
                'commission_rate': 8.0,
                'conversion_rate': 3.5,
                'competition_level': 'medium',
                'trend_score': 88,
                'seasonality_factor': 1.2
            }
        ]

    def test_calculate_monetization_score(self):
        """Test monetization potential scoring algorithm."""
        print("💰 Testing monetization scoring...")
        
        for product in self.sample_products:
            score = self.engine.calculate_monetization_score(product)
            
            self.assertIsInstance(score, dict)
            self.assertIn('overall_score', score)
            self.assertIn('revenue_potential', score)
            self.assertIn('profit_margin', score)
            self.assertIn('risk_assessment', score)
            self.assertIn('recommendation', score)
            
            # Overall score should be 0-100
            self.assertGreaterEqual(score['overall_score'], 0)
            self.assertLessEqual(score['overall_score'], 100)
            
            # High-value branded products should score higher
            if product['price'] > 1000 and product['brand'] in ['Apple', 'Samsung', 'Sony']:
                self.assertGreaterEqual(score['overall_score'], 60)
            
            # Low-price, low-conversion items should score lower
            if product['price'] < 20 and product['conversion_rate'] < 1.0:
                self.assertLessEqual(score['overall_score'], 40)
            
            print(f"   📊 {product['title'][:30]}...")
            print(f"      💯 Score: {score['overall_score']:.1f}/100")
            print(f"      💵 Revenue potential: ${score['revenue_potential']:.2f}")
            print(f"      📈 Risk level: {score['risk_assessment']}")

        print("   ✅ Monetization scoring passed")

    def test_revenue_tracking_analytics(self):
        """Test revenue tracking and analytics calculation."""
        print("📊 Testing revenue analytics...")
        
        with patch.object(self.engine, '_get_historical_data') as mock_data:
            mock_data.return_value = self.mock_performance_data
            
            analytics = self.engine.calculate_revenue_analytics(
                start_date='2024-11-01',
                end_date='2024-11-03'
            )
            
            self.assertIsInstance(analytics, dict)
            
            # Required analytics fields
            required_fields = [
                'total_revenue', 'total_clicks', 'total_conversions',
                'average_conversion_rate', 'revenue_per_click',
                'category_breakdown', 'growth_rate', 'roi'
            ]
            
            for field in required_fields:
                self.assertIn(field, analytics)
            
            # Verify calculations
            expected_total_revenue = sum(item['revenue'] for item in self.mock_performance_data)
            expected_total_clicks = sum(item['clicks'] for item in self.mock_performance_data)
            expected_total_conversions = sum(item['conversions'] for item in self.mock_performance_data)
            
            self.assertEqual(analytics['total_revenue'], expected_total_revenue)
            self.assertEqual(analytics['total_clicks'], expected_total_clicks)
            self.assertEqual(analytics['total_conversions'], expected_total_conversions)
            
            # Verify conversion rate calculation
            expected_conversion_rate = (expected_total_conversions / expected_total_clicks) * 100
            self.assertAlmostEqual(
                analytics['average_conversion_rate'],
                expected_conversion_rate,
                places=2
            )
            
            print(f"   💰 Total revenue: ${analytics['total_revenue']:,.2f}")
            print(f"   👆 Total clicks: {analytics['total_clicks']:,}")
            print(f"   🎯 Avg conversion rate: {analytics['average_conversion_rate']:.2f}%")
            print(f"   💵 Revenue per click: ${analytics['revenue_per_click']:.3f}")
            print("   ✅ Revenue analytics passed")

    def test_commission_optimization(self):
        """Test commission rate optimization across networks."""
        print("🎯 Testing commission optimization...")
        
        # Mock different affiliate networks with various commission structures
        mock_networks = {
            'amazon_associates': {
                'base_rate': 4.0,
                'volume_bonuses': {1000: 0.5, 5000: 1.0, 10000: 1.5},
                'category_multipliers': {'Electronics': 1.0, 'Books': 2.5, 'Fashion': 2.0}
            },
            'impact_radius': {
                'base_rate': 6.0,
                'volume_bonuses': {500: 1.0, 2500: 2.0, 7500: 3.0},
                'category_multipliers': {'Electronics': 0.8, 'Fashion': 1.5, 'Sports': 1.8}
            },
            'shareasale': {
                'base_rate': 8.0,
                'volume_bonuses': {250: 1.0, 1500: 2.5, 5000: 4.0},
                'category_multipliers': {'Health': 1.5, 'Beauty': 2.0, 'Home': 1.2}
            }
        }
        
        test_scenarios = [
            {'category': 'Electronics', 'monthly_volume': 2500, 'price_point': 299.99},
            {'category': 'Fashion', 'monthly_volume': 1200, 'price_point': 89.99},
            {'category': 'Books', 'monthly_volume': 800, 'price_point': 24.99}
        ]
        
        with patch.object(self.engine, '_get_network_rates') as mock_rates:
            mock_rates.return_value = mock_networks
            
            for scenario in test_scenarios:
                optimization = self.engine.optimize_commission_strategy(scenario)
                
                self.assertIsInstance(optimization, dict)
                self.assertIn('recommended_network', optimization)
                self.assertIn('estimated_commission_rate', optimization)
                self.assertIn('projected_monthly_earnings', optimization)
                self.assertIn('optimization_factors', optimization)
                
                # Should recommend a valid network
                self.assertIn(optimization['recommended_network'], mock_networks.keys())
                
                # Commission rate should be realistic (1-20%)
                self.assertGreaterEqual(optimization['estimated_commission_rate'], 1.0)
                self.assertLessEqual(optimization['estimated_commission_rate'], 20.0)
                
                print(f"   🎯 {scenario['category']}: {optimization['recommended_network']}")
                print(f"      💰 Est. commission: {optimization['estimated_commission_rate']:.1f}%")
                print(f"      📈 Monthly earnings: ${optimization['projected_monthly_earnings']:.2f}")
        
        print("   ✅ Commission optimization passed")

    def test_roi_prediction(self):
        """Test ROI prediction and validation."""
        print("📈 Testing ROI prediction...")
        
        investment_scenarios = [
            {
                'campaign_budget': 500.00,
                'target_category': 'Electronics',
                'expected_traffic': 2000,
                'time_horizon_days': 30
            },
            {
                'campaign_budget': 200.00,
                'target_category': 'Fashion',
                'expected_traffic': 800,
                'time_horizon_days': 14
            },
            {
                'campaign_budget': 1000.00,
                'target_category': 'Home & Garden',
                'expected_traffic': 5000,
                'time_horizon_days': 60
            }
        ]
        
        for scenario in investment_scenarios:
            roi_prediction = self.engine.predict_roi(scenario)
            
            self.assertIsInstance(roi_prediction, dict)
            self.assertIn('predicted_roi_percentage', roi_prediction)
            self.assertIn('expected_revenue', roi_prediction)
            self.assertIn('break_even_days', roi_prediction)
            self.assertIn('confidence_interval', roi_prediction)
            self.assertIn('risk_factors', roi_prediction)
            
            # ROI should be reasonable (-100% to +500%)
            self.assertGreaterEqual(roi_prediction['predicted_roi_percentage'], -100)
            self.assertLessEqual(roi_prediction['predicted_roi_percentage'], 500)
            
            # Revenue should be positive
            self.assertGreaterEqual(roi_prediction['expected_revenue'], 0)
            
            # Break-even should be within time horizon
            self.assertLessEqual(
                roi_prediction['break_even_days'], 
                scenario['time_horizon_days'] * 2  # Allow some buffer
            )
            
            print(f"   💵 Budget: ${scenario['campaign_budget']:.2f}")
            print(f"   📊 Predicted ROI: {roi_prediction['predicted_roi_percentage']:.1f}%")
            print(f"   💰 Expected revenue: ${roi_prediction['expected_revenue']:.2f}")
            print(f"   ⏱️ Break-even: {roi_prediction['break_even_days']} days")
        
        print("   ✅ ROI prediction passed")

    def test_performance_metrics(self):
        """Test performance metrics calculation and benchmarking."""
        print("📊 Testing performance metrics...")
        
        # Mock current performance data
        current_metrics = {
            'clicks_per_day': 350,
            'conversion_rate': 2.8,
            'average_order_value': 127.50,
            'revenue_per_visitor': 3.57,
            'cost_per_acquisition': 15.30,
            'customer_lifetime_value': 89.40
        }
        
        performance_analysis = self.engine.analyze_performance_metrics(current_metrics)
        
        self.assertIsInstance(performance_analysis, dict)
        self.assertIn('overall_grade', performance_analysis)
        self.assertIn('benchmarks', performance_analysis)
        self.assertIn('improvement_suggestions', performance_analysis)
        self.assertIn('key_strengths', performance_analysis)
        self.assertIn('areas_for_improvement', performance_analysis)
        
        # Grade should be A, B, C, D, or F
        valid_grades = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F']
        self.assertIn(performance_analysis['overall_grade'], valid_grades)
        
        # Should have benchmarks for key metrics
        self.assertIn('conversion_rate', performance_analysis['benchmarks'])
        self.assertIn('revenue_per_visitor', performance_analysis['benchmarks'])
        
        # Should provide actionable suggestions
        self.assertIsInstance(performance_analysis['improvement_suggestions'], list)
        self.assertGreater(len(performance_analysis['improvement_suggestions']), 0)
        
        print(f"   🎓 Overall grade: {performance_analysis['overall_grade']}")
        print(f"   💪 Key strengths: {len(performance_analysis['key_strengths'])}")
        print(f"   🔧 Improvement areas: {len(performance_analysis['areas_for_improvement'])}")
        print(f"   💡 Suggestions: {len(performance_analysis['improvement_suggestions'])}")
        print("   ✅ Performance metrics passed")

    def test_profit_margin_analysis(self):
        """Test profit margin calculation and optimization."""
        print("💹 Testing profit margin analysis...")
        
        cost_structures = [
            {
                'product_cost': 50.00,
                'selling_price': 99.99,
                'commission_rate': 5.0,
                'marketing_cost_per_sale': 8.50,
                'operational_overhead': 2.30
            },
            {
                'product_cost': 299.99,
                'selling_price': 399.99,
                'commission_rate': 3.5,
                'marketing_cost_per_sale': 25.00,
                'operational_overhead': 5.75
            },
            {
                'product_cost': 15.00,
                'selling_price': 29.99,
                'commission_rate': 12.0,
                'marketing_cost_per_sale': 3.20,
                'operational_overhead': 1.10
            }
        ]
        
        for cost_structure in cost_structures:
            margin_analysis = self.engine.analyze_profit_margins(cost_structure)
            
            self.assertIsInstance(margin_analysis, dict)
            self.assertIn('gross_profit_margin', margin_analysis)
            self.assertIn('net_profit_margin', margin_analysis)
            self.assertIn('commission_amount', margin_analysis)
            self.assertIn('total_costs', margin_analysis)
            self.assertIn('profit_per_unit', margin_analysis)
            self.assertIn('margin_grade', margin_analysis)
            
            # Margins should be between -100% and 100%
            self.assertGreaterEqual(margin_analysis['gross_profit_margin'], -100)
            self.assertLessEqual(margin_analysis['gross_profit_margin'], 100)
            
            # Commission amount should make sense
            expected_commission = cost_structure['selling_price'] * (cost_structure['commission_rate'] / 100)
            self.assertAlmostEqual(
                margin_analysis['commission_amount'],
                expected_commission,
                places=2
            )
            
            print(f"   💰 Selling price: ${cost_structure['selling_price']:.2f}")
            print(f"   📊 Gross margin: {margin_analysis['gross_profit_margin']:.1f}%")
            print(f"   📈 Net margin: {margin_analysis['net_profit_margin']:.1f}%")
            print(f"   💵 Profit per unit: ${margin_analysis['profit_per_unit']:.2f}")
            print(f"   🎓 Margin grade: {margin_analysis['margin_grade']}")
            print("   ---")
        
        print("   ✅ Profit margin analysis passed")

    def test_revenue_forecasting(self):
        """Test revenue forecasting based on historical data."""
        print("🔮 Testing revenue forecasting...")
        
        with patch.object(self.engine, '_get_historical_data') as mock_historical:
            mock_historical.return_value = self.mock_performance_data
            
            forecast_periods = [7, 30, 90, 365]  # days
            
            for period_days in forecast_periods:
                forecast = self.engine.forecast_revenue(
                    forecast_days=period_days,
                    confidence_level=0.95
                )
                
                self.assertIsInstance(forecast, dict)
                self.assertIn('predicted_revenue', forecast)
                self.assertIn('confidence_interval', forecast)
                self.assertIn('growth_trend', forecast)
                self.assertIn('seasonal_adjustments', forecast)
                self.assertIn('forecast_accuracy', forecast)
                
                # Revenue should be positive
                self.assertGreaterEqual(forecast['predicted_revenue'], 0)
                
                # Confidence interval should have lower and upper bounds
                self.assertIn('lower_bound', forecast['confidence_interval'])
                self.assertIn('upper_bound', forecast['confidence_interval'])
                self.assertLessEqual(
                    forecast['confidence_interval']['lower_bound'],
                    forecast['predicted_revenue']
                )
                self.assertGreaterEqual(
                    forecast['confidence_interval']['upper_bound'],
                    forecast['predicted_revenue']
                )
                
                print(f"   📅 {period_days}-day forecast: ${forecast['predicted_revenue']:,.2f}")
                print(f"      📊 Range: ${forecast['confidence_interval']['lower_bound']:,.2f} - "
                      f"${forecast['confidence_interval']['upper_bound']:,.2f}")
                print(f"      📈 Trend: {forecast['growth_trend']}")
        
        print("   ✅ Revenue forecasting passed")

def run_tests():
    """Run all monetization engine tests with formatted output."""
    print("\n" + "="*80)
    print("💰 RUNNING MONETIZATION ENGINE TESTS")
    print("="*80)
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestMonetizationEngine)
    
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
    print("💎 MONETIZATION ENGINE TESTS COMPLETED")
    print("="*80 + "\n")
    
    return result.wasSuccessful()

if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)