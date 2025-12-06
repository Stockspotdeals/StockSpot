"""
Product Scoring Engine for AutoAffiliateHub-X2
Scores and ranks products based on multiple factors for prioritization.

Usage:
    scorer = ProductScorer()
    score = await scorer.score(enriched_item)
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import math
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

logger = logging.getLogger(__name__)

class ProductScorer:
    """Advanced product scoring engine with multiple scoring algorithms"""
    
    def __init__(self):
        """Initialize product scorer with scoring weights and thresholds"""
        
        # Scoring weights for different factors
        self.weights = {
            'hype_score': 0.30,      # Base hype from enricher
            'brand_value': 0.25,     # Brand recognition/value
            'recency': 0.20,         # How fresh the item is
            'engagement': 0.15,      # Social engagement metrics
            'scarcity': 0.10         # Limited edition/stock indicators
        }
        
        # Brand tier scoring
        self.brand_tiers = {
            'tier_1': {  # Ultra premium brands
                'brands': ['supreme', 'off-white', 'travis scott', 'yeezy'],
                'multiplier': 2.5
            },
            'tier_2': {  # Premium brands
                'brands': ['jordan', 'nike', 'adidas', 'rolex', 'apple'],
                'multiplier': 2.0
            },
            'tier_3': {  # High-end brands
                'brands': ['playstation', 'nintendo', 'pokemon', 'kith'],
                'multiplier': 1.5
            },
            'tier_4': {  # Standard brands
                'brands': ['xbox', 'funko', 'samsung'],
                'multiplier': 1.2
            }
        }
        
        # Category value multipliers
        self.category_values = {
            'sneakers': 1.8,
            'luxury': 2.2,
            'gaming': 1.6,
            'collectibles': 1.4,
            'electronics': 1.3,
            'clothing': 1.2,
            'other': 1.0
        }
        
        # Source reliability scores
        self.source_scores = {
            'twitter_post': 0.9,      # High reliability for Twitter drops
            'reddit_post': 0.8,       # Good community validation
            'rss_feed': 0.7,          # Moderate reliability
            'shopify_store': 0.85,    # Direct from store
            'retailer_scrape': 0.75   # Scraped data
        }
        
    def calculate_recency_score(self, item: Dict) -> float:
        """Calculate recency score based on item age
        
        Args:
            item: Product item dict
            
        Returns:
            Recency score (0.0 - 1.0)
        """
        try:
            release_date = item.get('release_date')
            if not release_date:
                return 0.5  # Default for unknown dates
                
            item_time = datetime.fromisoformat(release_date.replace('Z', '+00:00'))
            age_minutes = (datetime.now() - item_time.replace(tzinfo=None)).total_seconds() / 60
            
            # Exponential decay: newer items score higher
            # Full score for < 15 minutes, half score at 2 hours, near zero at 24 hours
            decay_factor = 0.1  # Controls decay rate
            recency_score = math.exp(-decay_factor * age_minutes / 60)  # Convert to hours
            
            return max(0.0, min(1.0, recency_score))
            
        except (ValueError, TypeError):
            return 0.3  # Default for parse errors
            
    def calculate_brand_score(self, item: Dict) -> float:
        """Calculate brand value score
        
        Args:
            item: Product item dict
            
        Returns:
            Brand score (0.0 - 1.0)
        """
        brand = item.get('brand')
        if not brand:
            return 0.2  # Default for unknown brands
            
        brand_lower = brand.lower()
        
        # Check tier membership
        for tier_info in self.brand_tiers.values():
            if brand_lower in tier_info['brands']:
                # Normalize multiplier to 0-1 scale
                return min(1.0, tier_info['multiplier'] / 2.5)
                
        return 0.3  # Default for unlisted brands
        
    def calculate_engagement_score(self, item: Dict) -> float:
        """Calculate social engagement score
        
        Args:
            item: Product item dict
            
        Returns:
            Engagement score (0.0 - 1.0)
        """
        source = item.get('source', '')
        meta = item.get('meta', {})
        
        if source == 'twitter_post':
            # Twitter engagement scoring
            engagement = meta.get('engagement_score', 0)
            # Log scale for engagement (high engagement gets diminishing returns)
            if engagement > 0:
                score = math.log10(engagement + 1) / 4  # Normalize to ~0-1 range
            else:
                score = 0
                
        elif source == 'reddit_post':
            # Reddit engagement scoring
            upvotes = meta.get('upvotes', 0)
            velocity = meta.get('velocity', 0)
            
            # Combined score from upvotes and velocity
            upvote_score = min(1.0, upvotes / 500)  # Max at 500 upvotes
            velocity_score = min(1.0, velocity / 100)  # Max at 100 velocity
            score = (upvote_score + velocity_score) / 2
            
        elif source == 'shopify_store':
            # New product discovery bonus
            score = 0.6
            
        else:
            # Default engagement for other sources
            score = 0.4
            
        return max(0.0, min(1.0, score))
        
    def calculate_scarcity_score(self, item: Dict) -> float:
        """Calculate scarcity/limited edition score
        
        Args:
            item: Product item dict
            
        Returns:
            Scarcity score (0.0 - 1.0)
        """
        score = 0.0
        
        # Limited edition bonus
        if item.get('limited_edition', False):
            score += 0.6
            
        # Stock status impact
        stock_status = item.get('stock_status', 'unknown')
        if stock_status == 'low_stock':
            score += 0.3
        elif stock_status == 'in_stock':
            score += 0.2
        elif stock_status == 'out_of_stock':
            score += 0.1  # Still valuable as a restock alert
            
        # Keywords indicating scarcity
        title = item.get('title', '').lower()
        scarcity_keywords = [
            'exclusive', 'rare', 'sold out', 'last chance',
            'limited time', 'few left', 'hurry', 'final drop'
        ]
        
        keyword_count = sum(1 for keyword in scarcity_keywords if keyword in title)
        score += min(0.3, keyword_count * 0.1)
        
        return max(0.0, min(1.0, score))
        
    def calculate_source_reliability(self, item: Dict) -> float:
        """Calculate source reliability multiplier
        
        Args:
            item: Product item dict
            
        Returns:
            Reliability multiplier (0.0 - 1.0)
        """
        source = item.get('source', 'unknown')
        return self.source_scores.get(source, 0.5)
        
    def calculate_category_multiplier(self, item: Dict) -> float:
        """Calculate category value multiplier
        
        Args:
            item: Product item dict
            
        Returns:
            Category multiplier
        """
        category = item.get('category', 'other')
        return self.category_values.get(category, 1.0)
        
    def calculate_state_transition_bonus(self, item: Dict, dedupe_store=None) -> float:
        """Calculate bonus for items transitioning from upcoming to live
        
        Args:
            item: Product item dict
            dedupe_store: DedupeStore instance to check previous state
            
        Returns:
            Bonus score (0.0 - 1.0)
        """
        try:
            release_state = item.get('release_state', 'live')
            
            # Only apply bonus for live items that are limited edition
            if release_state != 'live' or not item.get('limited_edition', False):
                return 0.0
                
            # If dedupe store is available, check if this was previously upcoming
            if dedupe_store:
                fingerprint = dedupe_store.generate_product_fingerprint(item)
                if fingerprint in dedupe_store.product_states:
                    previous_state = dedupe_store.product_states[fingerprint]['state']
                    if previous_state == 'upcoming':
                        return 1.0  # Full bonus for state transition
                        
            # Fallback: check for transition keywords in title/metadata
            title = item.get('title', '').lower()
            meta = item.get('meta', {})
            
            transition_indicators = [
                'now live', 'available now', 'live now', 'just dropped',
                'dropping now', 'released', 'launched'
            ]
            
            if any(indicator in title for indicator in transition_indicators):
                return 0.5  # Partial bonus for likely transition
                
            return 0.0
            
        except Exception as e:
            logger.warning(f"Error calculating state transition bonus: {e}")
            return 0.0

    async def score(self, item: Dict, dedupe_store=None) -> Tuple[float, Dict[str, float]]:
        """Calculate comprehensive product score with state transition awareness
        
        Args:
            item: Enriched product item
            dedupe_store: DedupeStore instance for state transition detection (optional)
            
        Returns:
            Tuple of (final_score, score_breakdown)
        """
        try:
            # Calculate individual component scores
            hype_base = item.get('hype_score', 0) / 100.0  # Normalize to 0-1
            recency = self.calculate_recency_score(item)
            brand_value = self.calculate_brand_score(item)
            engagement = self.calculate_engagement_score(item)
            scarcity = self.calculate_scarcity_score(item)
            state_transition = self.calculate_state_transition_bonus(item, dedupe_store)
            
            # Calculate weighted base score
            base_score = (
                hype_base * self.weights['hype_score'] +
                brand_value * self.weights['brand_value'] +
                recency * self.weights['recency'] +
                engagement * self.weights['engagement'] +
                scarcity * self.weights['scarcity']
            )
            
            # Apply multipliers
            source_reliability = self.calculate_source_reliability(item)
            category_multiplier = self.calculate_category_multiplier(item)
            
            # Calculate final score (0-100 scale)
            final_score = base_score * source_reliability * category_multiplier * 100
            
            # Add state transition bonus (up to +10 points)
            final_score += state_transition * 10
            
            final_score = max(0, min(100, final_score))
            
            # Create detailed score breakdown
            breakdown = {
                'base_components': {
                    'hype_score': round(hype_base, 3),
                    'recency': round(recency, 3),
                    'brand_value': round(brand_value, 3),
                    'engagement': round(engagement, 3),
                    'scarcity': round(scarcity, 3),
                    'state_transition': round(state_transition, 3)
                },
                'weighted_score': round(base_score, 3),
                'multipliers': {
                    'source_reliability': round(source_reliability, 3),
                    'category_multiplier': round(category_multiplier, 3)
                },
                'bonuses': {
                    'state_transition_bonus': round(state_transition * 10, 2)
                },
                'final_score': round(final_score, 2)
            }
            
            return final_score, breakdown
            
        except Exception as e:
            logger.error(f"Error calculating score for item {item.get('id', 'unknown')}: {e}")
            return 0.0, {'error': str(e)}
            
    async def score_batch(self, items: List[Dict], dedupe_store=None) -> List[Tuple[Dict, float, Dict]]:
        """Score multiple items efficiently with state transition awareness
        
        Args:
            items: List of enriched product items
            dedupe_store: DedupeStore instance for state transition detection (optional)
            
        Returns:
            List of (item, score, breakdown) tuples sorted by score (highest first)
        """
        scored_items = []
        
        for item in items:
            score, breakdown = await self.score(item, dedupe_store)
            scored_items.append((item, score, breakdown))
            
        # Sort by score (highest first)
        scored_items.sort(key=lambda x: x[1], reverse=True)
        
        return scored_items
        
    def get_score_explanation(self, breakdown: Dict) -> str:
        """Generate human-readable score explanation
        
        Args:
            breakdown: Score breakdown dict
            
        Returns:
            Explanation string
        """
        if 'error' in breakdown:
            return f"Scoring error: {breakdown['error']}"
            
        components = breakdown.get('base_components', {})
        multipliers = breakdown.get('multipliers', {})
        final_score = breakdown.get('final_score', 0)
        
        explanation = f"Score: {final_score:.1f}/100\n"
        explanation += "Breakdown:\n"
        
        # Component contributions
        for component, value in components.items():
            weight = self.weights.get(component, 0)
            contribution = value * weight * 100
            explanation += f"  • {component.replace('_', ' ').title()}: {value:.2f} → {contribution:.1f}pts\n"
            
        # Multipliers
        explanation += "Multipliers:\n"
        for multiplier, value in multipliers.items():
            explanation += f"  • {multiplier.replace('_', ' ').title()}: {value:.2f}x\n"
            
        return explanation


class ScoreTrends:
    """Track and analyze scoring trends over time"""
    
    def __init__(self):
        """Initialize trend tracker"""
        self.score_history = {}  # item_id -> list of score entries
        
    def record_score(self, item_id: str, score: float, timestamp: datetime = None):
        """Record a score for trend analysis
        
        Args:
            item_id: Product item ID
            score: Calculated score
            timestamp: Score timestamp (default: now)
        """
        if timestamp is None:
            timestamp = datetime.now()
            
        if item_id not in self.score_history:
            self.score_history[item_id] = []
            
        entry = {
            'score': score,
            'timestamp': timestamp.isoformat()
        }
        
        self.score_history[item_id].append(entry)
        
        # Keep only last 7 days
        cutoff = timestamp - timedelta(days=7)
        self.score_history[item_id] = [
            entry for entry in self.score_history[item_id]
            if datetime.fromisoformat(entry['timestamp']) > cutoff
        ]
        
    def get_trend(self, item_id: str) -> Dict[str, Any]:
        """Get scoring trend for an item
        
        Args:
            item_id: Product item ID
            
        Returns:
            Trend analysis dict
        """
        history = self.score_history.get(item_id, [])
        
        if len(history) < 2:
            return {'trend': 'insufficient_data', 'scores': len(history)}
            
        scores = [entry['score'] for entry in history]
        recent_scores = scores[-5:]  # Last 5 observations
        
        # Calculate trend
        if len(recent_scores) >= 2:
            if recent_scores[-1] > recent_scores[0] * 1.1:
                trend = 'increasing'
            elif recent_scores[-1] < recent_scores[0] * 0.9:
                trend = 'decreasing'
            else:
                trend = 'stable'
        else:
            trend = 'stable'
            
        return {
            'trend': trend,
            'current_score': scores[-1],
            'peak_score': max(scores),
            'avg_score': sum(scores) / len(scores),
            'score_count': len(scores),
            'score_range': max(scores) - min(scores)
        }


# Example usage and testing
async def main():
    """Example usage of product scorer"""
    
    # Sample enriched product data
    sample_items = [
        {
            'id': 'test_001',
            'title': 'Travis Scott x Nike Air Jordan 1 Retro High OG',
            'brand': 'travis scott',
            'category': 'sneakers',
            'hype_score': 85,
            'limited_edition': True,
            'release_date': datetime.now().isoformat(),
            'source': 'twitter_post',
            'stock_status': 'in_stock',
            'meta': {'engagement_score': 1250}
        },
        {
            'id': 'test_002',
            'title': 'Supreme Box Logo Hoodie Black',
            'brand': 'supreme',
            'category': 'clothing',
            'hype_score': 78,
            'limited_edition': True,
            'release_date': (datetime.now() - timedelta(hours=2)).isoformat(),
            'source': 'reddit_post',
            'stock_status': 'low_stock',
            'meta': {'upvotes': 156, 'velocity': 42}
        },
        {
            'id': 'test_003',
            'title': 'PlayStation 5 Console Restock',
            'brand': 'playstation',
            'category': 'gaming',
            'hype_score': 65,
            'limited_edition': False,
            'release_date': (datetime.now() - timedelta(hours=6)).isoformat(),
            'source': 'retailer_scrape',
            'stock_status': 'in_stock',
            'meta': {}
        }
    ]
    
    scorer = ProductScorer()
    
    print("Product Scorer Demo")
    print("=" * 50)
    
    scored_items = await scorer.score_batch(sample_items)
    
    for i, (item, score, breakdown) in enumerate(scored_items, 1):
        print(f"\n#{i} - {item['title']}")
        print(f"Final Score: {score:.1f}/100")
        print(f"Brand: {item.get('brand', 'Unknown')}")
        print(f"Category: {item.get('category', 'other')}")
        print(f"Source: {item.get('source', 'unknown')}")
        
        # Show top contributing factors
        components = breakdown.get('base_components', {})
        top_component = max(components.items(), key=lambda x: x[1]) if components else ('none', 0)
        print(f"Top Factor: {top_component[0]} ({top_component[1]:.2f})")


if __name__ == "__main__":
    # Run example when file is executed directly
    asyncio.run(main())