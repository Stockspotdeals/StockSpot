"""
Demo script for release state deduplication logic
Shows upcoming → live transition functionality for limited edition items.
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import only local modules (no external dependencies)
from app.dedupe_store import DedupeStore
from app.queue_manager import QueueManager


class MockEnricher:
    """Mock enricher for demo purposes"""
    
    def detect_release_state(self, item):
        """Mock release state detection"""
        title = item.get('title', '').lower()
        stock_status = item.get('stock_status', '').lower()
        
        # Check for upcoming keywords
        upcoming_keywords = ['preorder', 'coming soon', 'drops on', 'thursday']
        if any(keyword in title for keyword in upcoming_keywords):
            return 'upcoming'
            
        if stock_status in ['preorder', 'coming_soon', 'notify_me']:
            return 'upcoming'
            
        # Check for live keywords
        live_keywords = ['available now', 'in stock', 'live now', 'buy now']
        if any(keyword in title for keyword in live_keywords):
            return 'live'
            
        return 'live'  # Default


class MockScorer:
    """Mock scorer for demo purposes"""
    
    async def score(self, item, dedupe_store=None):
        """Mock scoring with state transition bonus"""
        base_score = 75.0  # Base score
        
        # Add transition bonus if applicable
        transition_bonus = 0.0
        if (dedupe_store and item.get('release_state') == 'live' and 
            item.get('limited_edition', False)):
            
            fingerprint = dedupe_store.generate_product_fingerprint(item)
            if fingerprint in dedupe_store.product_states:
                previous_state = dedupe_store.product_states[fingerprint]['state']
                if previous_state == 'upcoming':
                    transition_bonus = 10.0  # Bonus for transition
                    
        final_score = base_score + transition_bonus
        
        breakdown = {
            'base_score': base_score,
            'transition_bonus': transition_bonus,
            'final_score': final_score
        }
        
        return final_score, breakdown


async def demo_release_state_logic():
    """Demonstrate the release state deduplication logic"""
    
    print("🚀 Release State Deduplication Demo")
    print("=" * 50)
    
    # Initialize components
    dedupe_store = DedupeStore()
    queue_manager = QueueManager()
    enricher = MockEnricher()
    scorer = MockScorer()
    
    # Sample limited edition product
    base_item = {
        'id': 'travis_jordan_001',
        'title': 'Travis Scott x Nike Air Jordan 1 Retro High OG',
        'url': 'https://www.nike.com/t/air-jordan-1-travis-scott-555088-100',
        'brand': 'travis scott',
        'category': 'sneakers',
        'store': 'Nike SNKRS',
        'price': 175.00,
        'limited_edition': True,
        'source': 'twitter_post',
        'release_date': datetime.now().isoformat()
    }
    
    # Step 1: Add upcoming version
    print("\n📅 Step 1: Adding UPCOMING version...")
    upcoming_item = base_item.copy()
    upcoming_item.update({
        'title': 'Travis Scott x Nike Air Jordan 1 - Drops Thursday 11AM EST',
        'stock_status': 'preorder',
        'release_state': 'upcoming'
    })
    
    is_dup, dup_id, match_type = await dedupe_store.is_duplicate(upcoming_item)
    print(f"   Duplicate check: {is_dup} ({match_type})")
    
    success = await dedupe_store.add(upcoming_item)
    print(f"   Added to dedupe store: {'✅' if success else '❌'}")
    
    score, breakdown = await scorer.score(upcoming_item, dedupe_store)
    success = await queue_manager.add_item(upcoming_item, score, dedupe_store)
    print(f"   Added to queue: {'✅' if success else '❌'} (Score: {score:.1f})")
    
    # Step 2: Try adding same upcoming version again
    print("\n🔄 Step 2: Adding SAME upcoming version again...")
    upcoming_item2 = base_item.copy()
    upcoming_item2.update({
        'title': 'Travis Scott Jordan 1 - Coming Soon to SNKRS',
        'stock_status': 'preorder', 
        'release_state': 'upcoming'
    })
    
    is_dup, dup_id, match_type = await dedupe_store.is_duplicate(upcoming_item2)
    print(f"   Duplicate check: {is_dup} ({'❌ BLOCKED - ' + match_type if is_dup else '✅ ALLOWED'})")
    
    # Step 3: Add live version (state transition)
    print("\n🔥 Step 3: Adding LIVE version (state transition)...")
    live_item = base_item.copy()
    live_item.update({
        'title': 'Travis Scott x Nike Air Jordan 1 - AVAILABLE NOW!',
        'stock_status': 'in_stock',
        'release_state': 'live'
    })
    
    is_dup, dup_id, match_type = await dedupe_store.is_duplicate(live_item)
    match_desc = match_type if match_type else "None"
    print(f"   Duplicate check: {is_dup} ({'✅ TRANSITION ALLOWED - ' + match_desc if not is_dup else '❌ BLOCKED - ' + match_desc})")
    
    success = await dedupe_store.add(live_item)
    print(f"   Added to dedupe store: {'✅' if success else '❌'}")
    
    score, breakdown = await scorer.score(live_item, dedupe_store)
    print(f"   Score with transition bonus: {score:.1f} (+{breakdown['transition_bonus']:.1f} bonus)")
    
    success = await queue_manager.add_item(live_item, score, dedupe_store)
    print(f"   Added to queue: {'✅' if success else '❌'}")
    
    # Step 4: Try adding same live version again
    print("\n🚫 Step 4: Adding SAME live version again...")
    live_item2 = base_item.copy()
    live_item2.update({
        'title': 'Travis Scott Jordan 1 - Still Available',
        'stock_status': 'in_stock',
        'release_state': 'live'
    })
    
    is_dup, dup_id, match_type = await dedupe_store.is_duplicate(live_item2)
    match_desc = match_type if match_type else "None"
    print(f"   Duplicate check: {is_dup} ({'❌ BLOCKED - ' + match_desc if is_dup else '✅ ALLOWED - ' + match_desc})")
    
    # Step 5: Show final stats
    print("\n📊 Final Statistics:")
    
    dedupe_stats = dedupe_store.get_stats()
    print(f"   Dedupe Store:")
    print(f"     - Total items: {dedupe_stats['total_items']}")
    print(f"     - Limited edition items: {dedupe_stats['limited_edition_items']}")
    print(f"     - Product states tracked: {dedupe_stats['product_states']}")
    print(f"     - State breakdown: {dedupe_stats['state_breakdown']}")
    
    queue_stats = queue_manager.get_queue_stats()
    print(f"   Queue Manager:")
    print(f"     - Total items: {queue_stats['total_items']}")
    print(f"     - Limited edition items: {queue_stats['limited_edition_items']}")
    print(f"     - State breakdown: {queue_stats['state_counts']}")
    
    print(f"\n✅ Demo completed successfully!")
    print(f"   Result: Limited edition items can have exactly 2 posts:")
    print(f"           1️⃣ Upcoming announcement")
    print(f"           2️⃣ Live availability alert")


async def demo_regular_item_behavior():
    """Demonstrate regular (non-limited) item behavior"""
    
    print(f"\n🔄 Testing Regular Item Behavior")
    print("=" * 40)
    
    dedupe_store = DedupeStore()
    
    # Regular item (not limited edition)
    regular_item = {
        'id': 'nike_air_max_001',
        'title': 'Nike Air Max 90 White',
        'url': 'https://www.nike.com/t/air-max-90-white-325213-131',
        'brand': 'nike',
        'category': 'sneakers',
        'store': 'Nike Store',
        'price': 120.00,
        'limited_edition': False,  # Not limited edition
        'source': 'retailer_scrape',
        'release_date': datetime.now().isoformat(),
        'release_state': 'live'
    }
    
    # First addition should work
    print("   Adding regular item (first time)...")
    is_dup, dup_id, match_type = await dedupe_store.is_duplicate(regular_item)
    print(f"   Duplicate check: {is_dup} ({'❌' if is_dup else '✅'})")
    
    success = await dedupe_store.add(regular_item)
    print(f"   Added: {'✅' if success else '❌'}")
    
    # Second addition should be blocked
    print("   Adding same regular item (second time)...")
    regular_item2 = regular_item.copy()
    regular_item2['title'] = 'Nike Air Max 90 White - In Stock'
    
    is_dup, dup_id, match_type = await dedupe_store.is_duplicate(regular_item2)
    print(f"   Duplicate check: {is_dup} ({'❌ BLOCKED' if is_dup else '✅'})")
    
    print(f"   ✅ Regular items follow standard deduplication (no state transitions)")


if __name__ == "__main__":
    print("AutoAffiliateHub-X2 Release State Management")
    print("Intelligent Deduplication for Limited Edition Items")
    
    # Run the demos
    asyncio.run(demo_release_state_logic())
    asyncio.run(demo_regular_item_behavior())