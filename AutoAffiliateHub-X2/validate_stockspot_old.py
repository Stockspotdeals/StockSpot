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

def validate_environment() -> Dict[str, bool]:
    """Validate environment variables"""
    # Load environment variables safely
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    
    required_vars = [
        'TWITTER_API_KEY',
        'TWITTER_API_SECRET',
        'TWITTER_ACCESS_TOKEN', 
        'TWITTER_ACCESS_SECRET'
    ]
    
    env_status = {}
    for var in required_vars:
        env_status[var] = bool(os.getenv(var))
    
    return env_status


def validate_twitter_engine() -> Dict[str, Any]:
    """Safely validate Twitter engine without causing import issues"""
    validation = {
        'import_success': False,
        'initialization_success': False,
        'test_success': False,
        'error': None
    }
    
    try:
        # Import the engine safely
        from src.engines.twitter_engine import TwitterEngine
        validation['import_success'] = True
        
        # Initialize engine
        engine = TwitterEngine()
        validation['initialization_success'] = True
        
        # Run test
        test_result = engine.test_post("StockSpot validation test")
        validation['test_success'] = test_result
        
    except ImportError as e:
        validation['error'] = f"Import error: {e}"
    except Exception as e:
        validation['error'] = f"Runtime error: {e}"
    
    return validation


def validate_safe_imports() -> Dict[str, bool]:
    """Test the safe import utility"""
    safe_import_status = {}
    
    try:
        from src.utils.safe_import import check_dependencies, get_tweepy, get_flask
        
        # Test dependency checker
        deps = check_dependencies()
        safe_import_status['dependency_checker'] = True
        
        # Test safe Tweepy import
        tweepy_result = get_tweepy()
        safe_import_status['tweepy_import'] = tweepy_result is not None
        
        # Test safe Flask import
        flask_result = get_flask()
        safe_import_status['flask_import'] = flask_result is not None
        
    except Exception as e:
        safe_import_status['error'] = str(e)
        safe_import_status['dependency_checker'] = False
        safe_import_status['tweepy_import'] = False
        safe_import_status['flask_import'] = False
    
    return safe_import_status


def run_validation() -> Dict[str, Any]:
    """Run complete validation suite"""
    print("🔥 StockSpot Validation Starting...")
    print("=" * 50)
    
    validation_results = {}
    
    # Test 1: Dependencies
    print("📦 Checking Dependencies...")
    deps = validate_dependencies()
    validation_results['dependencies'] = deps
    
    for dep, status in deps.items():
        emoji = "✅" if status else "❌"
        print(f"  {emoji} {dep}")
    
    # Test 2: Environment
    print("\n⚙️ Checking Environment Variables...")
    env_vars = validate_environment()
    validation_results['environment'] = env_vars
    
    configured_count = sum(env_vars.values())
    total_count = len(env_vars)
    print(f"  📊 {configured_count}/{total_count} Twitter credentials configured")
    
    # Test 3: Safe Imports
    print("\n🛡️ Testing Safe Import Utility...")
    safe_imports = validate_safe_imports()
    validation_results['safe_imports'] = safe_imports
    
    for test, status in safe_imports.items():
        if test != 'error':
            emoji = "✅" if status else "❌"
            print(f"  {emoji} {test}")
        elif 'error' in safe_imports:
            print(f"  ⚠️ Error: {safe_imports['error']}")
    
    # Test 4: Twitter Engine
    print("\n🐦 Testing Twitter Engine...")
    twitter_validation = validate_twitter_engine()
    validation_results['twitter_engine'] = twitter_validation
    
    print(f"  {'✅' if twitter_validation['import_success'] else '❌'} Import: {twitter_validation['import_success']}")
    print(f"  {'✅' if twitter_validation['initialization_success'] else '❌'} Initialization: {twitter_validation['initialization_success']}")
    print(f"  {'✅' if twitter_validation['test_success'] else '❌'} Test: {twitter_validation['test_success']}")
    
    if twitter_validation.get('error'):
        print(f"  ⚠️ Error: {twitter_validation['error']}")
    
    # Overall Assessment
    print("\n" + "=" * 50)
    print("� Validation Summary")
    print("=" * 50)
    
    # Calculate overall score
    scores = {
        'dependencies': sum(deps.values()) / len(deps),
        'environment': sum(env_vars.values()) / len(env_vars),
        'safe_imports': sum(v for k, v in safe_imports.items() if k != 'error' and isinstance(v, bool)) / max(1, len([k for k in safe_imports.keys() if k != 'error'])),
        'twitter_engine': sum([twitter_validation['import_success'], twitter_validation['initialization_success']]) / 2
    }
    
    overall_score = sum(scores.values()) / len(scores)
    
    for category, score in scores.items():
        percentage = int(score * 100)
        emoji = "✅" if score > 0.7 else "⚠️" if score > 0.3 else "❌"
        print(f"{emoji} {category.replace('_', ' ').title()}: {percentage}%")
    
    overall_percentage = int(overall_score * 100)
    overall_emoji = "✅" if overall_score > 0.7 else "⚠️" if overall_score > 0.3 else "❌"
    print(f"\n{overall_emoji} Overall Health: {overall_percentage}%")
    
    # Recommendations
    print("\n💡 Recommendations:")
    if not deps.get('tweepy'):
        print("  • Install Tweepy: pip install tweepy")
    if not deps.get('flask'):
        print("  • Install Flask: pip install flask")
    if sum(env_vars.values()) == 0:
        print("  • Configure Twitter API credentials in .env file")
    if not twitter_validation['test_success'] and twitter_validation['initialization_success']:
        print("  • Twitter engine initialized but test failed - check credentials")
    
    validation_results['overall_score'] = overall_score
    return validation_results


def main():
    """Main validation function"""
    try:
        results = run_validation()
        
        # Return appropriate exit code
        overall_score = results.get('overall_score', 0)
        if overall_score > 0.7:
            print("\n🎉 StockSpot validation PASSED!")
            return True
        elif overall_score > 0.3:
            print("\n⚠️ StockSpot validation PARTIAL - some issues found")
            return True
        else:
            print("\n❌ StockSpot validation FAILED - significant issues found")
            return False
            
    except Exception as e:
        print(f"\n💥 Validation script failed: {e}")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)