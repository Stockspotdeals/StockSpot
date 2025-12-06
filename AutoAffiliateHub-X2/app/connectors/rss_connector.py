"""
RSS Feed Connector for AutoAffiliateHub-X2
Monitors RSS feeds for product drops and deals.

Usage:
    connector = RSSConnector(['https://example.com/feed.xml'])
    for item in connector.poll():
        print(item)
"""

import asyncio
import aiohttp
import feedparser
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, AsyncGenerator
import hashlib
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.settings import get_settings

logger = logging.getLogger(__name__)

class RSSConnector:
    """RSS feed monitoring connector with async support"""
    
    def __init__(self, feed_urls: List[str] = None):
        """Initialize RSS connector with feed URLs
        
        Args:
            feed_urls: List of RSS feed URLs to monitor
        """
        settings = get_settings()
        self.feed_urls = feed_urls or settings.get('connectors', {}).get('rss_feeds', [])
        self.test_mode = settings.get('test_mode', True)
        self.session = None
        self.seen_items = set()  # Simple deduplication
        
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers={'User-Agent': 'AutoAffiliateHub-X2 RSS Monitor 1.0'}
        )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
            
    def normalize_item(self, feed_entry: Dict, feed_url: str) -> Dict[str, Any]:
        """Normalize RSS feed entry to unified schema
        
        Args:
            feed_entry: Raw feedparser entry
            feed_url: Source feed URL
            
        Returns:
            Normalized product dict with unified schema
        """
        # Extract basic info
        title = feed_entry.get('title', 'Unknown Product')
        url = feed_entry.get('link', '')
        
        # Generate unique ID
        item_id = hashlib.md5(f"{url}{title}".encode()).hexdigest()[:12]
        
        # Parse date
        published = None
        if 'published_parsed' in feed_entry and feed_entry['published_parsed']:
            try:
                published = datetime(*feed_entry['published_parsed'][:6])
            except (ValueError, TypeError):
                published = datetime.now()
        else:
            published = datetime.now()
            
        # Extract price from description or title
        price = None
        description = feed_entry.get('description', '') + ' ' + title
        
        # Simple price extraction patterns
        import re
        price_patterns = [
            r'\$(\d+(?:\.\d{2})?)',  # $19.99
            r'(\d+(?:\.\d{2})?)\s*USD',  # 19.99 USD
            r'Price:\s*\$?(\d+(?:\.\d{2})?)'  # Price: $19.99
        ]
        
        for pattern in price_patterns:
            match = re.search(pattern, description, re.IGNORECASE)
            if match:
                try:
                    price = float(match.group(1))
                    break
                except ValueError:
                    continue
                    
        # Detect limited edition indicators
        limited_keywords = [
            'limited', 'exclusive', 'rare', 'drop', 'restock', 
            'limited edition', 'exclusive release', 'pre-order'
        ]
        
        is_limited = any(keyword in description.lower() for keyword in limited_keywords)
        
        # Extract store from feed URL or description
        store = 'Unknown Store'
        if 'reddit.com' in feed_url:
            store = 'Reddit'
        elif 'twitter.com' in feed_url:
            store = 'Twitter'
        else:
            # Try to extract domain name
            from urllib.parse import urlparse
            try:
                domain = urlparse(feed_url).netloc
                store = domain.replace('www.', '').split('.')[0].title()
            except Exception:
                store = 'RSS Feed'
                
        return {
            'id': item_id,
            'title': title,
            'url': url,
            'store': store,
            'price': price,
            'stock_status': 'unknown',  # RSS feeds rarely have stock info
            'release_date': published.isoformat() if published else None,
            'limited_edition': is_limited,
            'source': 'rss_feed',
            'feed_url': feed_url,
            'meta': {
                'description': feed_entry.get('description', ''),
                'author': feed_entry.get('author', ''),
                'tags': feed_entry.get('tags', []),
                'discovered_at': datetime.now().isoformat()
            }
        }
        
    async def fetch_feed(self, feed_url: str) -> List[Dict]:
        """Fetch and parse single RSS feed
        
        Args:
            feed_url: RSS feed URL to fetch
            
        Returns:
            List of normalized product items
        """
        try:
            logger.debug(f"Fetching RSS feed: {feed_url}")
            
            async with self.session.get(feed_url) as response:
                if response.status != 200:
                    logger.warning(f"RSS feed returned status {response.status}: {feed_url}")
                    return []
                    
                content = await response.text()
                
            # Parse feed with feedparser
            feed = feedparser.parse(content)
            
            if not feed.entries:
                logger.debug(f"No entries found in feed: {feed_url}")
                return []
                
            items = []
            for entry in feed.entries:
                try:
                    normalized_item = self.normalize_item(entry, feed_url)
                    
                    # Simple deduplication
                    if normalized_item['id'] not in self.seen_items:
                        self.seen_items.add(normalized_item['id'])
                        items.append(normalized_item)
                        
                except Exception as e:
                    logger.warning(f"Error normalizing RSS entry: {e}")
                    continue
                    
            logger.info(f"Found {len(items)} new items from {feed_url}")
            return items
            
        except asyncio.TimeoutError:
            logger.warning(f"Timeout fetching RSS feed: {feed_url}")
            return []
        except Exception as e:
            logger.error(f"Error fetching RSS feed {feed_url}: {e}")
            return []
            
    async def poll(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Poll all configured RSS feeds for new items
        
        Yields:
            Normalized product items from RSS feeds
        """
        if self.test_mode:
            # MOCK MODE: Return sample RSS items
            logger.info("RSS Connector running in MOCK MODE")
            async for item in self.mock_feeds():
                yield item
            return
            
        if not self.feed_urls:
            logger.warning("No RSS feed URLs configured")
            return
            
        try:
            # Fetch all feeds concurrently
            tasks = [self.fetch_feed(url) for url in self.feed_urls]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"RSS feed fetch error: {result}")
                    continue
                    
                for item in result:
                    yield item
                    
        except Exception as e:
            logger.error(f"Error in RSS polling: {e}")
            
    async def watch(self, interval: int = 300) -> AsyncGenerator[Dict[str, Any], None]:
        """Continuously watch RSS feeds with polling interval
        
        Args:
            interval: Seconds between polls (default: 5 minutes)
            
        Yields:
            New product items as they're discovered
        """
        logger.info(f"Starting RSS feed monitoring (interval: {interval}s)")
        
        while True:
            try:
                async for item in self.poll():
                    yield item
                    
                logger.debug(f"RSS poll complete, sleeping {interval}s")
                await asyncio.sleep(interval)
                
            except asyncio.CancelledError:
                logger.info("RSS monitoring cancelled")
                break
            except Exception as e:
                logger.error(f"Error in RSS monitoring: {e}")
                await asyncio.sleep(60)  # Error backoff
                
    async def mock_feeds(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate mock RSS feed items for testing
        
        Yields:
            Sample product items with realistic data
        """
        mock_items = [
            {
                'id': 'mock_rss_001',
                'title': 'Nike Air Jordan 1 Retro High OG "Chicago" - RESTOCK ALERT',
                'url': 'https://www.nike.com/t/air-jordan-1-retro-high-og-chicago-555088-101',
                'store': 'Nike',
                'price': 170.00,
                'stock_status': 'in_stock',
                'release_date': datetime.now().isoformat(),
                'limited_edition': True,
                'source': 'rss_feed',
                'feed_url': 'https://mock-sneaker-feed.com/rss',
                'meta': {
                    'description': 'The iconic Chicago colorway is back in stock! Limited quantities available.',
                    'discovered_at': datetime.now().isoformat()
                }
            },
            {
                'id': 'mock_rss_002', 
                'title': 'PlayStation 5 Console - IN STOCK NOW',
                'url': 'https://direct.playstation.com/en-us/consoles/console/playstation5-console.3006646',
                'store': 'PlayStation Direct',
                'price': 499.99,
                'stock_status': 'in_stock',
                'release_date': datetime.now().isoformat(),
                'limited_edition': False,
                'source': 'rss_feed',
                'feed_url': 'https://mock-gaming-feed.com/rss',
                'meta': {
                    'description': 'PS5 console available for immediate shipping. Get yours before they sell out!',
                    'discovered_at': datetime.now().isoformat()
                }
            },
            {
                'id': 'mock_rss_003',
                'title': 'Supreme Box Logo Hoodie FW24 - DROP LIVE',
                'url': 'https://www.supremenewyork.com/shop/sweatshirts/box-logo-hoodie-fw24',
                'store': 'Supreme',
                'price': 198.00,
                'stock_status': 'in_stock', 
                'release_date': datetime.now().isoformat(),
                'limited_edition': True,
                'source': 'rss_feed',
                'feed_url': 'https://mock-streetwear-feed.com/rss',
                'meta': {
                    'description': 'FW24 Box Logo Hoodie drop is now live. Multiple colorways available.',
                    'discovered_at': datetime.now().isoformat()
                }
            }
        ]
        
        for item in mock_items:
            yield item
            await asyncio.sleep(1)  # Simulate feed polling delay


# Example usage and testing
async def main():
    """Example usage of RSS connector"""
    # Sample RSS feeds (these would come from config)
    sample_feeds = [
        'https://www.reddit.com/r/sneakers/.rss',
        'https://www.reddit.com/r/GameSale/.rss'
    ]
    
    async with RSSConnector(sample_feeds) as connector:
        print("RSS Connector Demo")
        print("=" * 40)
        
        count = 0
        async for item in connector.poll():
            print(f"\nItem {count + 1}:")
            print(f"  Title: {item['title']}")
            print(f"  Store: {item['store']}")
            print(f"  Price: ${item['price']}" if item['price'] else "  Price: N/A")
            print(f"  Limited: {item['limited_edition']}")
            print(f"  URL: {item['url']}")
            
            count += 1
            if count >= 3:  # Limit demo output
                break
                
        print(f"\nProcessed {count} RSS items")


if __name__ == "__main__":
    # Run example when file is executed directly
    asyncio.run(main())