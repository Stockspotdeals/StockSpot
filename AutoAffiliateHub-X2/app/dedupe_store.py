"""
Deduplication Store for AutoAffiliateHub-X2
Manages product deduplication and prevents duplicate posting.

Usage:
    dedupe_store = DedupeStore()
    is_duplicate = await dedupe_store.is_duplicate(item)
    await dedupe_store.add(item)
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Set, Tuple
import hashlib
import sys
import os
from difflib import SequenceMatcher
import re

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

logger = logging.getLogger(__name__)

class DedupeStore:
    """Advanced deduplication system with multiple matching strategies"""
    
    def __init__(self):
        """Initialize deduplication store"""
        
        # In-memory storage (would be database in production)
        self.seen_items = {}  # item_id -> item_data
        self.url_hashes = set()  # URL-based deduplication
        self.title_signatures = {}  # Fuzzy title matching
        self.product_fingerprints = {}  # Content-based fingerprinting
        
        # Release state tracking for dual-phase posting
        self.product_states = {}  # product_fingerprint -> {state: release_state, posted_at: datetime}
        
        # Deduplication settings
        self.title_similarity_threshold = 0.85  # 85% similarity for title matching
        self.url_similarity_threshold = 0.90   # 90% similarity for URL matching
        self.retention_days = 7  # Keep deduplication data for 7 days
        self.limited_edition_retention_days = 14  # Longer retention for limited editions
        
        # Brand-specific deduplication rules
        self.brand_rules = {
            'nike': {
                'sku_pattern': r'[0-9]{6}-[0-9]{3}',  # Nike SKU format
                'title_keywords': ['air', 'jordan', 'dunk', 'blazer']
            },
            'adidas': {
                'sku_pattern': r'[A-Z]{2}[0-9]{4}',   # Adidas model code
                'title_keywords': ['ultraboost', 'nmd', 'yeezy']
            },
            'supreme': {
                'season_pattern': r'(fw|ss)[0-9]{2}',  # Season codes
                'title_keywords': ['box logo', 'hoodie', 'tee']
            }
        }
        
    def generate_url_signature(self, url: str) -> str:
        """Generate normalized URL signature for comparison
        
        Args:
            url: Product URL
            
        Returns:
            Normalized URL signature
        """
        try:
            # Remove common URL parameters that don't affect product identity
            remove_params = [
                'utm_source', 'utm_medium', 'utm_campaign', 'utm_content',
                'ref', 'referrer', 'source', 'fbclid', 'gclid',
                'timestamp', 'sid', 'session_id'
            ]
            
            # Basic URL cleanup
            clean_url = url.lower().strip()
            
            # Remove protocol differences
            clean_url = clean_url.replace('https://', '').replace('http://', '')
            
            # Remove www prefix variations
            clean_url = clean_url.replace('www.', '')
            
            # Remove tracking parameters (simple approach)
            if '?' in clean_url:
                base_url, params = clean_url.split('?', 1)
                # Keep only essential parameters
                param_pairs = params.split('&')
                essential_params = []
                
                for param in param_pairs:
                    if '=' in param:
                        key = param.split('=')[0]
                        if key not in remove_params:
                            essential_params.append(param)
                            
                if essential_params:
                    clean_url = base_url + '?' + '&'.join(essential_params)
                else:
                    clean_url = base_url
                    
            return hashlib.md5(clean_url.encode()).hexdigest()
            
        except Exception as e:
            logger.warning(f"Error generating URL signature: {e}")
            return hashlib.md5(url.encode()).hexdigest()
            
    def generate_title_signature(self, title: str, brand: str = None) -> str:
        """Generate normalized title signature for fuzzy matching
        
        Args:
            title: Product title
            brand: Product brand (optional)
            
        Returns:
            Normalized title signature
        """
        try:
            # Normalize title
            clean_title = title.lower().strip()
            
            # Remove common noise words
            noise_words = [
                'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to',
                'for', 'of', 'with', 'by', 'new', 'sale', 'deal', 'offer',
                'limited', 'exclusive', 'special', 'edition', 'restock'
            ]
            
            words = clean_title.split()
            filtered_words = [word for word in words if word not in noise_words]
            
            # Remove punctuation and extra spaces
            clean_title = ' '.join(filtered_words)
            clean_title = re.sub(r'[^\w\s]', ' ', clean_title)
            clean_title = re.sub(r'\s+', ' ', clean_title).strip()
            
            # Brand-specific normalization
            if brand and brand in self.brand_rules:
                rules = self.brand_rules[brand]
                
                # Extract SKUs/model codes if present
                sku_pattern = rules.get('sku_pattern')
                if sku_pattern:
                    sku_matches = re.findall(sku_pattern, clean_title)
                    if sku_matches:
                        # Include SKU in signature for exact matching
                        clean_title += ' ' + ' '.join(sku_matches)
                        
            return clean_title
            
        except Exception as e:
            logger.warning(f"Error generating title signature: {e}")
            return title.lower()
            
    def generate_product_fingerprint(self, item: Dict) -> str:
        """Generate content-based product fingerprint
        
        Args:
            item: Product item dict
            
        Returns:
            Product fingerprint hash
        """
        try:
            # Extract key identifying features
            features = []
            
            # Title (normalized)
            title = item.get('title', '')
            brand = item.get('brand')
            features.append(self.generate_title_signature(title, brand))
            
            # Brand
            if brand:
                features.append(f"brand:{brand.lower()}")
                
            # Category
            category = item.get('category')
            if category:
                features.append(f"category:{category.lower()}")
                
            # Price (rounded to avoid minor price differences)
            price = item.get('price')
            if price:
                rounded_price = round(float(price), 0)  # Round to nearest dollar
                features.append(f"price:{rounded_price}")
                
            # Store (normalized)
            store = item.get('store', '')
            if store:
                clean_store = store.lower().replace(' ', '').replace('-', '')
                features.append(f"store:{clean_store}")
                
            # Combine features and hash
            fingerprint_string = '|'.join(sorted(features))
            return hashlib.sha256(fingerprint_string.encode()).hexdigest()[:16]
            
        except Exception as e:
            logger.warning(f"Error generating product fingerprint: {e}")
            return hashlib.md5(str(item).encode()).hexdigest()[:16]
            
    def calculate_title_similarity(self, title1: str, title2: str) -> float:
        """Calculate similarity between two product titles
        
        Args:
            title1: First product title
            title2: Second product title
            
        Returns:
            Similarity score (0.0 - 1.0)
        """
        try:
            # Normalize both titles
            norm_title1 = self.generate_title_signature(title1)
            norm_title2 = self.generate_title_signature(title2)
            
            # Use SequenceMatcher for similarity
            similarity = SequenceMatcher(None, norm_title1, norm_title2).ratio()
            
            return similarity
            
        except Exception:
            return 0.0
            
    async def is_duplicate(self, item: Dict) -> Tuple[bool, Optional[str], Optional[str]]:
        """Check if item is a duplicate using release state awareness
        
        Args:
            item: Product item to check (must include 'release_state')
            
        Returns:
            Tuple of (is_duplicate, duplicate_id, match_type)
        """
        try:
            release_state = item.get('release_state', 'live')
            is_limited_edition = item.get('limited_edition', False)
            
            # Strategy 1: Product fingerprint with release state tracking
            fingerprint = self.generate_product_fingerprint(item)
            
            if fingerprint in self.product_states:
                state_info = self.product_states[fingerprint]
                previous_state = state_info['state']
                
                # For limited edition items, allow upcoming → live transition
                if is_limited_edition and previous_state == 'upcoming' and release_state == 'live':
                    logger.info(f"Allowing state transition for limited edition: {fingerprint} from upcoming to live")
                    return False, None, "state_transition_allowed"
                    
                # Same state = duplicate
                if previous_state == release_state:
                    return True, fingerprint, f"duplicate_state_{release_state}"
                    
                # Live → upcoming is not allowed (backwards transition)
                if previous_state == 'live' and release_state == 'upcoming':
                    return True, fingerprint, "backwards_state_transition"
                    
            # Strategy 2: Exact URL match (state-aware)
            url = item.get('url', '')
            if url:
                url_signature = self.generate_url_signature(url)
                # Check if we've seen this URL in the same state
                url_state_key = f"{url_signature}_{release_state}"
                if url_state_key in self.url_hashes:
                    return True, f"url:{url_signature}", f"exact_url_{release_state}"
                
            # Strategy 3: Fuzzy title matching (state-aware)
            title = item.get('title', '')
            brand = item.get('brand')
            if title:
                title_signature = self.generate_title_signature(title, brand)
                title_state_key = f"{title_signature}_{release_state}"
                
                # Check against existing titles in same state
                for existing_key, existing_id in self.title_signatures.items():
                    if existing_key.endswith(f"_{release_state}"):
                        existing_signature = existing_key.rsplit('_', 1)[0]
                        similarity = SequenceMatcher(None, title_signature, existing_signature).ratio()
                        
                        if similarity >= self.title_similarity_threshold:
                            # Additional validation for high-similarity matches
                            existing_item = self.seen_items.get(existing_id)
                            if existing_item:
                                # Check if same brand/store (stricter for similar titles)
                                same_brand = (existing_item.get('brand') == brand)
                                same_store = (existing_item.get('store') == item.get('store'))
                                
                                if same_brand or same_store:
                                    return True, existing_id, f"fuzzy_title_{similarity:.2f}_{release_state}"
                                
            # Strategy 4: Brand-specific SKU matching
            if brand and brand in self.brand_rules:
                sku_pattern = self.brand_rules[brand]['sku_pattern']
                title_skus = re.findall(sku_pattern, title)
                
                if title_skus:
                    for existing_id, existing_item in self.seen_items.items():
                        if existing_item.get('brand') == brand:
                            existing_title = existing_item.get('title', '')
                            existing_skus = re.findall(sku_pattern, existing_title)
                            
                            # Check for SKU overlap
                            if set(title_skus) & set(existing_skus):
                                return True, existing_id, f"brand_sku_{brand}"
                                
            return False, None, None
            
        except Exception as e:
            logger.error(f"Error checking duplicates: {e}")
            return False, None, None
            
    async def add(self, item: Dict) -> bool:
        """Add item to deduplication store with release state tracking
        
        Args:
            item: Product item to add (must include 'release_state')
            
        Returns:
            True if added successfully, False if duplicate
        """
        try:
            # Check for duplicates first
            is_dup, dup_id, match_type = await self.is_duplicate(item)
            
            if is_dup and not match_type == "state_transition_allowed":
                logger.debug(f"Duplicate detected: {item.get('id')} matches {dup_id} via {match_type}")
                return False
                
            # Add to all tracking structures
            item_id = item.get('id')
            release_state = item.get('release_state', 'live')
            
            if not item_id:
                logger.warning("Item missing ID, cannot add to dedupe store")
                return False
                
            # Store the item
            item_with_timestamp = item.copy()
            item_with_timestamp['dedupe_added_at'] = datetime.now().isoformat()
            self.seen_items[item_id] = item_with_timestamp
            
            # Add URL signature (with state)
            url = item.get('url', '')
            if url:
                url_signature = self.generate_url_signature(url)
                url_state_key = f"{url_signature}_{release_state}"
                self.url_hashes.add(url_state_key)
                
            # Add title signature (with state)
            title = item.get('title', '')
            brand = item.get('brand')
            if title:
                title_signature = self.generate_title_signature(title, brand)
                title_state_key = f"{title_signature}_{release_state}"
                self.title_signatures[title_state_key] = item_id
                
            # Add product fingerprint and state tracking
            fingerprint = self.generate_product_fingerprint(item)
            self.product_fingerprints[fingerprint] = item_id
            
            # Track release state for limited edition items
            if item.get('limited_edition', False):
                self.product_states[fingerprint] = {
                    'state': release_state,
                    'posted_at': datetime.now(),
                    'item_id': item_id
                }
            
            logger.debug(f"Added item to dedupe store: {item_id} (state: {release_state})")
            return True
            
        except Exception as e:
            logger.error(f"Error adding item to dedupe store: {e}")
            return False
            
    async def cleanup_old_entries(self):
        """Remove old entries to prevent memory growth"""
        try:
            now = datetime.now()
            standard_cutoff = now - timedelta(days=self.retention_days)
            limited_cutoff = now - timedelta(days=self.limited_edition_retention_days)
            
            # Find old entries
            old_item_ids = []
            for item_id, item in self.seen_items.items():
                added_at = item.get('dedupe_added_at')
                if added_at:
                    try:
                        added_date = datetime.fromisoformat(added_at)
                        is_limited = item.get('limited_edition', False)
                        
                        # Use longer retention for limited edition items
                        cutoff = limited_cutoff if is_limited else standard_cutoff
                        
                        if added_date < cutoff:
                            old_item_ids.append(item_id)
                    except ValueError:
                        # Invalid timestamp, consider it old
                        old_item_ids.append(item_id)
                        
            # Clean up old product states
            old_states = []
            for fingerprint, state_info in self.product_states.items():
                posted_at = state_info.get('posted_at', now)
                if isinstance(posted_at, str):
                    posted_at = datetime.fromisoformat(posted_at)
                    
                # Always use limited edition retention for state tracking
                if posted_at < limited_cutoff:
                    old_states.append(fingerprint)
                    
            # Remove old entries
            for item_id in old_item_ids:
                await self.remove(item_id)
                
            for fingerprint in old_states:
                del self.product_states[fingerprint]
                
            if old_item_ids or old_states:
                logger.info(f"Cleaned up {len(old_item_ids)} old dedupe entries and {len(old_states)} old state entries")
                
        except Exception as e:
            logger.error(f"Error during dedupe cleanup: {e}")
            
    async def remove(self, item_id: str):
        """Remove item from deduplication store
        
        Args:
            item_id: Item ID to remove
        """
        try:
            item = self.seen_items.get(item_id)
            if not item:
                return
                
            # Remove from main storage
            del self.seen_items[item_id]
            
            # Remove URL signature
            url = item.get('url', '')
            if url:
                url_signature = self.generate_url_signature(url)
                self.url_hashes.discard(url_signature)
                
            # Remove title signature
            title = item.get('title', '')
            brand = item.get('brand')
            if title:
                title_signature = self.generate_title_signature(title, brand)
                if self.title_signatures.get(title_signature) == item_id:
                    del self.title_signatures[title_signature]
                    
            # Remove product fingerprint
            fingerprint = self.generate_product_fingerprint(item)
            if self.product_fingerprints.get(fingerprint) == item_id:
                del self.product_fingerprints[fingerprint]
                
            logger.debug(f"Removed item from dedupe store: {item_id}")
            
        except Exception as e:
            logger.error(f"Error removing item from dedupe store: {e}")
            
    def get_stats(self) -> Dict[str, Any]:
        """Get deduplication store statistics
        
        Returns:
            Statistics dict
        """
        # Count states
        state_counts = {}
        limited_edition_count = 0
        
        for fingerprint, state_info in self.product_states.items():
            state = state_info['state']
            state_counts[state] = state_counts.get(state, 0) + 1
            
        for item in self.seen_items.values():
            if item.get('limited_edition', False):
                limited_edition_count += 1
        
        return {
            'total_items': len(self.seen_items),
            'limited_edition_items': limited_edition_count,
            'url_signatures': len(self.url_hashes),
            'title_signatures': len(self.title_signatures),
            'product_fingerprints': len(self.product_fingerprints),
            'product_states': len(self.product_states),
            'state_breakdown': state_counts,
            'retention_days': self.retention_days,
            'limited_edition_retention_days': self.limited_edition_retention_days,
            'title_similarity_threshold': self.title_similarity_threshold
        }


# Example usage and testing
async def main():
    """Example usage of deduplication store"""
    
    # Sample test items with duplicates
    test_items = [
        {
            'id': 'test_001',
            'title': 'Nike Air Jordan 1 Retro High OG Chicago',
            'url': 'https://www.nike.com/t/air-jordan-1-retro-high-og-555088-101',
            'brand': 'nike',
            'store': 'Nike SNKRS',
            'price': 170.00
        },
        {
            'id': 'test_002',
            'title': 'Air Jordan 1 Retro High OG Chicago - Nike',  # Similar title
            'url': 'https://nike.com/t/air-jordan-1-retro-high-og-555088-101?utm_source=google',  # Similar URL
            'brand': 'nike',
            'store': 'Nike Store',
            'price': 170.00
        },
        {
            'id': 'test_003',
            'title': 'PlayStation 5 Console',
            'url': 'https://www.bestbuy.com/site/playstation-5-console/6426149.p',
            'brand': 'playstation',
            'store': 'Best Buy',
            'price': 499.99
        }
    ]
    
    dedupe_store = DedupeStore()
    
    print("Deduplication Store Demo")
    print("=" * 40)
    
    for i, item in enumerate(test_items, 1):
        print(f"\nTesting item {i}: {item['title'][:30]}...")
        
        # Check if duplicate
        is_dup, dup_id, match_type = await dedupe_store.is_duplicate(item)
        
        if is_dup:
            print(f"  ✗ DUPLICATE detected! Matches {dup_id} via {match_type}")
        else:
            print(f"  ✓ UNIQUE - adding to store")
            success = await dedupe_store.add(item)
            if success:
                print(f"    Added successfully")
            else:
                print(f"    Failed to add")
                
    print(f"\nFinal Stats: {dedupe_store.get_stats()}")


if __name__ == "__main__":
    # Run example when file is executed directly
    asyncio.run(main())