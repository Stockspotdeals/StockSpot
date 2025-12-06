#!/usr/bin/env python3
"""
Test script to demonstrate the AI Monetization Engine functionality
"""

import sys
import os

# Add the current directory to the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.monetization_engine import monetization_engine

def test_monetization_engine():
    """Test the monetization engine functionality."""
    print("🚀 StockSpot Monetization Engine Test")
    print("=" * 60)
    
    # Get summary statistics
    summary_stats = monetization_engine.get_summary_stats()
    print(f"\n📊 Summary Statistics:")
    print(f"   Total Posts: {summary_stats['total_posts']}")
    print(f"   Total Revenue: ${summary_stats['total_revenue']}")
    print(f"   Total Clicks: {summary_stats['total_clicks']}")
    print(f"   Average EPC: ${summary_stats['avg_epc']}")
    print(f"   Average Conversion Rate: {summary_stats['avg_conversion_rate']:.2f}%")
    print(f"   ML Support: {'✅ Yes' if summary_stats['has_ml_support'] else '❌ No'}")
    print(f"   Pandas Support: {'✅ Yes' if summary_stats['has_pandas_support'] else '❌ No'}")
    
    # Get top performers
    print(f"\n🏆 Top 5 Performing Deals:")
    top_performers = monetization_engine.get_top_performers(5)
    
    for i, deal in enumerate(top_performers, 1):
        print(f"   {i}. {deal['deal_title'][:50]}...")
        print(f"      Platform: {deal['platform']} | Score: {deal['performance_score']:.1f}")
        print(f"      Revenue: ${deal['total_revenue']:.2f} | CTR: {deal['ctr']:.2f}% | EPC: ${deal['epc']:.2f}")
        print()
    
    # Platform analytics
    print(f"\n📈 Platform Performance:")
    platform_analytics = monetization_engine.get_platform_analytics()
    
    for platform, data in platform_analytics.items():
        print(f"   {platform}: ${data['total_revenue']:.2f} revenue from {data['post_count']} posts")
        print(f"              EPC: ${data['avg_epc']:.2f} | Conversion Rate: {data['avg_conversion_rate']:.2f}%")
    
    # Test adding new metrics
    print(f"\n🔧 Testing Metrics Update...")
    
    # Simulate a new successful post
    monetization_engine.update_metrics(
        post_id="test_post_001",
        clicks=150,
        conversions=8,
        revenue=95.50,
        engagement={'likes': 45, 'shares': 12, 'comments': 6},
        platform="amazon",
        deal_title="Test Product - Special Offer",
        post_url="https://example.com/test"
    )
    
    print("   ✅ Added test metrics successfully")
    
    # Get updated stats
    updated_stats = monetization_engine.get_summary_stats()
    print(f"   Updated Total Revenue: ${updated_stats['total_revenue']:.2f}")
    print(f"   Updated Total Posts: {updated_stats['total_posts']}")
    
    print(f"\n✅ Monetization Engine Test Complete!")
    print(f"\nTo view the full analytics dashboard:")
    print(f"   1. Run: python app/dashboard.py")
    print(f"   2. Open: http://localhost:5000")
    print(f"   3. Login with password: admin123")
    print(f"   4. Navigate to Analytics tab")

if __name__ == "__main__":
    test_monetization_engine()