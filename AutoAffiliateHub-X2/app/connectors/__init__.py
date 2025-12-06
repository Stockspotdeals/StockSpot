"""
AutoAffiliateHub-X2 Connectors Module
High-throughput deal discovery connectors for various data sources.
"""

__version__ = "1.0.0"
__all__ = [
    "rss_connector",
    "shopify_connector", 
    "retailer_scraper",
    "reddit_connector",
    "twitter_connector"
]

# Import all connectors for easy access
from .rss_connector import RSSConnector
from .shopify_connector import ShopifyConnector
from .retailer_scraper import RetailerScraper
from .reddit_connector import RedditConnector
from .twitter_connector import TwitterConnector