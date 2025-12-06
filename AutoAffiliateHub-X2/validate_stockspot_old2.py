#!/usr/bin/env python3
"""
StockSpot Validation Script
Tests imports, tweepy availability, and Twitter posting functionality
"""

import os
import sys
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_import_safety():
    """Test that all imports work safely without crashing"""
    print("🔍 Testing Import Safety")
    print("-" * 40)
    
    # Test basic Python modules
    try:
        import json
        import datetime
        print("✅ Basic Python modules: OK")
    except ImportError as e:
        print(f"❌ Basic Python modules failed: {e}")
        return False
    
    # Test tweepy availability
    try:
        import tweepy
        print("✅ Tweepy module: AVAILABLE")
        print(f"   Version: {tweepy.__version__}")
        tweepy_available = True
    except ImportError as e:
        print(f"⚠️  Tweepy module: NOT AVAILABLE ({e})")
        tweepy_available = False
    
    # Test flask availability
    try:
        import flask
        print("✅ Flask module: AVAILABLE")
        print(f"   Version: {flask.__version__}")
    except ImportError as e:
        print(f"⚠️  Flask module: NOT AVAILABLE ({e})")
    
    # Test python-dotenv availability
    try:
        import dotenv
        print("✅ Python-dotenv module: AVAILABLE")
    except ImportError as e:
        print(f"⚠️  Python-dotenv module: NOT AVAILABLE ({e})")
    
    # Test requests availability
    try:
        import requests
        print("✅ Requests module: AVAILABLE")
    except ImportError as e:
        print(f"⚠️  Requests module: NOT AVAILABLE ({e})")
    
    return tweepy_available

def test_posting_engine():
    """Test the posting engine import and functionality"""
    print("\n🔧 Testing Posting Engine")
    print("-" * 40)
    
    try:
        # Import posting engine safely
        from app.posting_engine import send_tweet
        print("✅ Posting engine imported successfully")
        
        # Test send_tweet function exists
        if callable(send_tweet):
            print("✅ send_tweet function: AVAILABLE")
            return True
        else:
            print("❌ send_tweet function: NOT CALLABLE")
            return False
            
    except ImportError as e:
        print(f"❌ Posting engine import failed: {e}")
        return False
    except Exception as e:
        print(f"❌ Posting engine error: {e}")
        return False

def test_twitter_credentials():
    """Test if Twitter credentials are configured"""
    print("\n🔑 Testing Twitter Credentials")
    print("-" * 40)
    
    # Load environment variables
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        print("⚠️  python-dotenv not available, using system env vars")
    
    # Check required environment variables
    required_vars = [
        'TWITTER_API_KEY',
        'TWITTER_API_SECRET',
        'TWITTER_ACCESS_TOKEN',
        'TWITTER_ACCESS_SECRET'
    ]
    
    configured = True
    for var in required_vars:
        value = os.getenv(var)
        if value:
            print(f"✅ {var}: CONFIGURED")
        else:
            print(f"❌ {var}: NOT SET")
            configured = False
    
    return configured

def test_twitter_posting():
    """Test actual Twitter posting functionality"""
    print("\n🐦 Testing Twitter Posting")
    print("-" * 40)
    
    try:
        # Import and test send_tweet
        from app.posting_engine import send_tweet
        
        # Test with validation ping
        print("📤 Attempting to post validation ping...")
        success = send_tweet("Validation ping")
        
        if success:
            print("✅ Twitter posting: SUCCESS")
            print("   Validation ping posted successfully")
            return True
        else:
            print("❌ Twitter posting: FAILED")
            print("   Check credentials and network connection")
            return False
            
    except ImportError as e:
        print(f"❌ Cannot import posting engine: {e}")
        return False
    except Exception as e:
        print(f"❌ Twitter posting error: {e}")
        return False

def test_api_endpoints():
    """Test Flask API endpoints if available"""
    print("\n🌐 Testing API Endpoints")
    print("-" * 40)
    
    try:
        # Test if Flask is available
        import flask
        print("✅ Flask available for API testing")
        
        # Check if api.py can be imported
        try:
            import api
            print("✅ API module imported successfully")
            
            # Check if Flask app is defined
            if hasattr(api, 'app'):
                print("✅ Flask app: DEFINED")
                
                # Test app configuration
                with api.app.test_client() as client:
                    # Test status endpoint
                    response = client.get('/status')
                    if response.status_code == 200:
                        print("✅ /status endpoint: OK")
                    else:
                        print(f"⚠️  /status endpoint returned: {response.status_code}")
                    
                    # Test home endpoint
                    response = client.get('/')
                    if response.status_code == 200:
                        print("✅ / endpoint: OK")
                    else:
                        print(f"⚠️  / endpoint returned: {response.status_code}")
                
                return True
            else:
                print("❌ Flask app: NOT DEFINED")
                return False
                
        except ImportError as e:
            print(f"⚠️  API module import failed: {e}")
            return False
            
    except ImportError:
        print("⚠️  Flask not available, skipping API tests")
        return False

def generate_report(results):
    """Generate a validation report"""
    print("\n📋 VALIDATION REPORT")
    print("=" * 50)
    
    total_tests = len(results)
    passed_tests = sum(1 for result in results.values() if result)
    
    print(f"Total tests: {total_tests}")
    print(f"Passed: {passed_tests}")
    print(f"Failed: {total_tests - passed_tests}")
    print(f"Success rate: {(passed_tests/total_tests)*100:.1f}%")
    
    print("\nDetailed Results:")
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"  {test_name}: {status}")
    
    # Overall status
    if passed_tests == total_tests:
        print("\n🎉 ALL TESTS PASSED - StockSpot is ready!")
    elif passed_tests >= total_tests * 0.7:
        print("\n⚠️  MOSTLY WORKING - Some issues to fix")
    else:
        print("\n❌ MAJOR ISSUES - Requires attention")
    
    return passed_tests == total_tests

def main():
    """Run all validation tests"""
    print("🚀 StockSpot Validation Starting...")
    print("=" * 50)
    
    results = {}
    
    # Run all tests
    results['Import Safety'] = test_import_safety()
    results['Posting Engine'] = test_posting_engine()
    results['Twitter Credentials'] = test_twitter_credentials()
    results['API Endpoints'] = test_api_endpoints()
    
    # Only test actual posting if everything else works
    if results['Import Safety'] and results['Posting Engine']:
        results['Twitter Posting'] = test_twitter_posting()
    else:
        print("\n🐦 Skipping Twitter Posting (dependencies not met)")
        results['Twitter Posting'] = False
    
    # Generate final report
    success = generate_report(results)
    
    return success

if __name__ == '__main__':
    try:
        success = main()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\n⚠️  Validation interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n\n❌ Validation failed with error: {e}")
        logging.exception("Validation error")
        sys.exit(1)