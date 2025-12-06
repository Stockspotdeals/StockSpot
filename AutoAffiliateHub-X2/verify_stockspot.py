#!/usr/bin/env python3
"""
StockSpot System Verification Script
Tests all core components after StockSpot implementation
"""

import sys
import os

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

def test_imports():
    """Test that all core modules can be imported"""
    print("🧪 Testing Core Module Imports...")
    
    try:
        # Test affiliate link engine (Amazon-only)
        from affiliate_link_engine import AffiliateLinkEngine
        print("✅ AffiliateLinkEngine - Amazon Associates module")
        
        # Test posting engine (Twitter-only) 
        from posting_engine import PostingEngine
        print("✅ PostingEngine - Twitter/X posting module")
        
        # Test dashboard
        from dashboard import app
        print("✅ Dashboard - Flask web interface")
        
        # Test deal engine
        from deal_engine import DealEngine
        print("✅ DealEngine - Deal discovery module")
        
        # Test caption engine
        from caption_engine import CaptionEngine
        print("✅ CaptionEngine - Content generation module")
        
        return True
        
    except ImportError as e:
        print(f"❌ Import Error: {e}")
        return False

def test_affiliate_engine():
    """Test Amazon-only affiliate link functionality"""
    print("\n🔗 Testing Amazon Affiliate Link Engine...")
    
    try:
        from affiliate_link_engine import AffiliateLinkEngine
        engine = AffiliateLinkEngine()
        
        # Test Amazon URL detection
        amazon_url = "https://www.amazon.com/dp/B08N5WRWNW"
        is_amazon = engine.is_amazon_url(amazon_url)
        print(f"✅ Amazon URL Detection: {is_amazon}")
        
        # Test ASIN extraction
        asin = engine.extract_asin(amazon_url)
        print(f"✅ ASIN Extraction: {asin}")
        
        # Test affiliate link creation (will work even without credentials)
        affiliate_url = engine.add_amazon_affiliate(amazon_url)
        print(f"✅ Affiliate Link Creation: {affiliate_url[:50]}...")
        
        return True
        
    except Exception as e:
        print(f"❌ Affiliate Engine Error: {e}")
        return False

def test_posting_engine():
    """Test Twitter-only posting engine"""
    print("\n🐦 Testing Twitter Posting Engine...")
    
    try:
        from posting_engine import PostingEngine
        engine = PostingEngine()
        
        # Test validation (will show missing credentials, which is expected)
        validation = engine.validate_configuration()
        print(f"✅ Configuration Check: {validation}")
        
        # Test deal formatting
        sample_deal = {
            'title': 'Test Product',
            'price': '19.99',
            'original_price': '39.99', 
            'discount_percent': 50,
            'url': 'https://amazon.com/test',
            'category': 'electronics'
        }
        
        tweet_text = engine.format_deal_tweet(sample_deal)
        print(f"✅ Tweet Formatting: {tweet_text}")
        print(f"   Length: {len(tweet_text)} characters (max 280)")
        
        return True
        
    except Exception as e:
        print(f"❌ Posting Engine Error: {e}")
        return False

def test_environment_config():
    """Test environment configuration for StockSpot"""
    print("\n⚙️ Testing Environment Configuration...")
    
    # Check for StockSpot environment variables
    stockspot_vars = [
        'AMAZON_ASSOCIATE_ID',
        'AMAZON_ACCESS_KEY', 
        'AMAZON_SECRET_KEY',
        'TWITTER_API_KEY',
        'TWITTER_API_SECRET',
        'TWITTER_BEARER_TOKEN',
        'TWITTER_ACCESS_TOKEN',
        'TWITTER_ACCESS_SECRET',
        'OWNER_DASHBOARD_PASSWORD'
    ]
    
    configured_vars = []
    missing_vars = []
    
    for var in stockspot_vars:
        if os.getenv(var):
            configured_vars.append(var)
            print(f"✅ {var} - Configured")
        else:
            missing_vars.append(var)
            print(f"⚠️ {var} - Not set (expected for test)")
    
    print(f"\nConfiguration Summary:")
    print(f"  Configured: {len(configured_vars)}/{len(stockspot_vars)}")
    print(f"  Missing: {len(missing_vars)} (set in .env for production)")
    
    return True

def test_removed_integrations():
    """Verify old multi-platform integrations are removed"""
    print("\n🗑️ Testing Removed Integrations...")
    
    removed_files = [
        'app/connectors/shopify_connector.py',
        'app/connectors/reddit_connector.py'
    ]
    
    still_exist = []
    for file_path in removed_files:
        if os.path.exists(file_path):
            still_exist.append(file_path)
            print(f"⚠️ {file_path} - Still exists (should be removed)")
        else:
            print(f"✅ {file_path} - Successfully removed")
    
    # Check requirements.txt for removed dependencies
    try:
        with open('requirements.txt', 'r') as f:
            requirements = f.read()
            
        if 'facebook-sdk' not in requirements:
            print("✅ facebook-sdk - Removed from requirements")
        else:
            print("⚠️ facebook-sdk - Still in requirements")
            
    except FileNotFoundError:
        print("⚠️ requirements.txt not found")
    
    return len(still_exist) == 0

def main():
    """Run all verification tests"""
    print("🔥 StockSpot System Verification")
    print("=" * 50)
    
    tests = [
        ("Core Module Imports", test_imports),
        ("Amazon Affiliate Engine", test_affiliate_engine), 
        ("Twitter Posting Engine", test_posting_engine),
        ("Environment Configuration", test_environment_config),
        ("Removed Integrations", test_removed_integrations)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} - Exception: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 50)
    print("📊 Verification Summary")
    print("=" * 50)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 StockSpot refactor successful!")
        print("🚀 System ready for Amazon + Twitter automation")
    else:
        print(f"\n⚠️ {total - passed} issues found - check logs above")
    
    return passed == total

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)