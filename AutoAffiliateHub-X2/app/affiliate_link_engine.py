import os
import requests
import logging
from urllib.parse import urlencode, urlparse, parse_qs, urljoin
import hashlib
import time

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AffiliateLinkEngine:
    """Amazon Associates affiliate link generator for StockSpot"""
    
    def __init__(self):
        """Initialize the Amazon-only affiliate link engine."""
        # Load Amazon credentials from environment
        self.amazon_associate_id = os.getenv("AMAZON_ASSOCIATE_ID")
        self.amazon_access_key = os.getenv("AMAZON_ACCESS_KEY")
        self.amazon_secret_key = os.getenv("AMAZON_SECRET_KEY")
        
        # Amazon Product Advertising API settings
        self.amazon_host = "webservices.amazon.com"
        self.amazon_region = "us-east-1"
        self.amazon_service = "ProductAdvertisingAPI"
        
        logger.info("AffiliateLinkEngine initialized (Amazon Associates only)")
        
        if not all([self.amazon_associate_id, self.amazon_access_key, self.amazon_secret_key]):
            logger.warning("Amazon credentials incomplete in environment variables")
    
    def is_amazon_url(self, url):
        """Check if URL is an Amazon product URL."""
        amazon_domains = [
            'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de',
            'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.co.jp',
            'amazon.in', 'amazon.com.br', 'amazon.com.mx', 'amazon.com.au'
        ]
        
        url_lower = url.lower()
        return any(domain in url_lower for domain in amazon_domains)
    
    def extract_asin(self, url):
        """Extract ASIN (Amazon Standard Identification Number) from URL."""
        import re
        
        # Common ASIN patterns in Amazon URLs
        asin_patterns = [
            r'/dp/([A-Z0-9]{10})',
            r'/gp/product/([A-Z0-9]{10})',
            r'/product-reviews/([A-Z0-9]{10})',
            r'asin=([A-Z0-9]{10})',
            r'/([A-Z0-9]{10})(?:/|\?|$)'
        ]
        
        for pattern in asin_patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
        
        return None
    
    def add_amazon_affiliate(self, url):
        """Add Amazon affiliate ID to URL."""
        if not self.amazon_associate_id:
            logger.warning("Amazon associate ID not configured")
            return url
        
        if not self.is_amazon_url(url):
            logger.warning(f"URL is not an Amazon URL: {url}")
            return url
        
        # Parse the URL
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        # Add affiliate tag
        query_params['tag'] = [self.amazon_associate_id]
        
        # Add additional tracking parameters
        query_params['linkCode'] = ['ll1']
        query_params['linkId'] = [hashlib.md5(url.encode()).hexdigest()[:10]]
        
        # Rebuild URL with affiliate parameters
        new_query = urlencode(query_params, doseq=True)
        affiliate_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{new_query}"
        
        logger.info(f"Added Amazon affiliate tag to URL: {affiliate_url[:100]}...")
        return affiliate_url
    
    def create_amazon_short_url(self, asin, title=None):
        """Create a clean Amazon affiliate URL using ASIN."""
        if not self.amazon_associate_id:
            logger.error("Amazon associate ID not configured")
            return None
        
        if not asin or len(asin) != 10:
            logger.error(f"Invalid ASIN: {asin}")
            return None
        
        # Create clean Amazon URL with affiliate tag
        base_url = f"https://www.amazon.com/dp/{asin}"
        params = {
            'tag': self.amazon_associate_id,
            'linkCode': 'osi',
            'th': '1',
            'psc': '1'
        }
        
        affiliate_url = f"{base_url}?{urlencode(params)}"
        
        logger.info(f"Created Amazon affiliate URL for ASIN {asin}")
        return affiliate_url
    
    def validate_amazon_credentials(self):
        """Test Amazon API credentials (basic check)."""
        if not all([self.amazon_associate_id, self.amazon_access_key, self.amazon_secret_key]):
            return False
        
        # Basic format validation
        if not self.amazon_associate_id.endswith('-20'):
            logger.warning("Amazon Associate ID should end with '-20'")
            return False
        
        return True
    
    def get_commission_rate(self, category=None):
        """Get commission rate for Amazon Associates by category."""
        # Amazon Associates commission rates (as of 2024)
        rates = {
            'luxury_beauty': 10.0,
            'amazon_games': 20.0,
            'digital_music': 5.0,
            'physical_books': 4.5,
            'kitchen': 4.0,
            'automotive': 4.0,
            'baby_products': 3.0,
            'beauty': 3.0,
            'digital_video_games': 3.0,
            'health_personal_care': 3.0,
            'sports_outdoors': 3.0,
            'tools_home_improvement': 3.0,
            'toys_games': 3.0,
            'electronics': 2.5,
            'computers': 2.5,
            'camera_photo': 2.5,
            'cell_phones_accessories': 2.5,
            'video_games': 1.0,
            'grocery': 1.0,
            'default': 2.5
        }
        
        return rates.get(category, rates['default'])
    
    def process_deal_url(self, deal):
        """Process a deal and add Amazon affiliate links where applicable."""
        if not isinstance(deal, dict):
            logger.error("Deal must be a dictionary")
            return deal
        
        original_url = deal.get('url')
        if not original_url:
            logger.warning("Deal has no URL")
            return deal
        
        if self.is_amazon_url(original_url):
            # Add affiliate link
            affiliate_url = self.add_amazon_affiliate(original_url)
            
            # Extract ASIN for tracking
            asin = self.extract_asin(original_url)
            
            # Update deal with affiliate information
            deal['affiliate_url'] = affiliate_url
            deal['original_url'] = original_url
            deal['asin'] = asin
            deal['affiliate_network'] = 'amazon_associates'
            deal['commission_rate'] = self.get_commission_rate(deal.get('category'))
            
            logger.info(f"Processed Amazon deal: {deal.get('title', 'Unknown')} (ASIN: {asin})")
        else:
            logger.info(f"Skipping non-Amazon URL: {original_url}")
        
        return deal
        new_query = urlencode(query_params, doseq=True)
        affiliate_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{new_query}"
        
        logger.info(f"Added Amazon affiliate ID to URL: {url[:50]}...")
        return affiliate_url
    
    def add_walmart_affiliate(self, url):
        """Add Walmart affiliate ID to URL."""
        if not self.walmart_id:
            logger.warning("Walmart affiliate ID not configured")
            return url
        
        # Parse the URL
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        # Add affiliate parameters
        query_params['wmlspartner'] = [self.walmart_id]
        query_params['sourceid'] = ['imp_000011112222333344']
        
        # Rebuild URL with affiliate parameters
        new_query = urlencode(query_params, doseq=True)
        affiliate_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{new_query}"
        
        logger.info(f"Added Walmart affiliate ID to URL: {url[:50]}...")
        return affiliate_url
    
    def add_target_affiliate(self, url):
        """Add Target affiliate token to URL."""
        if not self.target_token:
            logger.warning("Target affiliate token not configured")
            return url
        
        # Parse the URL
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        # Add affiliate parameters
        query_params['afid'] = [self.target_token]
        query_params['ref'] = ['tgt_adv_XS000000']
        
        # Rebuild URL with affiliate parameters
        new_query = urlencode(query_params, doseq=True)
        affiliate_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{new_query}"
        
        logger.info(f"Added Target affiliate token to URL: {url[:50]}...")
        return affiliate_url
    
    def add_bestbuy_affiliate(self, url):
        """Add Best Buy affiliate ID to URL."""
        if not self.bestbuy_id:
            logger.warning("Best Buy affiliate ID not configured")
            return url
        
        # Parse the URL
        parsed = urlparse(url)
        query_params = parse_qs(parsed.query)
        
        # Add affiliate parameters
        query_params['irclickid'] = [self.bestbuy_id]
        query_params['ref'] = ['198&AFID=614286']
        
        # Rebuild URL with affiliate parameters
        new_query = urlencode(query_params, doseq=True)
        affiliate_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path}?{new_query}"
        
        logger.info(f"Added Best Buy affiliate ID to URL: {url[:50]}...")
        return affiliate_url
    
    def shorten_with_urlgenius(self, url):
        """Attempt to shorten URL using URLGenius API."""
        if not self.urlgenius_key:
            logger.warning("URLGenius API key not configured")
            return None
        
        try:
            api_url = "https://urlgeni.us/api/create"
            headers = {
                'Authorization': f'Bearer {self.urlgenius_key}',
                'Content-Type': 'application/json'
            }
            payload = {
                'url': url,
                'domain': 'urlgeni.us'
            }
            
            response = requests.post(api_url, json=payload, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                short_url = data.get('shortenedUrl', data.get('short_url'))
                if short_url:
                    logger.info(f"Successfully shortened URL with URLGenius: {url[:50]}...")
                    return short_url
            
            logger.warning(f"URLGenius API returned status {response.status_code}")
            return None
            
        except requests.exceptions.RequestException as e:
            logger.error(f"URLGenius API request failed: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"URLGenius shortening error: {str(e)}")
            return None
    
    def shorten_with_tinyurl(self, url):
        """Fallback URL shortening using TinyURL API."""
        try:
            api_url = f"http://tinyurl.com/api-create.php?url={url}"
            response = requests.get(api_url, timeout=10)
            
            if response.status_code == 200:
                short_url = response.text.strip()
                if short_url.startswith('http'):
                    logger.info(f"Successfully shortened URL with TinyURL: {url[:50]}...")
                    return short_url
            
            logger.warning(f"TinyURL API returned status {response.status_code}")
            return None
            
        except requests.exceptions.RequestException as e:
            logger.error(f"TinyURL API request failed: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"TinyURL shortening error: {str(e)}")
            return None
    
    def shorten_url(self, url):
        """Attempt URL shortening with URLGenius, fallback to TinyURL."""
        logger.info(f"Attempting to shorten URL: {url[:50]}...")
        
        # Try URLGenius first
        short_url = self.shorten_with_urlgenius(url)
        if short_url:
            return short_url
        
        # Fallback to TinyURL
        logger.info("URLGenius failed, trying TinyURL fallback...")
        short_url = self.shorten_with_tinyurl(url)
        if short_url:
            return short_url
        
        # If both fail, return original URL
        logger.warning("Both URL shortening services failed, using original URL")
        return url
    
    def convert_link(self, product):
        """
        Convert product URL to affiliate link and shorten it.
        
        Args:
            product (dict): Product dictionary with keys 'title', 'url', 'price'
        
        Returns:
            dict: Product dictionary with added 'affiliate_url' key
        """
        if not isinstance(product, dict) or 'url' not in product:
            logger.error("Invalid product format - missing 'url' key")
            return product
        
        original_url = product['url']
        product_title = product.get('title', 'Unknown Product')
        
        logger.info(f"Converting link for product: {product_title}")
        logger.info(f"Original URL: {original_url}")
        
        # Detect store and add appropriate affiliate parameters
        store = self.detect_store(original_url)
        
        if store == 'amazon':
            affiliate_url = self.add_amazon_affiliate(original_url)
        elif store == 'walmart':
            affiliate_url = self.add_walmart_affiliate(original_url)
        elif store == 'target':
            affiliate_url = self.add_target_affiliate(original_url)
        elif store == 'bestbuy':
            affiliate_url = self.add_bestbuy_affiliate(original_url)
        else:
            logger.warning(f"Unknown store for URL: {original_url}")
            affiliate_url = original_url
        
        # Attempt to shorten the affiliate URL
        shortened_url = self.shorten_url(affiliate_url)
        
        # Add the affiliate_url to the product dictionary
        product['affiliate_url'] = shortened_url
        
        logger.info(f"Conversion complete for {product_title}")
        logger.info(f"Final affiliate URL: {shortened_url}")
        
        return product
    
    def convert_multiple_links(self, products):
        """
        Convert multiple product links to affiliate links.
        
        Args:
            products (list): List of product dictionaries
        
        Returns:
            list: List of product dictionaries with affiliate_url added
        """
        if not isinstance(products, list):
            logger.error("Invalid input - expected list of products")
            return products
        
        logger.info(f"Converting {len(products)} product links to affiliate links")
        
        converted_products = []
        for i, product in enumerate(products):
            logger.info(f"Processing product {i+1}/{len(products)}")
            converted_product = self.convert_link(product)
            converted_products.append(converted_product)
        
        logger.info(f"Successfully converted {len(converted_products)} product links")
        return converted_products