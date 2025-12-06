"""
Twitter Connector for AutoAffiliateHub-X2
Monitors Twitter for restock alerts and product drops.

Usage:
    connector = TwitterConnector(['@nikestore', '@supremenewyork', '@adidas'])
    async for item in connector.poll():
        print(item)
"""

import asyncio
import aiohttp
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, AsyncGenerator, Optional
import hashlib
import sys
import os
import re
from urllib.parse import urljoin, quote

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

from app.settings import get_settings

logger = logging.getLogger(__name__)

class TwitterConnector:
    """Twitter monitoring connector for restock alerts"""
    
    def __init__(self, accounts: List[str] = None):
        """Initialize Twitter connector with account list
        
        Args:
            accounts: List of Twitter usernames/handles to monitor
        """
        settings = get_settings()
        self.accounts = accounts or settings.get('connectors', {}).get('twitter_accounts', [])
        self.bearer_token = settings.get('connectors', {}).get('twitter_bearer_token')
        self.test_mode = settings.get('test_mode', True)
        self.session = None
        self.seen_tweets = set()
        
        # Restock keywords to filter tweets
        self.restock_keywords = [
            'restock', 'in stock', 'restocked', 'available now', 'drop',
            'live now', 'back in stock', 'new drop', 'just dropped',
            'limited', 'exclusive', 'release', 'launch', 'dropping',
            'sold out', 'last chance', 'limited time', 'hurry',
            'available', 'shop now', 'get yours', 'link in bio'
        ]
        
        # Common retail indicators
        self.retail_indicators = [
            'shop', 'buy', 'purchase', 'cart', 'checkout', 'order',
            'store', 'retail', 'sale', 'promo', 'discount', 'code'
        ]
        
    async def __aenter__(self):
        """Async context manager entry"""
        headers = {
            'User-Agent': 'AutoAffiliateHub-X2 Twitter Monitor 1.0'
        }
        
        if self.bearer_token and not self.test_mode:
            headers['Authorization'] = f'Bearer {self.bearer_token}'
            
        self.session = aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=30),
            headers=headers
        )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.session:
            await self.session.close()
            
    def calculate_engagement_score(self, tweet: Dict) -> int:
        """Calculate tweet engagement score
        
        Args:
            tweet: Twitter API tweet object
            
        Returns:
            Engagement score based on likes, retweets, replies
        """
        try:
            # Handle both API v1.1 and v2 response formats
            public_metrics = tweet.get('public_metrics', {})
            
            # Try v2 format first
            likes = public_metrics.get('like_count', 0)
            retweets = public_metrics.get('retweet_count', 0)
            replies = public_metrics.get('reply_count', 0)
            
            # Fallback to v1.1 format
            if not likes:
                likes = tweet.get('favorite_count', 0)
                retweets = tweet.get('retweet_count', 0)
                replies = tweet.get('reply_count', 0)
                
            # Calculate weighted engagement
            engagement = likes + (retweets * 3) + (replies * 2)
            
            # Factor in recency (tweets lose value over time)
            created_at = tweet.get('created_at', '')
            if created_at:
                try:
                    if 'T' in created_at:  # ISO format
                        tweet_time = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    else:  # Twitter's custom format
                        tweet_time = datetime.strptime(created_at, '%a %b %d %H:%M:%S %z %Y')
                        
                    age_hours = (datetime.now(tweet_time.tzinfo) - tweet_time).total_seconds() / 3600
                    recency_factor = max(0.1, 1 - (age_hours / 24))  # Decay over 24 hours
                    engagement = int(engagement * recency_factor)
                except (ValueError, TypeError):
                    pass
                    
            return min(engagement, 9999)  # Cap at 9999
            
        except (ValueError, TypeError):
            return 0
            
    def extract_links(self, tweet_text: str, entities: Dict = None) -> List[str]:
        """Extract links from tweet text and entities
        
        Args:
            tweet_text: Tweet text content
            entities: Twitter entities object with URLs
            
        Returns:
            List of expanded URLs
        """
        links = []
        
        # Extract from entities (most reliable)
        if entities and 'urls' in entities:
            for url_entity in entities['urls']:
                expanded_url = url_entity.get('expanded_url', url_entity.get('url', ''))
                if expanded_url:
                    links.append(expanded_url)
                    
        # Also scan text for any missed URLs
        url_pattern = r'https?://[^\s]+'
        text_urls = re.findall(url_pattern, tweet_text)
        
        for url in text_urls:
            # Clean up URL (remove trailing punctuation)
            clean_url = url.rstrip('.,;!)')
            if clean_url not in links:
                links.append(clean_url)
                
        return links
        
    def extract_hashtags(self, tweet_text: str, entities: Dict = None) -> List[str]:
        """Extract hashtags from tweet
        
        Args:
            tweet_text: Tweet text content  
            entities: Twitter entities object
            
        Returns:
            List of hashtags (without #)
        """
        hashtags = []
        
        # Extract from entities
        if entities and 'hashtags' in entities:
            for tag in entities['hashtags']:
                hashtag_text = tag.get('text', tag.get('tag', ''))
                if hashtag_text:
                    hashtags.append(hashtag_text.lower())
                    
        # Also extract from text as backup
        text_hashtags = re.findall(r'#(\w+)', tweet_text, re.IGNORECASE)
        for tag in text_hashtags:
            if tag.lower() not in hashtags:
                hashtags.append(tag.lower())
                
        return hashtags
        
    def normalize_tweet(self, tweet: Dict, username: str) -> Dict[str, Any]:
        """Normalize Twitter API response to unified schema
        
        Args:
            tweet: Raw Twitter API tweet object
            username: Source Twitter username
            
        Returns:
            Normalized product dict with unified schema
        """
        # Handle both API v1.1 and v2 formats
        tweet_id = tweet.get('id_str', tweet.get('id', ''))
        tweet_text = tweet.get('text', tweet.get('full_text', ''))
        
        # Generate unique ID
        item_id = hashlib.md5(f"twitter_{tweet_id}".encode()).hexdigest()[:12]
        
        # Parse timestamp
        created_at = tweet.get('created_at', '')
        created_date = datetime.now()
        
        if created_at:
            try:
                if 'T' in created_at:  # ISO format (API v2)
                    created_date = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                else:  # Twitter format (API v1.1)
                    created_date = datetime.strptime(created_at, '%a %b %d %H:%M:%S %z %Y')
                created_date = created_date.replace(tzinfo=None)  # Remove timezone for consistency
            except (ValueError, TypeError):
                logger.warning(f"Could not parse Twitter timestamp: {created_at}")
                
        # Calculate metrics
        engagement_score = self.calculate_engagement_score(tweet)
        
        # Extract entities
        entities = tweet.get('entities', {})
        links = self.extract_links(tweet_text, entities)
        hashtags = self.extract_hashtags(tweet_text, entities)
        
        # Detect brands and products
        brand_patterns = [
            r'\b(nike|adidas|jordan|yeezy|supreme|kith|off.?white)\b',
            r'\b(ps5|playstation|xbox|nintendo|switch|gpu|rtx)\b',
            r'\b(iphone|airpods|apple|samsung|pixel)\b',
            r'\b(pokemon|funko|pop|collectible|trading.?card)\b'
        ]
        
        mentioned_brands = []
        for pattern in brand_patterns:
            matches = re.findall(pattern, tweet_text, re.IGNORECASE)
            mentioned_brands.extend([match.lower() for match in matches])
            
        # Detect product drops/restocks
        is_drop = any(keyword in tweet_text.lower() for keyword in self.restock_keywords)
        is_retail = any(indicator in tweet_text.lower() for indicator in self.retail_indicators)
        
        # Check for limited edition indicators
        is_limited = any(keyword in tweet_text.lower() for keyword in [
            'limited', 'exclusive', 'rare', 'limited edition', 'special edition'
        ])
        
        # Build tweet URL
        tweet_url = f"https://twitter.com/{username.lstrip('@')}/status/{tweet_id}"
        
        return {
            'id': item_id,
            'title': tweet_text[:100] + '...' if len(tweet_text) > 100 else tweet_text,
            'url': tweet_url,
            'store': f'Twitter @{username.lstrip("@")}',
            'price': None,  # Twitter doesn't have structured price data
            'stock_status': 'unknown',
            'release_date': created_date.isoformat(),
            'limited_edition': is_limited,
            'source': 'twitter_post',
            'username': username,
            'meta': {
                'tweet_id': tweet_id,
                'tweet_url': tweet_url,
                'full_text': tweet_text,
                'engagement_score': engagement_score,
                'links': links,
                'hashtags': hashtags,
                'mentioned_brands': list(set(mentioned_brands)),
                'is_drop_alert': is_drop,
                'is_retail_tweet': is_retail,
                'author_username': username,
                'discovered_at': datetime.now().isoformat()
            }
        }
        
    async def fetch_user_timeline(self, username: str, count: int = 20) -> List[Dict]:
        """Fetch recent tweets from a user timeline
        
        Args:
            username: Twitter username (with or without @)
            count: Number of tweets to fetch
            
        Returns:
            List of normalized tweet items
        """
        clean_username = username.lstrip('@')
        
        try:
            # Use Twitter API v1.1 user timeline endpoint (most accessible)
            # Note: This requires API access, so we'll also provide RSS fallback
            
            if self.bearer_token and not self.test_mode:
                # Official API route
                url = 'https://api.twitter.com/1.1/statuses/user_timeline.json'
                params = {
                    'screen_name': clean_username,
                    'count': count,
                    'include_rts': 'false',  # Exclude retweets
                    'tweet_mode': 'extended'  # Get full text
                }
                
                async with self.session.get(url, params=params) as response:
                    if response.status == 401:
                        logger.warning(f"Twitter API authentication failed for @{clean_username}")
                        return []
                    elif response.status != 200:
                        logger.warning(f"Twitter API returned {response.status} for @{clean_username}")
                        return []
                        
                    tweets = await response.json()
            else:
                # Fallback: Try RSS/nitter (unofficial but works without auth)
                logger.info(f"Attempting RSS fallback for @{clean_username}")
                return await self.fetch_user_timeline_rss(clean_username, count)
                
            if not tweets:
                return []
                
            items = []
            for tweet in tweets:
                try:
                    # Filter for recent tweets (last 24 hours)
                    created_at = tweet.get('created_at', '')
                    if created_at:
                        try:
                            tweet_time = datetime.strptime(created_at, '%a %b %d %H:%M:%S %z %Y')
                            age_hours = (datetime.now(tweet_time.tzinfo) - tweet_time).total_seconds() / 3600
                            if age_hours > 24:  # Skip old tweets
                                continue
                        except ValueError:
                            pass
                            
                    # Filter for relevant content
                    tweet_text = tweet.get('full_text', tweet.get('text', '')).lower()
                    if not any(keyword in tweet_text for keyword in self.restock_keywords + self.retail_indicators):
                        continue
                        
                    normalized_item = self.normalize_tweet(tweet, clean_username)
                    
                    # Deduplication
                    if normalized_item['id'] not in self.seen_tweets:
                        self.seen_tweets.add(normalized_item['id'])
                        items.append(normalized_item)
                        
                except Exception as e:
                    logger.warning(f"Error normalizing tweet: {e}")
                    continue
                    
            logger.info(f"Found {len(items)} relevant tweets from @{clean_username}")
            return items
            
        except Exception as e:
            logger.error(f"Error fetching tweets from @{clean_username}: {e}")
            return []
            
    async def fetch_user_timeline_rss(self, username: str, count: int = 20) -> List[Dict]:
        """Fetch tweets using RSS/nitter as fallback
        
        Args:
            username: Twitter username
            count: Number of tweets to fetch
            
        Returns:
            List of normalized tweet items
        """
        try:
            # Try nitter instance (RSS feed)
            nitter_instances = [
                'nitter.net',
                'nitter.poast.org', 
                'nitter.pussthecat.org'
            ]
            
            for instance in nitter_instances:
                try:
                    url = f'https://{instance}/{username}/rss'
                    logger.debug(f"Trying nitter RSS: {url}")
                    
                    async with self.session.get(url) as response:
                        if response.status == 200:
                            # Parse RSS with simple regex (avoid extra dependency)
                            content = await response.text()
                            
                            # Extract items with regex
                            item_pattern = r'<item>.*?</item>'
                            items = re.findall(item_pattern, content, re.DOTALL)
                            
                            processed_items = []
                            for item_xml in items[:count]:
                                try:
                                    # Extract title and link
                                    title_match = re.search(r'<title><!\[CDATA\[(.*?)\]\]></title>', item_xml)
                                    link_match = re.search(r'<link>(.*?)</link>', item_xml)
                                    date_match = re.search(r'<pubDate>(.*?)</pubDate>', item_xml)
                                    
                                    if title_match and link_match:
                                        title = title_match.group(1)
                                        link = link_match.group(1)
                                        
                                        # Filter for relevant content
                                        if not any(keyword in title.lower() for keyword in self.restock_keywords + self.retail_indicators):
                                            continue
                                            
                                        # Create pseudo-tweet object
                                        pseudo_tweet = {
                                            'id_str': hashlib.md5(link.encode()).hexdigest()[:16],
                                            'text': title,
                                            'created_at': date_match.group(1) if date_match else '',
                                            'entities': {},
                                            'public_metrics': {'like_count': 0, 'retweet_count': 0, 'reply_count': 0}
                                        }
                                        
                                        normalized_item = self.normalize_tweet(pseudo_tweet, username)
                                        normalized_item['url'] = link  # Use nitter link
                                        
                                        if normalized_item['id'] not in self.seen_tweets:
                                            self.seen_tweets.add(normalized_item['id'])
                                            processed_items.append(normalized_item)
                                            
                                except Exception as e:
                                    logger.debug(f"Error parsing RSS item: {e}")
                                    continue
                                    
                            if processed_items:
                                logger.info(f"Retrieved {len(processed_items)} tweets via RSS from @{username}")
                                return processed_items
                                
                except Exception as e:
                    logger.debug(f"Nitter instance {instance} failed: {e}")
                    continue
                    
            logger.warning(f"All RSS methods failed for @{username}")
            return []
            
        except Exception as e:
            logger.error(f"Error in RSS fallback for @{username}: {e}")
            return []
            
    async def poll(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Poll all configured Twitter accounts for drops/restocks
        
        Yields:
            Normalized tweet items from Twitter accounts
        """
        if self.test_mode:
            # MOCK MODE: Return sample tweets
            logger.info("Twitter Connector running in MOCK MODE")
            async for item in self.mock_twitter_posts():
                yield item
            return
            
        if not self.accounts:
            logger.warning("No Twitter accounts configured for monitoring")
            return
            
        try:
            # Fetch from all accounts with limited concurrency
            semaphore = asyncio.Semaphore(3)  # Limit concurrent requests
            
            async def fetch_with_limit(account):
                async with semaphore:
                    return await self.fetch_user_timeline(account)
                    
            tasks = [fetch_with_limit(account) for account in self.accounts]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            for result in results:
                if isinstance(result, Exception):
                    logger.error(f"Twitter account fetch error: {result}")
                    continue
                    
                for item in result:
                    yield item
                    
        except Exception as e:
            logger.error(f"Error in Twitter polling: {e}")
            
    async def watch(self, interval: int = 300) -> AsyncGenerator[Dict[str, Any], None]:
        """Continuously monitor Twitter with polling interval
        
        Args:
            interval: Seconds between polls (default: 5 minutes)
            
        Yields:
            New tweets as they're discovered
        """
        logger.info(f"Starting Twitter monitoring (interval: {interval}s)")
        
        while True:
            try:
                async for item in self.poll():
                    yield item
                    
                logger.debug(f"Twitter poll complete, sleeping {interval}s")
                await asyncio.sleep(interval)
                
            except asyncio.CancelledError:
                logger.info("Twitter monitoring cancelled")
                break
            except Exception as e:
                logger.error(f"Error in Twitter monitoring: {e}")
                await asyncio.sleep(60)  # Error backoff
                
    async def mock_twitter_posts(self) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate mock Twitter posts for testing
        
        Yields:
            Sample Twitter post items with realistic data
        """
        mock_tweets = [
            {
                'id': 'mock_twitter_001',
                'title': 'RESTOCK ALERT: Air Jordan 1 Chicago now live on SNKRS! Get yours before they sell out 🔥',
                'url': 'https://twitter.com/nikestore/status/1234567890',
                'store': 'Twitter @nikestore',
                'price': None,
                'stock_status': 'unknown',
                'release_date': datetime.now().isoformat(),
                'limited_edition': True,
                'source': 'twitter_post',
                'username': 'nikestore',
                'meta': {
                    'tweet_id': '1234567890',
                    'tweet_url': 'https://twitter.com/nikestore/status/1234567890',
                    'full_text': 'RESTOCK ALERT: Air Jordan 1 Chicago now live on SNKRS! Get yours before they sell out 🔥 #Jordan #SNKRS',
                    'engagement_score': 1247,
                    'links': ['https://www.nike.com/launch/t/air-jordan-1-retro-high-og-chicago'],
                    'hashtags': ['jordan', 'snkrs'],
                    'mentioned_brands': ['jordan', 'nike'],
                    'is_drop_alert': True,
                    'is_retail_tweet': True,
                    'author_username': 'nikestore',
                    'discovered_at': datetime.now().isoformat()
                }
            },
            {
                'id': 'mock_twitter_002',
                'title': '🚨 PS5 RESTOCK 🚨 Available now at Best Buy! Link in bio. Limited quantities available!',
                'url': 'https://twitter.com/bestbuy/status/1234567891',
                'store': 'Twitter @bestbuy',
                'price': None,
                'stock_status': 'unknown',
                'release_date': datetime.now().isoformat(),
                'limited_edition': False,
                'source': 'twitter_post',
                'username': 'bestbuy',
                'meta': {
                    'tweet_id': '1234567891',
                    'tweet_url': 'https://twitter.com/bestbuy/status/1234567891',
                    'full_text': '🚨 PS5 RESTOCK 🚨 Available now at Best Buy! Link in bio. Limited quantities available! #PS5 #Gaming #Restock',
                    'engagement_score': 2156,
                    'links': ['https://www.bestbuy.com/site/playstation-5-console/6426149.p'],
                    'hashtags': ['ps5', 'gaming', 'restock'],
                    'mentioned_brands': ['ps5', 'playstation'],
                    'is_drop_alert': True,
                    'is_retail_tweet': True,
                    'author_username': 'bestbuy',
                    'discovered_at': datetime.now().isoformat()
                }
            },
            {
                'id': 'mock_twitter_003',
                'title': 'New Supreme drop this Thursday 11AM EST. Box Logo hoodies and more. Set your alarms! 📅',
                'url': 'https://twitter.com/supremenewyork/status/1234567892',
                'store': 'Twitter @supremenewyork',
                'price': None,
                'stock_status': 'unknown',
                'release_date': (datetime.now() + timedelta(days=2)).isoformat(),
                'limited_edition': True,
                'source': 'twitter_post',
                'username': 'supremenewyork',
                'meta': {
                    'tweet_id': '1234567892',
                    'tweet_url': 'https://twitter.com/supremenewyork/status/1234567892',
                    'full_text': 'New Supreme drop this Thursday 11AM EST. Box Logo hoodies and more. Set your alarms! 📅 #Supreme #Drop #BoxLogo',
                    'engagement_score': 892,
                    'links': ['https://www.supremenewyork.com'],
                    'hashtags': ['supreme', 'drop', 'boxlogo'],
                    'mentioned_brands': ['supreme'],
                    'is_drop_alert': True,
                    'is_retail_tweet': True,
                    'author_username': 'supremenewyork',
                    'discovered_at': datetime.now().isoformat()
                }
            }
        ]
        
        for tweet in mock_tweets:
            yield tweet
            await asyncio.sleep(1)  # Simulate API delay


# Example usage and testing
async def main():
    """Example usage of Twitter connector"""
    # Sample accounts (these would come from config)
    sample_accounts = ['@nikestore', '@supremenewyork', '@bestbuy']
    
    async with TwitterConnector(sample_accounts) as connector:
        print("Twitter Connector Demo")
        print("=" * 40)
        
        count = 0
        async for item in connector.poll():
            print(f"\nTweet {count + 1}:")
            print(f"  Text: {item['title']}")
            print(f"  Account: {item['username']}")
            print(f"  Engagement: {item['meta']['engagement_score']}")
            print(f"  Hashtags: {item['meta']['hashtags']}")
            print(f"  Brands: {item['meta']['mentioned_brands']}")
            print(f"  Drop Alert: {item['meta']['is_drop_alert']}")
            
            count += 1
            if count >= 3:  # Limit demo output
                break
                
        print(f"\nProcessed {count} Twitter posts")


if __name__ == "__main__":
    # Run example when file is executed directly
    asyncio.run(main())