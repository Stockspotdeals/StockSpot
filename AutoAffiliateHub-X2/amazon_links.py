#!/usr/bin/env python3
"""
Amazon Deep Link Generator for StockSpot
Uses Amazon Product Advertising API to generate affiliate deep links
"""

import os
import re
import logging
from typing import Optional, Dict, Any
from urllib.parse import urlparse, parse_qs
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Safe import of Amazon PA API
try:
    from python_amazon_paapi import AmazonApi
    PAAPI_AVAILABLE = True
    logger.info("Amazon PA API SDK imported successfully")
except ImportError as e:
    logger.warning(f"Amazon PA API SDK not available: {e}")
    PAAPI_AVAILABLE = False
    AmazonApi = None


class AmazonLinkGenerator:
    """Amazon affiliate deep link generator using Product Advertising API"""
    
    def __init__(self):
        """Initialize Amazon link generator with credentials from environment"""
        self.associate_id = os.getenv('AMAZON_ASSOCIATE_ID')
        self.access_key = os.getenv('AMAZON_ACCESS_KEY')
        self.secret_key = os.getenv('AMAZON_SECRET_KEY')
        self.host = os.getenv('AMAZON_HOST', 'webservices.amazon.com')
        self.region = os.getenv('AMAZON_REGION', 'us-east-1')
        
        # Validate credentials
        self.credentials_valid = all([
            self.associate_id,
            self.access_key, 
            self.secret_key
        ])
        
        if not self.credentials_valid:
            logger.warning("Amazon credentials not complete in .env file")
            return
            
        if PAAPI_AVAILABLE:
            # Initialize PA API client
            try:
                self.amazon_api = AmazonApi(
                    key=self.access_key,
                    secret=self.secret_key,
                    tag=self.associate_id,
                    country=self.region
                )
                logger.info("Amazon PA API client initialized")
            except Exception as e:
                logger.error(f"Failed to initialize Amazon PA API client: {e}")
                self.credentials_valid = False
        else:
            logger.warning("Amazon PA API not available - using fallback link generation")
    
    def extract_asin_from_url(self, url: str) -> Optional[str]:
        """Extract ASIN from Amazon product URL"""
        if not url:
            return None
            
        # Common Amazon ASIN patterns
        asin_patterns = [
            r'/dp/([A-Z0-9]{10})',           # /dp/B08N5WRWNW
            r'/gp/product/([A-Z0-9]{10})',   # /gp/product/B08N5WRWNW
            r'asin=([A-Z0-9]{10})',          # ?asin=B08N5WRWNW
            r'/([A-Z0-9]{10})(?:/|$|\?)',    # Direct ASIN in path
        ]
        
        for pattern in asin_patterns:
            match = re.search(pattern, url, re.IGNORECASE)
            if match:
                asin = match.group(1)
                logger.info(f"Extracted ASIN: {asin} from URL: {url}")
                return asin
        
        logger.warning(f"Could not extract ASIN from URL: {url}")
        return None
    
    def generate_affiliate_url(self, asin: str, custom_text: Optional[str] = None) -> str:
        """Generate Amazon affiliate URL with Associate ID"""
        if not asin:
            return ""
            
        if not self.associate_id:
            logger.error("Amazon Associate ID not configured")
            return f"https://www.amazon.com/dp/{asin}"
        
        # Build affiliate URL with Associate ID
        base_url = f"https://www.amazon.com/dp/{asin}"
        affiliate_params = f"?tag={self.associate_id}&linkCode=ogi&th=1&psc=1"
        
        affiliate_url = base_url + affiliate_params
        logger.info(f"Generated affiliate URL for ASIN {asin}: {affiliate_url}")
        return affiliate_url
    
    def get_product_info(self, asin: str) -> Optional[Dict[str, Any]]:
        """Get product information using Amazon PA API"""
        if not PAAPI_AVAILABLE or not self.credentials_valid:
            logger.warning("Amazon PA API not available for product info")
            return None
            
        try:
            # Use the python-amazon-paapi library
            products = self.amazon_api.get_products([asin])
            
            if products and len(products) > 0:
                product = products[0]
                
                # Extract product info
                product_info = {
                    'asin': asin,
                    'title': product.title or '',
                    'price': '',
                    'image_url': product.main_image_url or '',
                    'features': product.feature_bullets or []
                }
                
                # Price information
                if hasattr(product, 'price_and_currency') and product.price_and_currency:
                    product_info['price'] = product.price_and_currency
                
                logger.info(f"Retrieved product info for ASIN {asin}: {product_info['title']}")
                return product_info
                
        except Exception as e:
            logger.error(f"Error getting product info for ASIN {asin}: {e}")
            
        return None
    
    def generate_amazon_link(self, product_url: str) -> Dict[str, Any]:
        """
        Main function to generate Amazon affiliate deep link
        
        Args:
            product_url: Amazon product URL or ASIN
            
        Returns:
            Dict with affiliate_url, product_info, and status
        """
        result = {
            'affiliate_url': '',
            'product_info': None,
            'status': 'error',
            'message': ''
        }
        
        # Handle direct ASIN input
        if len(product_url) == 10 and product_url.isalnum():
            asin = product_url
        else:
            # Extract ASIN from URL
            asin = self.extract_asin_from_url(product_url)
            
        if not asin:
            result['message'] = 'Could not extract ASIN from URL'
            return result
            
        # Generate affiliate URL
        affiliate_url = self.generate_affiliate_url(asin)
        if not affiliate_url:
            result['message'] = 'Failed to generate affiliate URL'
            return result
            
        result['affiliate_url'] = affiliate_url
        result['status'] = 'success'
        result['message'] = 'Affiliate link generated successfully'
        
        # Try to get product information
        product_info = self.get_product_info(asin)
        if product_info:
            result['product_info'] = product_info
            
        return result


# Global instance for easy access
_amazon_generator = None

def get_amazon_generator():
    """Get or create global Amazon link generator instance"""
    global _amazon_generator
    if _amazon_generator is None:
        _amazon_generator = AmazonLinkGenerator()
    return _amazon_generator

def generate_amazon_link(product_id_or_url: str) -> Dict[str, Any]:
    """
    Generate Amazon affiliate deep link (convenience function)
    
    Args:
        product_id_or_url: Amazon product URL or ASIN
        
    Returns:
        Dict with affiliate_url, product_info, and status
    """
    generator = get_amazon_generator()
    return generator.generate_amazon_link(product_id_or_url)


# Test function
def test_amazon_links():
    """Test Amazon link generation"""
    print("🔗 Testing Amazon Link Generation")
    print("-" * 40)
    
    generator = AmazonLinkGenerator()
    
    if not generator.credentials_valid:
        print("❌ Amazon credentials not configured")
        return False
        
    # Test with sample ASIN
    test_asin = "B08N5WRWNW"  # Example ASIN
    result = generator.generate_amazon_link(test_asin)
    
    print(f"Test ASIN: {test_asin}")
    print(f"Status: {result['status']}")
    print(f"Affiliate URL: {result['affiliate_url']}")
    
    if result['product_info']:
        print(f"Product Title: {result['product_info']['title']}")
        print(f"Price: {result['product_info']['price']}")
    
    return result['status'] == 'success'


if __name__ == '__main__':
    test_amazon_links()