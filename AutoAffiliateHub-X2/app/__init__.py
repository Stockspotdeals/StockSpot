"""
StockSpot App Module
Amazon affiliate marketing automation with Twitter integration
"""

__version__ = "1.0.0"
__author__ = "StockSpot"

# Import core services for easy access
from .twitter_client import TwitterClient, get_twitter_client, post_to_twitter
from .affiliate_link_engine import AffiliateLinkEngine
from .deal_engine import DealEngine

# Export main classes
__all__ = [
    'TwitterClient',
    'get_twitter_client', 
    'post_to_twitter',
    'AffiliateLinkEngine',
    'DealEngine'
]