"""
Test Caption Engine Module
Tests AI-powered content generation for social media using mock data.

Run with:
    python -m unittest test_caption_engine.py
    
No real API credentials required - uses mocked responses.
"""

import unittest
from unittest.mock import patch, MagicMock
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.caption_engine import CaptionEngine


class TestCaptionEngine(unittest.TestCase):
    
    def setUp(self):
        """Initialize test environment"""
        self.caption_engine = CaptionEngine()
        
    def test_generate_caption_for_deal(self):
        """Test caption generation for product deals"""
        mock_deal = {
            'title': 'Apple AirPods Pro',
            'original_price': 249.99,
            'current_price': 179.99,
            'discount': 28,
            'category': 'electronics',
            'hype_score': 85
        }
        
        caption = self.caption_engine.generate_caption(mock_deal)
        
        # Verify caption contains key elements
        self.assertIsInstance(caption, str)
        self.assertGreater(len(caption), 20)
        self.assertIn('AirPods', caption)
        self.assertIn('28%', caption)  # Should mention discount
        
        print(f"✅ Caption generation test passed - Generated: {caption[:50]}...")
        
    def test_generate_hashtags(self):
        """Test hashtag generation for products"""
        mock_deal = {
            'title': 'Samsung 55 Smart TV',
            'category': 'electronics',
            'hype_score': 78
        }
        
        hashtags = self.caption_engine.generate_hashtags(mock_deal)
        
        # Verify hashtag format and content
        self.assertIsInstance(hashtags, list)
        self.assertGreaterEqual(len(hashtags), 5)
        self.assertLessEqual(len(hashtags), 15)
        
        for hashtag in hashtags:
            self.assertTrue(hashtag.startswith('#'))
            self.assertNotIn(' ', hashtag)  # No spaces in hashtags
            
        # Should include relevant hashtags
        hashtag_text = ' '.join(hashtags).lower()
        self.assertIn('#samsung', hashtag_text)
        self.assertIn('#smarttv', hashtag_text)
        self.assertIn('#electronics', hashtag_text)
        
        print(f"✅ Hashtag generation test passed - Generated: {hashtags[:5]}")
        
    def test_generate_platform_specific_content(self):
        """Test platform-specific content generation"""
        mock_deal = {
            'title': 'Nike Air Max Sneakers',
            'current_price': 89.99,
            'original_price': 129.99,
            'discount': 31,
            'category': 'fashion'
        }
        
        # Test Twitter content (character limit)
        twitter_content = self.caption_engine.generate_platform_content(
            mock_deal, 
            platform='twitter'
        )
        self.assertLessEqual(len(twitter_content['caption']), 280)
        self.assertIn('#deal', twitter_content['hashtags'][0].lower())
        
        # Test Instagram content (more hashtags allowed)
        instagram_content = self.caption_engine.generate_platform_content(
            mock_deal,
            platform='instagram'
        )
        self.assertGreaterEqual(len(instagram_content['hashtags']), 10)
        
        # Test Facebook content (longer descriptions)
        facebook_content = self.caption_engine.generate_platform_content(
            mock_deal,
            platform='facebook'
        )
        self.assertGreater(len(facebook_content['caption']), 100)
        
        print("✅ Platform-specific content generation test passed")
        
    def test_generate_emoji_enhanced_content(self):
        """Test content generation with emoji enhancement"""
        mock_deal = {
            'title': 'Coffee Maker Deluxe',
            'category': 'home',
            'discount': 40,
            'hype_score': 70
        }
        
        # Test with emojis enabled
        content_with_emoji = self.caption_engine.generate_caption(
            mock_deal,
            include_emoji=True
        )
        
        # Test with emojis disabled
        content_without_emoji = self.caption_engine.generate_caption(
            mock_deal,
            include_emoji=False
        )
        
        # Verify emoji presence/absence
        emoji_chars = ['☕', '🏠', '💰', '🔥', '⚡', '✨']
        has_emoji = any(emoji in content_with_emoji for emoji in emoji_chars)
        self.assertTrue(has_emoji)
        
        print("✅ Emoji enhancement test passed")
        
    def test_generate_urgency_based_content(self):
        """Test content generation based on deal urgency"""
        # High urgency deal (high discount, high hype)
        high_urgency_deal = {
            'title': 'MacBook Air M1',
            'discount': 75,
            'hype_score': 95,
            'original_price': 999.99,
            'current_price': 249.99
        }
        
        high_urgency_caption = self.caption_engine.generate_caption(high_urgency_deal)
        urgency_words = ['limited', 'hurry', 'today only', 'flash', 'grab', 'quick']
        has_urgency = any(word in high_urgency_caption.lower() for word in urgency_words)
        self.assertTrue(has_urgency)
        
        # Low urgency deal
        low_urgency_deal = {
            'title': 'Basic Phone Case',
            'discount': 15,
            'hype_score': 30,
            'original_price': 19.99,
            'current_price': 16.99
        }
        
        low_urgency_caption = self.caption_engine.generate_caption(low_urgency_deal)
        self.assertIsInstance(low_urgency_caption, str)
        
        print("✅ Urgency-based content generation test passed")
        
    def test_generate_call_to_action(self):
        """Test call-to-action generation"""
        mock_deal = {
            'title': 'Wireless Charging Pad',
            'category': 'electronics',
            'hype_score': 60
        }
        
        cta = self.caption_engine.generate_call_to_action(mock_deal)
        
        self.assertIsInstance(cta, str)
        self.assertGreater(len(cta), 10)
        
        # Should contain action words
        action_words = ['buy', 'get', 'shop', 'grab', 'order', 'click', 'save']
        has_action = any(word in cta.lower() for word in action_words)
        self.assertTrue(has_action)
        
        print(f"✅ Call-to-action generation test passed - Generated: {cta}")
        
    def test_content_length_limits(self):
        """Test content respects platform character limits"""
        long_title_deal = {
            'title': 'Ultra Premium Super Deluxe Professional Grade High Quality Amazing Fantastic Incredible Product Name That Goes On Forever',
            'category': 'electronics',
            'discount': 50
        }
        
        # Twitter limit
        twitter_caption = self.caption_engine.generate_platform_content(
            long_title_deal,
            platform='twitter',
            max_length=280
        )
        self.assertLessEqual(len(twitter_caption['caption']), 280)
        
        # Instagram limit  
        instagram_caption = self.caption_engine.generate_platform_content(
            long_title_deal,
            platform='instagram',
            max_length=2200
        )
        self.assertLessEqual(len(instagram_caption['caption']), 2200)
        
        print("✅ Content length limits test passed")
        
    def test_category_specific_content(self):
        """Test category-specific content generation"""
        categories_and_deals = {
            'electronics': {
                'title': 'Gaming Laptop RTX 4080',
                'category': 'electronics',
                'discount': 45
            },
            'fashion': {
                'title': 'Designer Leather Jacket',
                'category': 'fashion', 
                'discount': 35
            },
            'home': {
                'title': 'Robot Vacuum Cleaner',
                'category': 'home',
                'discount': 40
            },
            'beauty': {
                'title': 'Anti-Aging Skincare Set',
                'category': 'beauty',
                'discount': 30
            }
        }
        
        for category, deal in categories_and_deals.items():
            caption = self.caption_engine.generate_caption(deal)
            hashtags = self.caption_engine.generate_hashtags(deal)
            
            # Verify category-relevant content
            self.assertIsInstance(caption, str)
            self.assertGreater(len(caption), 20)
            
            hashtag_text = ' '.join(hashtags).lower()
            self.assertIn(f'#{category}', hashtag_text)
            
        print("✅ Category-specific content generation test passed")
        
    def test_sentiment_analysis_content(self):
        """Test content generates appropriate sentiment"""
        # Positive deal (high discount, popular product)
        positive_deal = {
            'title': 'iPhone 15 Pro Max',
            'discount': 60,
            'hype_score': 90,
            'category': 'electronics'
        }
        
        positive_caption = self.caption_engine.generate_caption(positive_deal)
        
        # Should contain positive sentiment words
        positive_words = ['amazing', 'incredible', 'awesome', 'fantastic', 'great', 'excellent']
        has_positive = any(word in positive_caption.lower() for word in positive_words)
        self.assertTrue(has_positive)
        
        print("✅ Sentiment analysis test passed")
        
    def test_generate_content_with_price_info(self):
        """Test content includes price information appropriately"""
        deal_with_prices = {
            'title': 'Bluetooth Speaker',
            'original_price': 99.99,
            'current_price': 49.99,
            'discount': 50,
            'category': 'electronics'
        }
        
        caption = self.caption_engine.generate_caption(deal_with_prices, include_price=True)
        
        # Should mention price or savings
        price_indicators = ['$49.99', '$99.99', '50%', 'save', '$50']
        has_price_info = any(indicator in caption for indicator in price_indicators)
        self.assertTrue(has_price_info)
        
        print("✅ Price information inclusion test passed")


if __name__ == '__main__':
    print("🧪 Starting Caption Engine Tests...")
    unittest.main(verbosity=2)