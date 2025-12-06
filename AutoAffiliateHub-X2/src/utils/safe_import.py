#!/usr/bin/env python3
"""
Safe Import Utility for StockSpot
Prevents crashes from missing dependencies and provides graceful fallbacks
"""

import logging
import sys
from typing import Optional, Any, Callable

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SafeImportContext:
    """Context manager for safe imports with fallback handling"""
    
    def __init__(self, module_name: str, fallback_factory: Optional[Callable] = None):
        self.module_name = module_name
        self.fallback_factory = fallback_factory
        self.module = None
        self.error = None
    
    def __enter__(self):
        try:
            self.module = __import__(self.module_name)
            logger.info(f"✅ Successfully imported {self.module_name}")
            return self.module
        except ImportError as e:
            self.error = e
            logger.warning(f"⚠️ Failed to import {self.module_name}: {e}")
            if self.fallback_factory:
                logger.info(f"Using fallback for {self.module_name}")
                return self.fallback_factory()
            return None
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        pass


def safe_import(module_name: str, fallback=None, silent: bool = False):
    """
    Safely import a module with optional fallback
    
    Args:
        module_name: Name of module to import
        fallback: Fallback object to return if import fails
        silent: If True, don't log warnings
        
    Returns:
        Module if successful, fallback if provided, None otherwise
    """
    try:
        module = __import__(module_name)
        if not silent:
            logger.info(f"✅ Imported {module_name}")
        return module
    except ImportError as e:
        if not silent:
            logger.warning(f"⚠️ Failed to import {module_name}: {e}")
        return fallback


def safe_import_from(module_name: str, item_name: str, fallback=None, silent: bool = False):
    """
    Safely import a specific item from a module
    
    Args:
        module_name: Name of module to import from
        item_name: Specific item to import
        fallback: Fallback object to return if import fails
        silent: If True, don't log warnings
        
    Returns:
        Item if successful, fallback if provided, None otherwise
    """
    try:
        module = __import__(module_name, fromlist=[item_name])
        item = getattr(module, item_name)
        if not silent:
            logger.info(f"✅ Imported {item_name} from {module_name}")
        return item
    except (ImportError, AttributeError) as e:
        if not silent:
            logger.warning(f"⚠️ Failed to import {item_name} from {module_name}: {e}")
        return fallback


def check_dependencies() -> dict:
    """
    Check all critical dependencies and return status report
    
    Returns:
        Dictionary with dependency status
    """
    dependencies = {
        'flask': {'required': True, 'status': 'unknown'},
        'tweepy': {'required': True, 'status': 'unknown'},
        'requests': {'required': True, 'status': 'unknown'},
        'redis': {'required': False, 'status': 'unknown'},
        'boto3': {'required': False, 'status': 'unknown'},
        'python-dotenv': {'required': True, 'status': 'unknown'},
        'schedule': {'required': False, 'status': 'unknown'}
    }
    
    for dep_name, dep_info in dependencies.items():
        module_name = dep_name.replace('-', '_')  # python-dotenv -> python_dotenv
        if module_name == 'python_dotenv':
            module_name = 'dotenv'
        
        try:
            __import__(module_name)
            dep_info['status'] = 'available'
        except ImportError:
            dep_info['status'] = 'missing'
    
    return dependencies


def create_flask_fallback():
    """Create a fallback Flask-like object when Flask is not available"""
    
    class FlaskFallback:
        def __init__(self):
            logger.warning("Flask not installed, using fallback mode")
        
        def route(self, *args, **kwargs):
            def decorator(func):
                logger.info(f"Flask route registered (fallback): {func.__name__}")
                return func
            return decorator
        
        def run(self, *args, **kwargs):
            logger.info("Flask not installed, skipping UI service")
            print("Flask not installed, skipping UI service")
    
    return FlaskFallback


def create_tweepy_fallback():
    """Create a fallback Tweepy-like object when Tweepy is not available"""
    
    class TweepyFallback:
        def __init__(self):
            logger.warning("Tweepy not installed, using fallback mode")
        
        class Client:
            def __init__(self, *args, **kwargs):
                logger.warning("Tweepy Client fallback initialized")
            
            def create_tweet(self, *args, **kwargs):
                logger.warning("Tweepy not available - cannot post tweet")
                return None
            
            def get_me(self):
                logger.warning("Tweepy not available - cannot get user info")
                return None
        
        TooManyRequests = Exception
        Forbidden = Exception
        Unauthorized = Exception
    
    return TweepyFallback


def validate_environment_vars(required_vars: list) -> dict:
    """
    Validate that required environment variables are set
    
    Args:
        required_vars: List of environment variable names
        
    Returns:
        Dictionary with validation results
    """
    import os
    
    results = {}
    for var in required_vars:
        value = os.getenv(var)
        results[var] = {
            'set': bool(value),
            'value': value if value else None
        }
    
    return results


# Pre-configure common safe imports
def get_flask():
    """Get Flask or fallback"""
    return safe_import_from('flask', 'Flask', create_flask_fallback())


def get_tweepy():
    """Get Tweepy or fallback"""
    return safe_import('tweepy', create_tweepy_fallback())


def get_requests():
    """Get requests or fallback"""
    return safe_import('requests')


def get_dotenv():
    """Get python-dotenv or fallback"""
    return safe_import_from('dotenv', 'load_dotenv', lambda: None)


if __name__ == "__main__":
    # Test the safe import functionality
    print("🔬 Testing Safe Import Utility...")
    
    # Check dependencies
    deps = check_dependencies()
    print("\n📦 Dependency Status:")
    for name, info in deps.items():
        status_emoji = "✅" if info['status'] == 'available' else "❌" if info['required'] else "⚠️"
        required_text = " (required)" if info['required'] else " (optional)"
        print(f"{status_emoji} {name}: {info['status']}{required_text}")
    
    # Test safe imports
    print("\n🧪 Testing Safe Imports:")
    flask = get_flask()
    print(f"Flask: {'✅ Available' if flask else '❌ Fallback'}")
    
    tweepy = get_tweepy()
    print(f"Tweepy: {'✅ Available' if hasattr(tweepy, '__version__') else '❌ Fallback'}")
    
    requests = get_requests()
    print(f"Requests: {'✅ Available' if requests else '❌ Missing'}")
    
    print("\n✅ Safe import utility test complete")