#!/usr/bin/env python3#!/usr/bin/env python3#!/usr/bin/env python3

"""

StockSpot Validation Script""""""

Tests Twitter/X posting and Amazon link generation functionality

"""StockSpot Validation ScriptStockSpot Validation Script



import osTests Twitter/X posting and Amazon link generation functionalityTests imports, tweepy availability, and Twitter posting functionality

import sys

import logging""""""



# Configure logging

logging.basicConfig(level=logging.INFO)

logger = logging.getLogger(__name__)import osimport os



def test_dependencies():import sysimport sys

    """Test that all required dependencies are available"""

    print("📦 Testing Dependencies")import loggingimport logging

    print("-" * 40)

    from typing import Dict, Any

    dependencies = {}

    # Configure logging

    # Test core dependencies

    try:# Configure logginglogging.basicConfig(level=logging.INFO)

        import flask

        print(f"✅ Flask: AVAILABLE")logging.basicConfig(level=logging.INFO)logger = logging.getLogger(__name__)

        dependencies['flask'] = True

    except ImportError:logger = logging.getLogger(__name__)

        print("❌ Flask: NOT AVAILABLE")

        dependencies['flask'] = Falsedef test_import_safety():

    

    try:def test_environment_setup():    """Test that all imports work safely without crashing"""

        import tweepy

        print(f"✅ Tweepy: AVAILABLE")    """Test that environment variables are properly configured"""    print("🔍 Testing Import Safety")

        dependencies['tweepy'] = True

    except ImportError:    print("🔧 Testing Environment Setup")    print("-" * 40)

        print("❌ Tweepy: NOT AVAILABLE")

        dependencies['tweepy'] = False    print("-" * 40)    

    

    try:        # Test basic Python modules

        import requests

        print(f"✅ Requests: AVAILABLE")    # Load environment variables    try:

        dependencies['requests'] = True

    except ImportError:    try:        import json

        print("❌ Requests: NOT AVAILABLE")

        dependencies['requests'] = False        from dotenv import load_dotenv        import datetime

    

    try:        load_dotenv()        print("✅ Basic Python modules: OK")

        from python_amazon_paapi import AmazonApi

        print("✅ Amazon PA API: AVAILABLE")        print("✅ Environment variables loaded")    except ImportError as e:

        dependencies['amazon_api'] = True

    except ImportError:    except ImportError:        print(f"❌ Basic Python modules failed: {e}")

        print("❌ Amazon PA API: NOT AVAILABLE")

        dependencies['amazon_api'] = False        print("⚠️  python-dotenv not available, using system env")        return False

    

    return dependencies        



def test_twitter_engine():    # Check Twitter credentials    # Test tweepy availability

    """Test Twitter engine functionality"""

    print("\n🐦 Testing Twitter Engine")    twitter_vars = [    try:

    print("-" * 40)

            'TWITTER_API_KEY',        import tweepy

    try:

        from twitter_engine import TwitterClient, send_tweet        'TWITTER_API_SECRET',         print("✅ Tweepy module: AVAILABLE")

        print("✅ Twitter engine imported successfully")

                'TWITTER_ACCESS_TOKEN',        print(f"   Version: {tweepy.__version__}")

        # Test send_tweet function exists

        if callable(send_tweet):        'TWITTER_ACCESS_SECRET'        tweepy_available = True

            print("✅ send_tweet function available")

            return True    ]    except ImportError as e:

        else:

            print("❌ send_tweet function not callable")            print(f"⚠️  Tweepy module: NOT AVAILABLE ({e})")

            return False

                twitter_configured = True        tweepy_available = False

    except ImportError as e:

        print(f"❌ Twitter engine import failed: {e}")    for var in twitter_vars:    

        return False

        if os.getenv(var):    # Test flask availability

def test_amazon_engine():

    """Test Amazon link generation functionality"""            print(f"✅ {var}: CONFIGURED")    try:

    print("\n🔗 Testing Amazon Engine")

    print("-" * 40)        else:        import flask

    

    try:            print(f"❌ {var}: NOT SET")        print("✅ Flask module: AVAILABLE")

        from amazon_links import generate_amazon_link, test_amazon_links

        print("✅ Amazon engine imported successfully")            twitter_configured = False        print(f"   Version: {flask.__version__}")

        

        # Test with sample ASIN        except ImportError as e:

        result = generate_amazon_link("B08N5WRWNW")

            # Check Amazon credentials        print(f"⚠️  Flask module: NOT AVAILABLE ({e})")

        if result['status'] == 'success':

            print("✅ Amazon link generation working")    amazon_vars = [    

            print(f"   Sample link: {result['affiliate_url'][:50]}...")

            return True        'AMAZON_ASSOCIATE_ID',    # Test python-dotenv availability

        else:

            print(f"⚠️  Amazon link generation: {result['message']}")        'AMAZON_ACCESS_KEY',    try:

            return False

                    'AMAZON_SECRET_KEY'        import dotenv

    except ImportError as e:

        print(f"❌ Amazon engine import failed: {e}")    ]        print("✅ Python-dotenv module: AVAILABLE")

        return False

        except ImportError as e:

def test_api_endpoints():

    """Test Flask API endpoints"""    amazon_configured = True        print(f"⚠️  Python-dotenv module: NOT AVAILABLE ({e})")

    print("\n🌐 Testing API Endpoints")

    print("-" * 40)    for var in amazon_vars:    

    

    try:        if os.getenv(var):    # Test requests availability

        import api

        print("✅ API module imported successfully")            print(f"✅ {var}: CONFIGURED")    try:

        

        # Test Flask app        else:        import requests

        if hasattr(api, 'app'):

            print("✅ Flask app available")            print(f"❌ {var}: NOT SET")        print("✅ Requests module: AVAILABLE")

            

            # Test endpoints with test client            amazon_configured = False    except ImportError as e:

            with api.app.test_client() as client:

                # Test status endpoint            print(f"⚠️  Requests module: NOT AVAILABLE ({e})")

                response = client.get('/status')

                if response.status_code == 200:    return {    

                    print("✅ /status endpoint working")

                else:        'twitter_configured': twitter_configured,    return tweepy_available

                    print(f"❌ /status endpoint failed: {response.status_code}")

                        'amazon_configured': amazon_configured

                # Test home endpoint

                response = client.get('/')    }def test_posting_engine():

                if response.status_code == 200:

                    print("✅ / endpoint working")    """Test the posting engine import and functionality"""

                else:

                    print(f"❌ / endpoint failed: {response.status_code}")def test_dependencies():    print("\n🔧 Testing Posting Engine")

                

                return True    """Test that all required dependencies are available"""    print("-" * 40)

        else:

            print("❌ Flask app not found")    print("\n📦 Testing Dependencies")    

            return False

                print("-" * 40)    try:

    except ImportError as e:

        print(f"❌ API import failed: {e}")            # Import posting engine safely

        return False

    dependencies = {}        from app.posting_engine import send_tweet

def main():

    """Run StockSpot validation"""            print("✅ Posting engine imported successfully")

    print("🚀 StockSpot Validation Starting...")

    print("=" * 50)    # Test core dependencies        

    

    # Run tests    try:        # Test send_tweet function exists

    deps_ok = test_dependencies()

    twitter_ok = test_twitter_engine()        import flask        if callable(send_tweet):

    amazon_ok = test_amazon_engine()

    api_ok = test_api_endpoints()        print(f"✅ Flask: v{flask.__version__}")            print("✅ send_tweet function: AVAILABLE")

    

    # Calculate overall score        dependencies['flask'] = True            return True

    total_tests = 4

    passed_tests = sum([deps_ok, twitter_ok, amazon_ok, api_ok])    except ImportError:        else:

    success_rate = (passed_tests / total_tests) * 100

            print("❌ Flask: NOT AVAILABLE")            print("❌ send_tweet function: NOT CALLABLE")

    print(f"\n📋 VALIDATION SUMMARY")

    print("=" * 50)        dependencies['flask'] = False            return False

    print(f"Dependencies: {'✅ PASS' if deps_ok else '❌ FAIL'}")

    print(f"Twitter Engine: {'✅ PASS' if twitter_ok else '❌ FAIL'}")                

    print(f"Amazon Engine: {'✅ PASS' if amazon_ok else '❌ FAIL'}")

    print(f"API Endpoints: {'✅ PASS' if api_ok else '❌ FAIL'}")    try:    except ImportError as e:

    print(f"\nSuccess Rate: {success_rate:.0f}%")

            import tweepy        print(f"❌ Posting engine import failed: {e}")

    if success_rate >= 75:

        print("🎉 StockSpot is ready to use!")        print(f"✅ Tweepy: v{tweepy.__version__}")        return False

    elif success_rate >= 50:

        print("⚠️  Some issues need attention")        dependencies['tweepy'] = True    except Exception as e:

    else:

        print("❌ Major issues require fixing")    except ImportError:        print(f"❌ Posting engine error: {e}")

    

    print("\n🎯 Next Steps:")        print("❌ Tweepy: NOT AVAILABLE")        return False

    print("1. Add credentials to .env file")

    print("2. Install missing dependencies: pip install -r requirements.txt")        dependencies['tweepy'] = False

    print("3. Start API: python api.py")

    print("4. Test at http://localhost:5000")    def test_twitter_credentials():

    

    return success_rate >= 75    try:    """Test if Twitter credentials are configured"""



if __name__ == '__main__':        import requests    print("\n🔑 Testing Twitter Credentials")

    try:

        success = main()        print(f"✅ Requests: v{requests.__version__}")    print("-" * 40)

        sys.exit(0 if success else 1)

    except Exception as e:        dependencies['requests'] = True    

        print(f"❌ Validation failed: {e}")

        sys.exit(1)    except ImportError:    # Load environment variables

        print("❌ Requests: NOT AVAILABLE")    try:

        dependencies['requests'] = False        from dotenv import load_dotenv

            load_dotenv()

    try:    except ImportError:

        from python_amazon_paapi import AmazonApi        print("⚠️  python-dotenv not available, using system env vars")

        print("✅ Amazon PA API: AVAILABLE")    

        dependencies['amazon_api'] = True    # Check required environment variables

    except ImportError:    required_vars = [

        print("❌ Amazon PA API: NOT AVAILABLE")        'TWITTER_API_KEY',

        dependencies['amazon_api'] = False        'TWITTER_API_SECRET',

            'TWITTER_ACCESS_TOKEN',

    try:        'TWITTER_ACCESS_SECRET'

        from dotenv import load_dotenv    ]

        print("✅ Python-dotenv: AVAILABLE")    

        dependencies['dotenv'] = True    configured = True

    except ImportError:    for var in required_vars:

        print("❌ Python-dotenv: NOT AVAILABLE")        value = os.getenv(var)

        dependencies['dotenv'] = False        if value:

                print(f"✅ {var}: CONFIGURED")

    return dependencies        else:

            print(f"❌ {var}: NOT SET")

def test_twitter_engine():            configured = False

    """Test Twitter engine functionality"""    

    print("\n🐦 Testing Twitter Engine")    return configured

    print("-" * 40)

    def test_twitter_posting():

    try:    """Test actual Twitter posting functionality"""

        from twitter_engine import TwitterClient, test_twitter_connection, send_tweet    print("\n🐦 Testing Twitter Posting")

        print("✅ Twitter engine imported successfully")    print("-" * 40)

            

        # Test client initialization    try:

        client = TwitterClient()        # Import and test send_tweet

        connected = client.is_connected()        from app.posting_engine import send_tweet

                

        if connected:        # Test with validation ping

            print("✅ Twitter client connected")        print("📤 Attempting to post validation ping...")

                    success = send_tweet("Validation ping")

            # Test tweet functionality (without actually posting)        

            print("✅ send_tweet function available")        if success:

                        print("✅ Twitter posting: SUCCESS")

            return {            print("   Validation ping posted successfully")

                'engine_available': True,            return True

                'client_connected': True,        else:

                'can_post': True            print("❌ Twitter posting: FAILED")

            }            print("   Check credentials and network connection")

        else:            return False

            print("❌ Twitter client not connected (check credentials)")            

            return {    except ImportError as e:

                'engine_available': True,        print(f"❌ Cannot import posting engine: {e}")

                'client_connected': False,        return False

                'can_post': False    except Exception as e:

            }        print(f"❌ Twitter posting error: {e}")

                    return False

    except ImportError as e:

        print(f"❌ Twitter engine import failed: {e}")def test_api_endpoints():

        return {    """Test Flask API endpoints if available"""

            'engine_available': False,    print("\n🌐 Testing API Endpoints")

            'client_connected': False,    print("-" * 40)

            'can_post': False    

        }    try:

        # Test if Flask is available

def test_amazon_engine():        import flask

    """Test Amazon link generation functionality"""        print("✅ Flask available for API testing")

    print("\n🔗 Testing Amazon Engine")        

    print("-" * 40)        # Check if api.py can be imported

            try:

    try:            import api

        from amazon_links import AmazonLinkGenerator, generate_amazon_link            print("✅ API module imported successfully")

        print("✅ Amazon engine imported successfully")            

                    # Check if Flask app is defined

        # Test link generator initialization            if hasattr(api, 'app'):

        generator = AmazonLinkGenerator()                print("✅ Flask app: DEFINED")

                        

        if generator.credentials_valid:                # Test app configuration

            print("✅ Amazon credentials valid")                with api.app.test_client() as client:

                                # Test status endpoint

            # Test ASIN extraction                    response = client.get('/status')

            test_url = "https://www.amazon.com/dp/B08N5WRWNW"                    if response.status_code == 200:

            asin = generator.extract_asin_from_url(test_url)                        print("✅ /status endpoint: OK")

                                else:

            if asin:                        print(f"⚠️  /status endpoint returned: {response.status_code}")

                print(f"✅ ASIN extraction: {asin}")                    

                                    # Test home endpoint

                # Test affiliate link generation                    response = client.get('/')

                affiliate_url = generator.generate_affiliate_url(asin)                    if response.status_code == 200:

                if affiliate_url and generator.associate_id in affiliate_url:                        print("✅ / endpoint: OK")

                    print("✅ Affiliate link generation working")                    else:

                                            print(f"⚠️  / endpoint returned: {response.status_code}")

                    return {                

                        'engine_available': True,                return True

                        'credentials_valid': True,            else:

                        'can_generate_links': True,                print("❌ Flask app: NOT DEFINED")

                        'sample_link': affiliate_url                return False

                    }                

                else:        except ImportError as e:

                    print("❌ Affiliate link generation failed")            print(f"⚠️  API module import failed: {e}")

                    return {            return False

                        'engine_available': True,            

                        'credentials_valid': True,    except ImportError:

                        'can_generate_links': False        print("⚠️  Flask not available, skipping API tests")

                    }        return False

            else:

                print("❌ ASIN extraction failed")def generate_report(results):

                return {    """Generate a validation report"""

                    'engine_available': True,    print("\n📋 VALIDATION REPORT")

                    'credentials_valid': True,    print("=" * 50)

                    'can_generate_links': False    

                }    total_tests = len(results)

        else:    passed_tests = sum(1 for result in results.values() if result)

            print("❌ Amazon credentials not valid")    

            return {    print(f"Total tests: {total_tests}")

                'engine_available': True,    print(f"Passed: {passed_tests}")

                'credentials_valid': False,    print(f"Failed: {total_tests - passed_tests}")

                'can_generate_links': False    print(f"Success rate: {(passed_tests/total_tests)*100:.1f}%")

            }    

                print("\nDetailed Results:")

    except ImportError as e:    for test_name, result in results.items():

        print(f"❌ Amazon engine import failed: {e}")        status = "✅ PASS" if result else "❌ FAIL"

        return {        print(f"  {test_name}: {status}")

            'engine_available': False,    

            'credentials_valid': False,    # Overall status

            'can_generate_links': False    if passed_tests == total_tests:

        }        print("\n🎉 ALL TESTS PASSED - StockSpot is ready!")

    elif passed_tests >= total_tests * 0.7:

def test_api_endpoints():        print("\n⚠️  MOSTLY WORKING - Some issues to fix")

    """Test Flask API endpoints"""    else:

    print("\n🌐 Testing API Endpoints")        print("\n❌ MAJOR ISSUES - Requires attention")

    print("-" * 40)    

        return passed_tests == total_tests

    try:

        import apidef main():

        print("✅ API module imported successfully")    """Run all validation tests"""

            print("🚀 StockSpot Validation Starting...")

        # Test Flask app    print("=" * 50)

        if hasattr(api, 'app'):    

            print("✅ Flask app available")    results = {}

                

            # Test endpoints with test client    # Run all tests

            with api.app.test_client() as client:    results['Import Safety'] = test_import_safety()

                # Test status endpoint    results['Posting Engine'] = test_posting_engine()

                response = client.get('/status')    results['Twitter Credentials'] = test_twitter_credentials()

                if response.status_code == 200:    results['API Endpoints'] = test_api_endpoints()

                    data = response.get_json()    

                    print(f"✅ /status endpoint: {data.get('status', 'Unknown')}")    # Only test actual posting if everything else works

                else:    if results['Import Safety'] and results['Posting Engine']:

                    print(f"❌ /status endpoint failed: {response.status_code}")        results['Twitter Posting'] = test_twitter_posting()

                    else:

                # Test home endpoint        print("\n🐦 Skipping Twitter Posting (dependencies not met)")

                response = client.get('/')        results['Twitter Posting'] = False

                if response.status_code == 200:    

                    print("✅ / endpoint working")    # Generate final report

                else:    success = generate_report(results)

                    print(f"❌ / endpoint failed: {response.status_code}")    

                    return success

                # Test Amazon link endpoint (mock request)

                response = client.post('/amazon/link',if __name__ == '__main__':

                    json={'product_url': 'B08N5WRWNW'},    try:

                    content_type='application/json'        success = main()

                )        sys.exit(0 if success else 1)

                if response.status_code in [200, 503]:  # 503 if credentials not set    except KeyboardInterrupt:

                    print("✅ /amazon/link endpoint responding")        print("\n\n⚠️  Validation interrupted by user")

                else:        sys.exit(1)

                    print(f"⚠️  /amazon/link endpoint: {response.status_code}")    except Exception as e:

                        print(f"\n\n❌ Validation failed with error: {e}")

                return {        logging.exception("Validation error")

                    'api_available': True,        sys.exit(1)
                    'endpoints_working': True
                }
        else:
            print("❌ Flask app not found")
            return {
                'api_available': False,
                'endpoints_working': False
            }
            
    except ImportError as e:
        print(f"❌ API import failed: {e}")
        return {
            'api_available': False,
            'endpoints_working': False
        }

def test_integration():
    """Test full integration workflow"""
    print("\n🔄 Testing Integration Workflow")
    print("-" * 40)
    
    try:
        from twitter_engine import get_poster
        from amazon_links import generate_amazon_link
        
        # Test deal posting workflow
        sample_deal = {
            'title': 'Test Product Deal',
            'price': '29.99',
            'original_price': '49.99',
            'discount_percent': 40,
            'product_url': 'B08N5WRWNW'
        }
        
        # Generate Amazon link
        link_result = generate_amazon_link(sample_deal['product_url'])
        if link_result['status'] == 'success':
            print("✅ Amazon link generation in workflow")
            sample_deal['affiliate_url'] = link_result['affiliate_url']
        else:
            print("⚠️  Amazon link generation failed in workflow")
        
        # Format tweet (without posting)
        poster = get_poster()
        if poster.twitter_client.is_connected():
            tweet_text = poster.twitter_client.format_deal_tweet(sample_deal)
            print(f"✅ Tweet formatting: {len(tweet_text)} chars")
            
            if len(tweet_text) <= 280:
                print("✅ Tweet length validation")
                return {
                    'workflow_working': True,
                    'sample_tweet': tweet_text
                }
            else:
                print("❌ Tweet too long")
                return {
                    'workflow_working': False
                }
        else:
            print("⚠️  Twitter not connected for workflow test")
            return {
                'workflow_working': False
            }
            
    except Exception as e:
        print(f"❌ Integration workflow failed: {e}")
        return {
            'workflow_working': False
        }

def generate_report(results: Dict[str, Any]):
    """Generate comprehensive validation report"""
    print("\n📋 VALIDATION REPORT")
    print("=" * 50)
    
    # Calculate scores
    env_score = (results['env']['twitter_configured'] + results['env']['amazon_configured']) * 50
    dep_score = sum(results['deps'].values()) / len(results['deps']) * 100
    twitter_score = sum(results['twitter'].values()) / len(results['twitter']) * 100
    amazon_score = sum(results['amazon'].values()) / len(results['amazon']) * 100
    api_score = sum(results['api'].values()) / len(results['api']) * 100
    
    overall_score = (env_score + dep_score + twitter_score + amazon_score + api_score) / 5
    
    print(f"Environment Setup: {env_score:.0f}%")
    print(f"Dependencies: {dep_score:.0f}%")
    print(f"Twitter Engine: {twitter_score:.0f}%")
    print(f"Amazon Engine: {amazon_score:.0f}%")
    print(f"API Endpoints: {api_score:.0f}%")
    print(f"\nOVERALL SCORE: {overall_score:.0f}%")
    
    # Status determination
    if overall_score >= 90:
        status = "🎉 EXCELLENT - Ready for production!"
    elif overall_score >= 75:
        status = "✅ GOOD - Ready with minor issues"
    elif overall_score >= 50:
        status = "⚠️  FAIR - Needs attention before production"
    else:
        status = "❌ POOR - Major issues need fixing"
    
    print(f"\nSTATUS: {status}")
    
    # Recommendations
    print("\n📝 RECOMMENDATIONS:")
    
    if not results['env']['twitter_configured']:
        print("• Add Twitter API credentials to .env file")
    if not results['env']['amazon_configured']:
        print("• Add Amazon API credentials to .env file")
    if not results['deps']['tweepy']:
        print("• Install tweepy: pip install tweepy")
    if not results['deps']['flask']:
        print("• Install flask: pip install flask")
    if not results['deps']['amazon_api']:
        print("• Install Amazon API: pip install python-amazon-paapi")
    if not results['twitter']['client_connected']:
        print("• Check Twitter credentials and network connection")
    if not results['amazon']['credentials_valid']:
        print("• Verify Amazon PA API credentials")
        
    return overall_score >= 75

def main():
    """Run comprehensive StockSpot validation"""
    print("🚀 StockSpot Comprehensive Validation")
    print("=" * 50)
    
    # Run all tests
    results = {
        'env': test_environment_setup(),
        'deps': test_dependencies(), 
        'twitter': test_twitter_engine(),
        'amazon': test_amazon_engine(),
        'api': test_api_endpoints()
    }
    
    # Test integration if basics work
    if (results['deps']['tweepy'] and results['deps']['flask'] and 
        results['twitter']['engine_available'] and results['amazon']['engine_available']):
        results['integration'] = test_integration()
    else:
        print("\n🔄 Skipping Integration Test (dependencies not met)")
        results['integration'] = {'workflow_working': False}
    
    # Generate final report
    success = generate_report(results)
    
    # Print next steps
    print("\n🎯 NEXT STEPS:")
    print("1. Configure missing credentials in .env file")
    print("2. Install missing dependencies: pip install -r requirements.txt")
    print("3. Start API server: python api.py")
    print("4. Test endpoints at http://localhost:5000")
    
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