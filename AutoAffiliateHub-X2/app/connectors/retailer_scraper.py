"""
Retail Website Scraper for AutoAffiliateHub-X2
Generic scraper for retail websites without APIs.

Usage:
    scraper = RetailerScraper()
    product = await scraper.scrape_product_page('https://example.com/product/123')
    
Optional: To enable JS-heavy site scraping, install Playwright and run:
    pip install playwright
    playwright install
    
Code falls back to aiohttp+BeautifulSoup if Playwright not available.
"""

import asyncio
import aiohttp
from bs4 import BeautifulSoup
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List
import hashlib
import sys
import os
import re
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.settings import get_settings

logger = logging.getLogger(__name__)

# Optional Playwright import
try:
    from playwright.async_api import async_playwright, Browser, Page
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.info("Playwright not available - using aiohttp+BeautifulSoup only")

class RetailerScraper:
    """Generic retail website scraper with optional Playwright support"""
    
    def __init__(self, use_playwright: bool = False):
        """Initialize retailer scraper
        
        Args:
            use_playwright: Whether to use Playwright for JS-heavy sites
        """
        settings = get_settings()
        self.test_mode = settings.get('test_mode', True)
        self.use_playwright = use_playwright and PLAYWRIGHT_AVAILABLE
        self.session = None
        self.browser = None
        self.robots_cache = {}  # Cache robots.txt results
        
        # Rate limiting
        self.request_delay = 2.0  # Seconds between requests (polite crawling)
        self.last_request_time = {}  # Domain -> timestamp
        
    async def __aenter__(self):
        """Async context manager entry"""
        # Initialize HTTP session
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=60),
            headers={
                'User-Agent': 'AutoAffiliateHub-X2 Scraper 1.0 (Contact: admin@example.com)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive'
            }
        )
        
        # Initialize Playwright if requested
        if self.use_playwright:
            try:
                self.playwright = await async_playwright().start()
                self.browser = await self.playwright.chromium.launch(
                    headless=True,
                    args=['--no-sandbox', '--disable-dev-shm-usage']
                )
                logger.info("Playwright browser initialized")
            except Exception as e:
                logger.warning(f"Failed to initialize Playwright: {e}")
                self.use_playwright = False
                
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
            
        if self.browser:
            await self.browser.close()
            
        if hasattr(self, 'playwright'):
            await self.playwright.stop()
            
    def can_fetch(self, url: str) -> bool:
        """Check if URL can be fetched according to robots.txt
        
        Args:
            url: URL to check
            
        Returns:
            True if URL can be fetched, False otherwise
        """
        try:
            parsed_url = urlparse(url)
            domain = parsed_url.netloc
            
            if domain in self.robots_cache:
                rp = self.robots_cache[domain]
            else:
                # Create and cache robots.txt parser
                rp = RobotFileParser()
                robots_url = f"{parsed_url.scheme}://{domain}/robots.txt"
                rp.set_url(robots_url)
                
                try:
                    rp.read()
                    self.robots_cache[domain] = rp
                except Exception:
                    # If robots.txt can't be read, assume crawling is allowed
                    logger.debug(f"Could not read robots.txt for {domain}")
                    self.robots_cache[domain] = None
                    return True
                    
            if rp is None:
                return True
                
            user_agent = 'AutoAffiliateHub-X2'
            return rp.can_fetch(user_agent, url)
            
        except Exception as e:
            logger.warning(f"Error checking robots.txt for {url}: {e}")
            return True  # Default to allowing if check fails
            
    async def respect_rate_limit(self, domain: str):
        """Implement polite rate limiting per domain
        
        Args:
            domain: Domain to rate limit
        """
        now = datetime.now().timestamp()
        
        if domain in self.last_request_time:
            time_since_last = now - self.last_request_time[domain]
            if time_since_last < self.request_delay:
                sleep_time = self.request_delay - time_since_last
                logger.debug(f"Rate limiting: sleeping {sleep_time:.1f}s for {domain}")
                await asyncio.sleep(sleep_time)
                
        self.last_request_time[domain] = now
        
    def extract_price(self, soup: BeautifulSoup, url: str) -> Optional[float]:
        """Extract price from HTML using common patterns
        
        Args:
            soup: BeautifulSoup parsed HTML
            url: Product URL for context
            
        Returns:
            Extracted price as float, or None if not found
        """
        price_selectors = [
            # Common price CSS selectors
            '.price', '#price', '.product-price', '.current-price',
            '.sale-price', '.regular-price', '.price-current',
            '[data-price]', '[data-testid*="price"]', '.price-box',
            '.product-price-value', '.pdp-price', '.notranslate'
        ]
        
        # Try CSS selectors first
        for selector in price_selectors:
            elements = soup.select(selector)
            for element in elements:
                # Check data attributes
                for attr in ['data-price', 'data-value', 'content']:
                    if element.has_attr(attr):
                        try:
                            return float(element[attr])
                        except (ValueError, TypeError):
                            continue
                            
                # Check element text
                text = element.get_text(strip=True)
                price = self.parse_price_text(text)
                if price:
                    return price
                    
        # Try regex patterns on full page text
        page_text = soup.get_text()
        return self.parse_price_text(page_text)
        
    def parse_price_text(self, text: str) -> Optional[float]:
        """Parse price from text using regex patterns
        
        Args:
            text: Text to search for price
            
        Returns:
            Extracted price as float, or None if not found
        """
        # Price regex patterns (ordered by specificity)
        price_patterns = [
            r'\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',  # $1,234.56
            r'USD\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',  # USD 1234.56
            r'(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*USD',  # 1234.56 USD
            r'Price:\s*\$?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)',  # Price: $1234.56
            r'(\d{1,4}(?:\.\d{2})?)(?=\s|$)',  # Simple decimal number
        ]
        
        for pattern in price_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                try:
                    # Clean up price string
                    clean_price = match.replace(',', '').strip()
                    price = float(clean_price)
                    
                    # Sanity check: price should be reasonable
                    if 0.01 <= price <= 100000:
                        return price
                except (ValueError, TypeError):
                    continue
                    
        return None
        
    def extract_stock_status(self, soup: BeautifulSoup) -> str:
        """Extract stock status from HTML
        
        Args:
            soup: BeautifulSoup parsed HTML
            
        Returns:
            Stock status string
        """
        # Check for common stock indicators
        stock_indicators = {
            'in_stock': [
                'in stock', 'available', 'add to cart', 'buy now',
                'purchase', 'order now', 'get it now'
            ],
            'out_of_stock': [
                'out of stock', 'sold out', 'unavailable', 'notify me',
                'email me', 'waitlist', 'coming soon'
            ],
            'low_stock': [
                'low stock', 'few left', 'limited quantity', 'hurry'
            ]
        }
        
        page_text = soup.get_text().lower()
        
        # Check each status type
        for status, keywords in stock_indicators.items():
            if any(keyword in page_text for keyword in keywords):
                return status
                
        # Check button text specifically
        buttons = soup.find_all(['button', 'input', 'a'], class_=re.compile(r'(add|buy|cart|purchase)'))
        for button in buttons:
            button_text = button.get_text(strip=True).lower()
            if 'add to cart' in button_text or 'buy' in button_text:
                return 'in_stock'
            elif 'notify' in button_text or 'waitlist' in button_text:
                return 'out_of_stock'
                
        return 'unknown'
        
    def extract_identifiers(self, soup: BeautifulSoup, url: str) -> Dict[str, str]:
        """Extract product identifiers (SKU, ASIN, UPC, etc.)
        
        Args:
            soup: BeautifulSoup parsed HTML
            url: Product URL
            
        Returns:
            Dictionary of found identifiers
        """
        identifiers = {}
        
        # Extract from URL
        url_match = re.search(r'/([A-Z0-9]{10,15})(?:/|$)', url)  # ASIN pattern
        if url_match:
            identifiers['asin_candidate'] = url_match.group(1)
            
        # Check meta tags and data attributes
        identifier_patterns = {
            'sku': [
                'data-sku', 'data-product-sku', 'data-variant-sku',
                'product-sku', 'sku'
            ],
            'asin': [
                'data-asin', 'data-amazon-id', 'amazon-id'
            ],
            'upc': [
                'data-upc', 'data-barcode', 'upc'
            ],
            'mpn': [
                'data-mpn', 'manufacturer-part-number', 'mpn'
            ]
        }
        
        for id_type, selectors in identifier_patterns.items():
            for selector in selectors:
                elements = soup.find_all(attrs={selector: True})
                for element in elements:
                    value = element.get(selector)
                    if value and len(value) > 3:
                        identifiers[id_type] = value
                        break
                if id_type in identifiers:
                    break
                    
        return identifiers
        
    async def scrape_with_aiohttp(self, url: str) -> Dict[str, Any]:
        """Scrape product page using aiohttp + BeautifulSoup
        
        Args:
            url: Product URL to scrape
            
        Returns:
            Scraped product data
        """
        try:
            domain = urlparse(url).netloc
            await self.respect_rate_limit(domain)
            
            async with self.session.get(url) as response:
                if response.status != 200:
                    logger.warning(f"HTTP {response.status} for {url}")
                    return {}
                    
                html = await response.text()
                
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return {}
            
        return self.parse_html(html, url)
        
    async def scrape_with_playwright(self, url: str) -> Dict[str, Any]:
        """Scrape product page using Playwright (for JS-heavy sites)
        
        Args:
            url: Product URL to scrape
            
        Returns:
            Scraped product data
        """
        try:
            domain = urlparse(url).netloc
            await self.respect_rate_limit(domain)
            
            page = await self.browser.new_page()
            
            # Set realistic viewport and user agent
            await page.set_viewport_size({"width": 1920, "height": 1080})
            
            # Navigate to page
            await page.goto(url, wait_until="networkidle", timeout=30000)
            
            # Wait for dynamic content
            await page.wait_for_timeout(3000)
            
            # Get page HTML
            html = await page.content()
            await page.close()
            
            return self.parse_html(html, url)
            
        except Exception as e:
            logger.error(f"Error scraping {url} with Playwright: {e}")
            return {}
            
    def parse_html(self, html: str, url: str) -> Dict[str, Any]:
        """Parse HTML and extract product information
        
        Args:
            html: Raw HTML content
            url: Source URL
            
        Returns:
            Extracted product data
        """
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract title
        title = 'Unknown Product'
        title_selectors = ['h1', '.product-title', '.product-name', 'title']
        for selector in title_selectors:
            element = soup.select_one(selector)
            if element:
                title = element.get_text(strip=True)
                if len(title) > 5:  # Reasonable title length
                    break
                    
        # Extract other data
        price = self.extract_price(soup, url)
        stock_status = self.extract_stock_status(soup)
        identifiers = self.extract_identifiers(soup, url)
        
        # Extract images
        images = []
        img_selectors = [
            'img[src*="product"]', '.product-image img', 
            '.gallery img', '[data-zoom-image]'
        ]
        for selector in img_selectors:
            elements = soup.select(selector)
            for img in elements[:3]:  # First 3 images
                src = img.get('src') or img.get('data-src') or img.get('data-zoom-image')
                if src:
                    if src.startswith('/'):
                        src = urljoin(url, src)
                    images.append(src)
                    
        return {
            'title': title,
            'price': price,
            'stock_status': stock_status,
            'identifiers': identifiers,
            'images': images,
            'scraped_at': datetime.now().isoformat()
        }
        
    async def scrape_product_page(self, url: str) -> Dict[str, Any]:
        """Scrape product page and return normalized data
        
        Args:
            url: Product URL to scrape
            
        Returns:
            Normalized product dict with unified schema
        """
        if self.test_mode:
            # MOCK MODE: Return sample scraped data
            return self.mock_scrape_result(url)
            
        # Check robots.txt
        if not self.can_fetch(url):
            logger.warning(f"Robots.txt disallows scraping {url}")
            return {}
            
        # Choose scraping method
        if self.use_playwright:
            scraped_data = await self.scrape_with_playwright(url)
        else:
            scraped_data = await self.scrape_with_aiohttp(url)
            
        if not scraped_data:
            return {}
            
        # Normalize to unified schema
        product_id = hashlib.md5(url.encode()).hexdigest()[:12]
        store_domain = urlparse(url).netloc
        store_name = store_domain.replace('www.', '').split('.')[0].title()
        
        return {
            'id': product_id,
            'title': scraped_data.get('title', 'Unknown Product'),
            'url': url,
            'store': store_name,
            'price': scraped_data.get('price'),
            'stock_status': scraped_data.get('stock_status', 'unknown'),
            'release_date': datetime.now().isoformat(),
            'limited_edition': False,  # Cannot determine from scraping
            'source': 'retailer_scraper',
            'meta': {
                'identifiers': scraped_data.get('identifiers', {}),
                'images': scraped_data.get('images', []),
                'scraped_at': scraped_data.get('scraped_at'),
                'scraping_method': 'playwright' if self.use_playwright else 'aiohttp'
            }
        }
        
    def mock_scrape_result(self, url: str) -> Dict[str, Any]:
        """Generate mock scraping result for testing
        
        Args:
            url: URL being "scraped"
            
        Returns:
            Mock scraped data
        """
        mock_data = {
            'title': f'Mock Product from {urlparse(url).netloc}',
            'price': 99.99,
            'stock_status': 'in_stock',
            'identifiers': {
                'sku': 'MOCK-SKU-123',
                'asin': 'B08MOCK123'
            },
            'images': [
                'https://example.com/product1.jpg',
                'https://example.com/product2.jpg'
            ],
            'scraped_at': datetime.now().isoformat()
        }
        
        logger.info(f"MOCK: Scraped {url} -> {mock_data['title']}")
        return mock_data


# Example usage and testing
async def main():
    """Example usage of retailer scraper"""
    sample_urls = [
        'https://www.amazon.com/dp/B08N5WRWNW',  # Example product
        'https://www.bestbuy.com/site/product/6418599.p',
        'https://www.target.com/p/example-product/-/A-12345'
    ]
    
    async with RetailerScraper(use_playwright=False) as scraper:
        print("Retailer Scraper Demo")
        print("=" * 40)
        
        for i, url in enumerate(sample_urls[:2]):  # Limit to 2 for demo
            print(f"\nScraping URL {i+1}: {url}")
            product = await scraper.scrape_product_page(url)
            
            if product:
                print(f"  Title: {product['title']}")
                print(f"  Price: ${product['price']}" if product['price'] else "  Price: N/A")
                print(f"  Stock: {product['stock_status']}")
                print(f"  Store: {product['store']}")
                print(f"  Method: {product['meta']['scraping_method']}")
            else:
                print("  No data extracted")
                
        print("\nScraping demo complete")


if __name__ == "__main__":
    # Run example when file is executed directly
    asyncio.run(main())