#!/usr/bin/env python3
"""
StockSpot Bootstrap Script
Initializes the system and checks all components
"""

import os
import sys
import logging

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def load_environment():
    """Load environment variables safely"""
    try:
        from src.utils.safe_import import get_dotenv
        load_dotenv = get_dotenv()
        if load_dotenv:
            # Look for .env file
            env_path = os.path.join(project_root, '.env')
            if os.path.exists(env_path):
                load_dotenv(env_path)
                logger.info("✅ Environment variables loaded from .env")
                return True
            else:
                logger.warning("⚠️ No .env file found")
                return False
        else:
            logger.warning("⚠️ python-dotenv not available")
            return False
    except Exception as e:
        logger.error(f"❌ Failed to load environment: {e}")
        return False


def check_twitter_module():
    """Check if Twitter module initializes properly"""
    try:
        from src.engines.twitter_engine import TwitterEngine
        
        engine = TwitterEngine()
        status = engine.get_status()
        
        logger.info("🐦 Twitter Module Status:")
        logger.info(f"  Configured: {status['configured']}")
        logger.info(f"  Client Initialized: {status['client_initialized']}")
        logger.info(f"  Tweepy Available: {status['tweepy_available']}")
        
        return status['configured'] and status['client_initialized']
        
    except Exception as e:
        logger.error(f"❌ Twitter module failed: {e}")
        return False


def check_amazon_module():
    """Check if Amazon affiliate module works"""
    try:
        from app.affiliate_link_engine import AffiliateLinkEngine
        
        engine = AffiliateLinkEngine()
        
        # Test basic functionality
        test_url = "https://www.amazon.com/dp/B08N5WRWNW"
        is_amazon = engine.is_amazon_url(test_url)
        asin = engine.extract_asin(test_url)
        
        logger.info("🛒 Amazon Module Status:")
        logger.info(f"  URL Detection: {'✅' if is_amazon else '❌'}")
        logger.info(f"  ASIN Extraction: {asin}")
        logger.info(f"  Associate ID Configured: {'✅' if engine.amazon_associate_id else '❌'}")
        
        return is_amazon and asin is not None
        
    except Exception as e:
        logger.error(f"❌ Amazon module failed: {e}")
        return False


def run_bootstrap():
    """Run the complete bootstrap sequence"""
    print("🔥 StockSpot Bootstrap Starting...")
    print("=" * 50)
    
    # Step 1: Load environment
    env_loaded = load_environment()
    
    # Step 2: Check Twitter module
    twitter_ok = check_twitter_module()
    
    # Step 3: Check Amazon module  
    amazon_ok = check_amazon_module()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 Bootstrap Summary")
    print("=" * 50)
    
    print(f"{'✅' if env_loaded else '❌'} Environment Loading: {'Success' if env_loaded else 'Failed'}")
    print(f"{'✅' if twitter_ok else '❌'} Twitter Module: {'Initialized' if twitter_ok else 'Failed'}")
    print(f"{'✅' if amazon_ok else '❌'} Amazon Module: {'Initialized' if amazon_ok else 'Failed'}")
    
    # Overall status
    components_ok = sum([env_loaded, twitter_ok, amazon_ok])
    total_components = 3
    
    success_rate = (components_ok / total_components) * 100
    
    if success_rate >= 100:
        status_emoji = "🎉"
        status_text = "FULLY OPERATIONAL"
    elif success_rate >= 67:
        status_emoji = "⚠️"
        status_text = "PARTIALLY OPERATIONAL"
    else:
        status_emoji = "❌"
        status_text = "CRITICAL ISSUES"
    
    print(f"\n{status_emoji} System Status: {status_text} ({success_rate:.0f}%)")
    
    # Recommendations
    if not env_loaded:
        print("\n💡 Recommendations:")
        print("  • Create .env file with your API credentials")
        print("  • See .env.example for template")
    
    if env_loaded and not twitter_ok:
        print("\n💡 Twitter Setup:")
        print("  • Add TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET to .env")
        print("  • Get credentials from https://developer.twitter.com/")
    
    if env_loaded and not amazon_ok:
        print("\n💡 Amazon Setup:")
        print("  • Add AMAZON_ASSOCIATE_ID, AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY to .env")
        print("  • Register at https://affiliate-program.amazon.com/")
    
    if success_rate >= 67:
        print(f"\n🚀 StockSpot is ready to run!")
        if success_rate < 100:
            print("   Some features may be limited due to missing configuration")
    else:
        print(f"\n🛠️ StockSpot needs configuration before running")
    
    return success_rate >= 67


def main():
    """Main bootstrap function"""
    try:
        success = run_bootstrap()
        return success
    except Exception as e:
        logger.error(f"💥 Bootstrap failed: {e}")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)