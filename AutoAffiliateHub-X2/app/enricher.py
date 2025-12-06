"""
Product Enrichment Engine for AutoAffiliateHub-X2
Enriches raw product data with additional metadata, affiliate links, and scoring factors.

Usage:
    enricher = ProductEnricher()
    enriched_item = await enricher.enrich(raw_item)
"""

import asyncio
import aiohttp
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import hashlib
import re
import sys
import os
from urllib.parse import urlparse, parse_qs, urlencode, urlunparse

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.settings import get_settings
from app.affiliate_link_engine import AffiliateEngine

logger = logging.getLogger(__name__)

class ProductEnricher:
    """Enriches product data with additional metadata and affiliate links"""
    
    def __init__(self):
        """Initialize product enricher"""
        settings = get_settings()
        self.test_mode = settings.get('test_mode', True)
        self.session = None
        self.affiliate_engine = AffiliateEngine()
        
        # Price tracking and trend analysis
        self.price_history = {}  # In-memory price tracking (would be database in production)
        
        # Brand value mappings for scoring
        self.brand_multipliers = {
            'nike': 1.5,
            'adidas': 1.4,
            'jordan': 2.0,
            'yeezy': 2.5,
            'supreme': 3.0,
            'off-white': 2.8,
            'travis scott': 2.2,
            'playstation': 1.8,
            'xbox': 1.6,
            'nintendo': 1.7,
            'apple': 1.9,
            'rolex': 4.0,
            'pokemon': 1.6,
            'funko': 1.2
        }
        
        # Category mappings
        self.category_keywords = {
            'sneakers': ['sneaker', 'shoe', 'jordan', 'yeezy', 'runner', 'trainer'],
            'gaming': ['ps5', 'xbox', 'nintendo', 'switch', 'playstation', 'console', 'game'],
            'clothing': ['hoodie', 'shirt', 't-shirt', 'jacket', 'pants', 'dress'],
            'electronics': ['iphone', 'airpods', 'macbook', 'ipad', 'samsung', 'pixel'],
            'collectibles': ['funko', 'pop', 'pokemon', 'card', 'figure', 'collectible'],
            'luxury': ['rolex', 'omega', 'gucci', 'louis vuitton', 'hermes']
        }
        
    async def __aenter__(self):
        """Async context manager entry"""
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=15),
            headers={'User-Agent': 'AutoAffiliateHub-X2 Enricher 1.0'}
        )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
            
    def extract_brand(self, title: str, meta: Dict = None) -> Optional[str]:
        """Extract brand from product title and metadata
        
        Args:
            title: Product title
            meta: Additional metadata dict
            
        Returns:
            Detected brand name (lowercase)
        """
        text_sources = [title.lower()]
        
        # Add additional text sources from meta
        if meta:
            if 'mentioned_brands' in meta:
                return meta['mentioned_brands'][0] if meta['mentioned_brands'] else None
            if 'description' in meta:
                text_sources.append(meta['description'].lower())
                
        full_text = ' '.join(text_sources)
        
        # Brand detection patterns (ordered by priority)
        brand_patterns = [
            (r'\b(travis\s+scott|travis.?scott)\b', 'travis scott'),
            (r'\b(off.?white|off\s+white)\b', 'off-white'),
            (r'\b(air\s+jordan|jordan)\b', 'jordan'),
            (r'\byeezy\b', 'yeezy'),
            (r'\b(nike|swoosh)\b', 'nike'),
            (r'\b(adidas|three\s+stripes)\b', 'adidas'),
            (r'\bsupreme\b', 'supreme'),
            (r'\bkith\b', 'kith'),
            (r'\b(playstation|ps5|ps4)\b', 'playstation'),
            (r'\b(xbox|microsoft)\b', 'xbox'),
            (r'\bnintendo\b', 'nintendo'),
            (r'\b(apple|iphone|ipad|airpods|macbook)\b', 'apple'),
            (r'\brolex\b', 'rolex'),
            (r'\bomega\b', 'omega'),
            (r'\bgucci\b', 'gucci'),
            (r'\b(pokemon|pokémon)\b', 'pokemon'),
            (r'\bfunko\b', 'funko')
        ]
        
        for pattern, brand in brand_patterns:
            if re.search(pattern, full_text):
                return brand
                
        return None
        
    def detect_category(self, title: str, brand: str = None) -> str:
        """Detect product category from title and brand
        
        Args:
            title: Product title
            brand: Detected brand
            
        Returns:
            Product category
        """
        text = title.lower()
        
        # Brand-based category detection
        if brand:
            if brand in ['nike', 'adidas', 'jordan', 'yeezy']:
                if any(kw in text for kw in ['hoodie', 'shirt', 'jacket']):
                    return 'clothing'
                else:
                    return 'sneakers'
            elif brand in ['playstation', 'xbox', 'nintendo']:
                return 'gaming'
            elif brand == 'apple':
                return 'electronics'
            elif brand in ['rolex', 'omega', 'gucci']:
                return 'luxury'
            elif brand in ['pokemon', 'funko']:
                return 'collectibles'
                
        # Keyword-based category detection
        for category, keywords in self.category_keywords.items():
            if any(keyword in text for keyword in keywords):
                return category
                
        return 'other'
        
    def detect_release_state(self, item: Dict) -> str:
        """Detect if product is upcoming or live based on multiple factors
        
        Args:
            item: Product item dict
            
        Returns:
            Release state: 'upcoming' or 'live'
        """
        try:
            title = item.get('title', '').lower()
            stock_status = item.get('stock_status', '').lower()
            
            # Check for upcoming keywords in title
            upcoming_keywords = [
                'preorder', 'pre-order', 'pre order', 'coming soon', 'drops on',
                'releases on', 'launching', 'available on', 'drops', 'releasing',
                'pre-sale', 'presale', 'early access', 'notify me', 'sign up',
                'raffle', 'draw', 'lottery', 'reserve', 'waitlist'
            ]
            
            # Check for live keywords in title
            live_keywords = [
                'available now', 'in stock', 'live now', 'buy now', 'shop now',
                'restocked', 'restock', 'back in stock', 'get yours', 'order now',
                'limited quantities', 'few left', 'last chance', 'hurry',
                'sold out', 'out of stock'  # These indicate it was live but now sold out
            ]
            
            # Priority 1: Explicit keywords in title
            if any(keyword in title for keyword in upcoming_keywords):
                return 'upcoming'
            
            if any(keyword in title for keyword in live_keywords):
                return 'live'
                
            # Priority 2: Stock status indicators
            if stock_status in ['pre_order', 'preorder', 'coming_soon', 'notify_me']:
                return 'upcoming'
                
            if stock_status in ['in_stock', 'low_stock', 'limited_stock', 'out_of_stock', 'sold_out']:
                return 'live'
                
            # Priority 3: Release date analysis
            release_date = item.get('release_date')
            if release_date:
                try:
                    # Parse release date
                    if isinstance(release_date, str):
                        release_dt = datetime.fromisoformat(release_date.replace('Z', '+00:00'))
                        release_dt = release_dt.replace(tzinfo=None)  # Remove timezone
                    else:
                        release_dt = release_date
                        
                    now = datetime.now()
                    time_diff = (release_dt - now).total_seconds() / 3600  # Hours
                    
                    # If release date is more than 1 hour in the future, consider upcoming
                    if time_diff > 1:
                        return 'upcoming'
                    # If within 1 hour or past, consider live
                    else:
                        return 'live'
                        
                except (ValueError, TypeError):
                    # If can't parse date, default to live
                    pass
                    
            # Priority 4: Source-specific logic
            source = item.get('source', '')
            meta = item.get('meta', {})
            
            if source == 'twitter_post':
                # Twitter posts about drops are usually live alerts
                tweet_text = meta.get('full_text', '').lower()
                if any(word in tweet_text for word in ['dropping', 'thursday', 'friday', 'next week']):
                    return 'upcoming'
                else:
                    return 'live'
                    
            elif source == 'reddit_post':
                # Reddit posts vary - check engagement and keywords
                if any(word in title for word in ['confirmed', 'leaked', 'rumor']):
                    return 'upcoming'
                else:
                    return 'live'
                    
            elif source in ['rss_feed', 'shopify_store', 'retailer_scrape']:
                # These sources typically show live products
                return 'live'
                
            # Default fallback: assume live
            return 'live'
            
        except Exception as e:
            logger.warning(f"Error detecting release state: {e}")
            return 'live'  # Default to live on error
        
    def calculate_hype_score(self, item: Dict) -> int:
        """Calculate product hype score based on various factors
        
        Args:
            item: Product item dict
            
        Returns:
            Hype score (0-100)
        """
        score = 0
        title = item.get('title', '').lower()
        meta = item.get('meta', {})
        brand = self.extract_brand(title, meta)
        
        # Base brand score
        if brand and brand in self.brand_multipliers:
            score += int(30 * self.brand_multipliers[brand])
            
        # Limited edition bonus
        if item.get('limited_edition', False):
            score += 25
            
        # Source-specific scoring
        source = item.get('source', '')
        if source == 'reddit_post':
            # Reddit engagement scoring
            velocity = meta.get('velocity', 0)
            upvotes = meta.get('upvotes', 0)
            score += min(15, velocity // 10)  # Velocity bonus
            score += min(10, upvotes // 50)   # Upvote bonus
            
        elif source == 'twitter_post':
            # Twitter engagement scoring
            engagement = meta.get('engagement_score', 0)
            score += min(20, engagement // 100)
            
        elif source == 'rss_feed':
            # RSS freshness scoring
            score += 10  # Base RSS bonus
            
        elif source == 'shopify_store':
            # New product bonus
            score += 15
            
        elif source == 'retailer_scrape':
            # Stock status bonus
            if item.get('stock_status') == 'in_stock':
                score += 10
                
        # Recency bonus
        try:
            release_date = datetime.fromisoformat(item['release_date'].replace('Z', '+00:00'))
            age_hours = (datetime.now() - release_date.replace(tzinfo=None)).total_seconds() / 3600
            
            if age_hours < 1:
                score += 20  # Very fresh
            elif age_hours < 6:
                score += 10  # Fresh
            elif age_hours < 24:
                score += 5   # Recent
                
        except (ValueError, KeyError):
            pass
            
        # Hype keywords bonus
        hype_keywords = [
            'exclusive', 'limited', 'rare', 'sold out', 'restock', 
            'collab', 'collaboration', 'special edition', 'travis scott',
            'fragment', 'off white', 'union', 'dior'
        ]
        
        for keyword in hype_keywords:
            if keyword in title:
                score += 5
                
        return min(100, max(0, score))
        
    async def enrich_with_price_data(self, item: Dict) -> Dict:
        """Enrich item with price trend and comparison data
        
        Args:
            item: Product item dict
            
        Returns:
            Item with added price trend data
        """
        item_id = item.get('id')
        current_price = item.get('price')
        
        if not item_id or not current_price:
            return item
            
        # Track price history (simplified in-memory tracking)
        if item_id not in self.price_history:
            self.price_history[item_id] = []
            
        price_entry = {
            'price': current_price,
            'timestamp': datetime.now().isoformat(),
            'store': item.get('store')
        }
        
        self.price_history[item_id].append(price_entry)
        
        # Keep only last 30 days of price history
        cutoff_date = datetime.now() - timedelta(days=30)
        self.price_history[item_id] = [
            entry for entry in self.price_history[item_id]
            if datetime.fromisoformat(entry['timestamp']) > cutoff_date
        ]
        
        # Calculate price trends
        history = self.price_history[item_id]
        if len(history) > 1:
            prices = [entry['price'] for entry in history]
            min_price = min(prices)
            max_price = max(prices)
            avg_price = sum(prices) / len(prices)
            
            # Price trend analysis
            recent_prices = prices[-5:]  # Last 5 observations
            if len(recent_prices) >= 2:
                if recent_prices[-1] < recent_prices[0]:
                    trend = 'decreasing'
                elif recent_prices[-1] > recent_prices[0]:
                    trend = 'increasing'
                else:
                    trend = 'stable'
            else:
                trend = 'unknown'
                
            item['price_data'] = {
                'current_price': current_price,
                'min_price': min_price,
                'max_price': max_price,
                'avg_price': round(avg_price, 2),
                'trend': trend,
                'history_count': len(history)
            }
            
        return item
        
    async def generate_affiliate_links(self, item: Dict) -> Dict:
        """Generate affiliate links for the product
        
        Args:
            item: Product item dict
            
        Returns:
            Item with added affiliate links
        """
        try:
            original_url = item.get('url')
            if not original_url:
                return item
                
            # Extract domain for affiliate matching
            parsed_url = urlparse(original_url)
            domain = parsed_url.netloc.lower()
            
            # Generate affiliate links using the affiliate engine
            affiliate_links = await self.affiliate_engine.generate_links(original_url)
            
            if affiliate_links:
                item['affiliate_links'] = affiliate_links
                # Use primary affiliate link as the main URL
                item['affiliate_url'] = affiliate_links[0]['url']
            else:
                item['affiliate_url'] = original_url
                
        except Exception as e:
            logger.warning(f"Error generating affiliate links: {e}")
            item['affiliate_url'] = item.get('url')
            
        return item
        
    async def enrich(self, item: Dict) -> Dict:
        """Fully enrich a product item with metadata and affiliate links
        
        Args:
            item: Raw product item
            
        Returns:
            Enriched product item
        """
        try:
            enriched_item = item.copy()
            
            # Extract brand and category
            brand = self.extract_brand(item.get('title', ''), item.get('meta'))
            category = self.detect_category(item.get('title', ''), brand)
            
            # Calculate hype score
            hype_score = self.calculate_hype_score(item)
            
            # Detect release state
            release_state = self.detect_release_state(item)
            
            # Add enrichment data
            enriched_item.update({
                'brand': brand,
                'category': category,
                'hype_score': hype_score,
                'release_state': release_state,
                'enriched_at': datetime.now().isoformat(),
                'enrichment_version': '1.0'
            })
            
            # Enrich with price data
            enriched_item = await self.enrich_with_price_data(enriched_item)
            
            # Generate affiliate links
            enriched_item = await self.generate_affiliate_links(enriched_item)
            
            # Calculate final priority score (for queue ordering)
            priority_score = hype_score
            
            # Boost priority based on factors
            if enriched_item.get('limited_edition'):
                priority_score += 20
            if brand and brand in ['supreme', 'yeezy', 'travis scott']:
                priority_score += 15
            if category in ['sneakers', 'gaming']:
                priority_score += 10
                
            enriched_item['priority_score'] = min(100, priority_score)
            
            logger.debug(f"Enriched item {item.get('id')}: brand={brand}, category={category}, hype={hype_score}")
            
            return enriched_item
            
        except Exception as e:
            logger.error(f"Error enriching item {item.get('id', 'unknown')}: {e}")
            # Return original item with minimal enrichment on error
            item.update({
                'brand': None,
                'category': 'other',
                'hype_score': 0,
                'priority_score': 0,
                'enriched_at': datetime.now().isoformat(),
                'enrichment_version': '1.0'
            })
            return item


# Example usage and testing
async def main():
    """Example usage of product enricher"""
    
    # Sample raw product data
    sample_items = [
        {
            'id': 'test_001',
            'title': 'Air Jordan 1 Retro High OG Chicago',
            'url': 'https://www.nike.com/t/air-jordan-1-retro-high-og-555088-101',
            'store': 'Nike SNKRS',
            'price': 170.00,
            'stock_status': 'in_stock',
            'release_date': datetime.now().isoformat(),
            'limited_edition': True,
            'source': 'shopify_store'
        },
        {
            'id': 'test_002', 
            'title': 'PlayStation 5 Console',
            'url': 'https://www.bestbuy.com/site/playstation-5-console/6426149.p',
            'store': 'Best Buy',
            'price': 499.99,
            'stock_status': 'in_stock',
            'release_date': datetime.now().isoformat(),
            'limited_edition': False,
            'source': 'retailer_scrape'
        }
    ]
    
    async with ProductEnricher() as enricher:
        print("Product Enricher Demo")
        print("=" * 40)
        
        for i, item in enumerate(sample_items, 1):
            enriched = await enricher.enrich(item)
            
            print(f"\nProduct {i}:")
            print(f"  Title: {enriched['title']}")
            print(f"  Brand: {enriched.get('brand', 'Unknown')}")
            print(f"  Category: {enriched.get('category', 'other')}")
            print(f"  Hype Score: {enriched.get('hype_score', 0)}")
            print(f"  Priority: {enriched.get('priority_score', 0)}")
            print(f"  Limited Edition: {enriched.get('limited_edition', False)}")
            if 'price_data' in enriched:
                print(f"  Price Trend: {enriched['price_data']['trend']}")


if __name__ == "__main__":
    # Run example when file is executed directly
    asyncio.run(main())