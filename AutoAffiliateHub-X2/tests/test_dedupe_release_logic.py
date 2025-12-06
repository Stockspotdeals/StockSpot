"""
Test suite for release state deduplication logic in AutoAffiliateHub-X2
Tests the upcoming → live transition workflow for limited edition items.

Usage:
    python -m pytest tests/test_dedupe_release_logic.py -v
"""

import unittest
import asyncio
import sys
import os
from datetime import datetime, timedelta
from unittest.mock import Mock, AsyncMock

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.dedupe_store import DedupeStore
from app.queue_manager import QueueManager, QueueItemStatus
from app.enricher import ProductEnricher
from app.scorer import ProductScorer


class TestReleaseStateDeduplication(unittest.TestCase):
    """Test release state deduplication and transition logic"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.dedupe_store = DedupeStore()
        self.queue_manager = QueueManager()
        self.enricher = ProductEnricher()
        self.scorer = ProductScorer()
        
        # Sample limited edition product data
        self.base_limited_item = {
            'id': 'test_limited_001',
            'title': 'Travis Scott x Nike Air Jordan 1 Retro High OG',
            'url': 'https://www.nike.com/t/air-jordan-1-travis-scott-555088-100',
            'brand': 'travis scott',
            'category': 'sneakers',
            'store': 'Nike SNKRS',
            'price': 175.00,
            'limited_edition': True,
            'source': 'twitter_post',
            'release_date': datetime.now().isoformat(),
            'meta': {
                'engagement_score': 1500,
                'full_text': 'Travis Scott Jordan 1 dropping Thursday!'
            }
        }
        
        # Sample regular product (not limited edition)
        self.base_regular_item = {
            'id': 'test_regular_001',
            'title': 'Nike Air Max 90 White',
            'url': 'https://www.nike.com/t/air-max-90-white-325213-131',
            'brand': 'nike',
            'category': 'sneakers',
            'store': 'Nike Store',
            'price': 120.00,
            'limited_edition': False,
            'source': 'retailer_scrape',
            'release_date': datetime.now().isoformat(),
            'stock_status': 'in_stock'
        }
        
    def create_item_with_state(self, base_item: dict, release_state: str, **overrides) -> dict:
        """Create test item with specific release state"""
        item = base_item.copy()
        item['release_state'] = release_state
        item.update(overrides)
        return item
        
    async def async_test_upcoming_to_live_transition(self):
        """Test that limited edition items can transition from upcoming to live"""
        
        # 1. Add upcoming limited edition item
        upcoming_item = self.create_item_with_state(
            self.base_limited_item, 
            'upcoming',
            title='Travis Scott x Nike Air Jordan 1 - Coming Soon'
        )
        
        # Should be allowed (first time)
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(upcoming_item)
        self.assertFalse(is_duplicate, "First upcoming item should not be duplicate")
        
        # Add to store
        success = await self.dedupe_store.add(upcoming_item)
        self.assertTrue(success, "Should successfully add upcoming item")
        
        # 2. Try to add same upcoming item again
        upcoming_item2 = self.create_item_with_state(
            self.base_limited_item,
            'upcoming', 
            title='Travis Scott x Nike Air Jordan 1 - Drops Thursday'
        )
        
        # Should be blocked (duplicate upcoming)
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(upcoming_item2)
        self.assertTrue(is_duplicate, "Duplicate upcoming item should be blocked")
        self.assertIn('upcoming', match_type, "Should indicate upcoming state duplicate")
        
        # 3. Add same item but with live state
        live_item = self.create_item_with_state(
            self.base_limited_item,
            'live',
            title='Travis Scott x Nike Air Jordan 1 - Available Now!',
            stock_status='in_stock'
        )
        
        # Should be allowed (state transition)
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(live_item)
        self.assertFalse(is_duplicate, "Live version should be allowed after upcoming")
        self.assertEqual(match_type, "state_transition_allowed", "Should indicate allowed transition")
        
        # Add live version
        success = await self.dedupe_store.add(live_item)
        self.assertTrue(success, "Should successfully add live item")
        
        # 4. Try to add same live item again
        live_item2 = self.create_item_with_state(
            self.base_limited_item,
            'live',
            title='Travis Scott x Nike Air Jordan 1 - Still Available'
        )
        
        # Should be blocked (duplicate live)
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(live_item2)
        self.assertTrue(is_duplicate, "Duplicate live item should be blocked")
        
    async def async_test_regular_item_behavior(self):
        """Test that regular (non-limited) items follow normal deduplication"""
        
        # 1. Add regular item (live)
        live_regular = self.create_item_with_state(self.base_regular_item, 'live')
        
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(live_regular)
        self.assertFalse(is_duplicate, "First regular item should not be duplicate")
        
        success = await self.dedupe_store.add(live_regular)
        self.assertTrue(success, "Should successfully add regular item")
        
        # 2. Try to add same regular item again
        live_regular2 = self.create_item_with_state(
            self.base_regular_item, 
            'live',
            title='Nike Air Max 90 White - In Stock'
        )
        
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(live_regular2)
        self.assertTrue(is_duplicate, "Duplicate regular item should be blocked")
        
    async def async_test_backwards_transition_blocked(self):
        """Test that live → upcoming transitions are blocked"""
        
        # 1. Add live limited edition item first
        live_item = self.create_item_with_state(
            self.base_limited_item,
            'live',
            title='Travis Scott x Nike Air Jordan 1 - Available Now'
        )
        
        success = await self.dedupe_store.add(live_item)
        self.assertTrue(success, "Should add live item")
        
        # 2. Try to add upcoming version (backwards transition)
        upcoming_item = self.create_item_with_state(
            self.base_limited_item,
            'upcoming',
            title='Travis Scott x Nike Air Jordan 1 - Coming Soon'
        )
        
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(upcoming_item)
        self.assertTrue(is_duplicate, "Backwards transition should be blocked")
        self.assertEqual(match_type, "backwards_state_transition", "Should indicate backwards transition")
        
    async def async_test_queue_integration(self):
        """Test queue manager integration with release states"""
        
        # 1. Add upcoming item to queue
        upcoming_item = self.create_item_with_state(self.base_limited_item, 'upcoming')
        score = 85.0
        
        success = await self.queue_manager.add_item(upcoming_item, score, self.dedupe_store)
        self.assertTrue(success, "Should add upcoming item to queue")
        
        # Check queue stats
        stats = self.queue_manager.get_queue_stats()
        self.assertEqual(stats['total_items'], 1, "Should have 1 item in queue")
        self.assertEqual(stats['state_counts']['upcoming'], 1, "Should have 1 upcoming item")
        
        # 2. Try to add same upcoming item again
        upcoming_item2 = self.create_item_with_state(
            self.base_limited_item,
            'upcoming',
            title='Travis Scott Jordan - Drops Soon'
        )
        
        success = await self.queue_manager.add_item(upcoming_item2, score, self.dedupe_store)
        self.assertFalse(success, "Should not add duplicate upcoming item")
        
        # 3. Add live version
        live_item = self.create_item_with_state(
            self.base_limited_item,
            'live',
            title='Travis Scott Jordan - Live Now!',
            stock_status='in_stock'
        )
        
        success = await self.queue_manager.add_item(live_item, score + 10, self.dedupe_store)
        self.assertTrue(success, "Should add live version to queue")
        
        # Check updated stats
        stats = self.queue_manager.get_queue_stats()
        self.assertEqual(stats['total_items'], 2, "Should have 2 items in queue")
        self.assertIn('live', stats['state_counts'], "Should have live items")
        
    async def async_test_scorer_state_transition_bonus(self):
        """Test scorer gives bonus for state transitions"""
        
        # 1. Set up dedupe store with upcoming item
        upcoming_item = self.create_item_with_state(self.base_limited_item, 'upcoming')
        await self.dedupe_store.add(upcoming_item)
        
        # 2. Score live version (should get transition bonus)
        live_item = self.create_item_with_state(
            self.base_limited_item,
            'live',
            title='Travis Scott Jordan - Available Now!'
        )
        
        score_with_bonus, breakdown_with_bonus = await self.scorer.score(live_item, self.dedupe_store)
        
        # 3. Score live version without dedupe store context
        score_without_bonus, breakdown_without_bonus = await self.scorer.score(live_item)
        
        # Should have higher score with bonus
        self.assertGreater(score_with_bonus, score_without_bonus, "Should get bonus for state transition")
        
        # Check breakdown has transition bonus
        self.assertIn('bonuses', breakdown_with_bonus, "Should have bonuses section")
        transition_bonus = breakdown_with_bonus['bonuses']['state_transition_bonus']
        self.assertGreater(transition_bonus, 0, "Should have positive transition bonus")
        
    async def async_test_enricher_state_detection(self):
        """Test enricher correctly detects release states"""
        
        # Test upcoming detection
        upcoming_samples = [
            {'title': 'Jordan 1 Travis Scott - Pre-order Now', 'stock_status': 'preorder'},
            {'title': 'Supreme Box Logo - Coming Soon', 'stock_status': 'notify_me'},
            {'title': 'Yeezy 350 - Drops Friday 11AM EST', 'stock_status': 'unknown'},
            {'title': 'PS5 Restock - Sign up for notifications', 'stock_status': 'unknown'}
        ]
        
        for sample in upcoming_samples:
            item = {**self.base_limited_item, **sample}
            state = self.enricher.detect_release_state(item)
            self.assertEqual(state, 'upcoming', f"Should detect upcoming for: {sample['title']}")
            
        # Test live detection
        live_samples = [
            {'title': 'Jordan 1 - Available Now!', 'stock_status': 'in_stock'},
            {'title': 'Supreme Hoodie - Buy Now', 'stock_status': 'low_stock'},
            {'title': 'Yeezy 350 - Restocked!', 'stock_status': 'in_stock'},
            {'title': 'PS5 - Few Left in Stock', 'stock_status': 'limited_stock'}
        ]
        
        for sample in live_samples:
            item = {**self.base_limited_item, **sample}
            state = self.enricher.detect_release_state(item)
            self.assertEqual(state, 'live', f"Should detect live for: {sample['title']}")
            
    async def async_test_cleanup_preserves_limited_editions(self):
        """Test that cleanup preserves limited edition items longer"""
        
        # Add regular item
        regular_item = self.create_item_with_state(self.base_regular_item, 'live')
        regular_item['dedupe_added_at'] = (datetime.now() - timedelta(days=8)).isoformat()
        await self.dedupe_store.add(regular_item)
        
        # Add limited edition item
        limited_item = self.create_item_with_state(self.base_limited_item, 'upcoming')
        limited_item['dedupe_added_at'] = (datetime.now() - timedelta(days=8)).isoformat()
        await self.dedupe_store.add(limited_item)
        
        # Run cleanup
        await self.dedupe_store.cleanup_old_entries()
        
        # Regular item should be cleaned up (past standard retention)
        # Limited item should be preserved (within limited retention)
        stats = self.dedupe_store.get_stats()
        
        # Check that we still have the limited edition item
        self.assertGreater(stats['limited_edition_items'], 0, "Should preserve limited edition items longer")
        
    def test_upcoming_to_live_transition(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_upcoming_to_live_transition())
        
    def test_regular_item_behavior(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_regular_item_behavior())
        
    def test_backwards_transition_blocked(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_backwards_transition_blocked())
        
    def test_queue_integration(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_queue_integration())
        
    def test_scorer_state_transition_bonus(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_scorer_state_transition_bonus())
        
    def test_enricher_state_detection(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_enricher_state_detection())
        
    def test_cleanup_preserves_limited_editions(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_cleanup_preserves_limited_editions())


class TestReleaseStateEdgeCases(unittest.TestCase):
    """Test edge cases and error conditions"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.dedupe_store = DedupeStore()
        self.enricher = ProductEnricher()
        
    async def async_test_missing_release_state(self):
        """Test handling of items without release_state"""
        
        item_without_state = {
            'id': 'test_no_state',
            'title': 'Test Product',
            'limited_edition': True
        }
        
        # Should default to 'live'
        is_duplicate, dup_id, match_type = await self.dedupe_store.is_duplicate(item_without_state)
        self.assertFalse(is_duplicate, "Should handle missing release_state")
        
    async def async_test_invalid_transition_data(self):
        """Test handling of invalid or corrupted data"""
        
        # Item with invalid release_state
        invalid_item = {
            'id': 'test_invalid',
            'title': 'Invalid Item',
            'release_state': 'invalid_state',
            'limited_edition': True
        }
        
        # Should not crash
        success = await self.dedupe_store.add(invalid_item)
        self.assertTrue(success, "Should handle invalid release_state gracefully")
        
    def test_missing_release_state(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_missing_release_state())
        
    def test_invalid_transition_data(self):
        """Wrapper for async test"""
        asyncio.run(self.async_test_invalid_transition_data())


if __name__ == '__main__':
    # Run the tests
    unittest.main(verbosity=2)