import requests
from bs4 import BeautifulSoup
import random

class DealEngine:
    def __init__(self):
        pass

    def scrape_amazon(self):
        trending_items = [
            {"title": "Wireless Headphones", "url": "https://amazon.com/dp/example", "price": 59.99},
            {"title": "Smart LED Bulb", "url": "https://amazon.com/dp/example2", "price": 12.99}
        ]
        for item in trending_items:
            item["hype_score"] = random.randint(50, 100)
        return trending_items

    def get_trending_deals(self):
        amazon_deals = self.scrape_amazon()
        deals = amazon_deals
        deals.sort(key=lambda x: x['hype_score'], reverse=True)
        return deals
        
    def get_mock_trending_deals(self):
        """Generate mock trending deals for testing/demo purposes"""
        mock_deals = [
            {
                'id': 'mock_deal_001',
                'title': 'Apple AirPods Pro (2nd Generation)',
                'description': 'Premium noise-canceling earbuds with spatial audio',
                'url': 'https://www.amazon.com/dp/B0BDHWDR12',
                'price': 179.99,
                'original_price': 249.99,
                'discount': 28,
                'deal_score': 95,
                'category': 'Electronics',
                'brand': 'Apple',
                'rating': 4.8,
                'reviews_count': 45670,
                'source': 'amazon',
                'image_url': 'https://m.media-amazon.com/images/I/61SUj2aKoEL._AC_SX679_.jpg'
            },
            {
                'id': 'mock_deal_002',
                'title': 'Samsung Galaxy Watch 6',
                'description': 'Advanced fitness tracking with health monitoring',
                'url': 'https://www.amazon.com/dp/B0C3G6KZ7D',
                'price': 199.99,
                'original_price': 299.99,
                'discount': 33,
                'deal_score': 88,
                'category': 'Wearables',
                'brand': 'Samsung',
                'rating': 4.6,
                'reviews_count': 12890,
                'source': 'amazon',
                'image_url': 'https://m.media-amazon.com/images/I/71cSV-RTBVL._AC_SX679_.jpg'
            },
            {
                'id': 'mock_deal_003',
                'title': 'Sony WH-1000XM4 Headphones',
                'description': 'Industry-leading noise canceling headphones',
                'url': 'https://www.amazon.com/dp/B0863TXGM3',
                'price': 199.99,
                'original_price': 349.99,
                'discount': 43,
                'deal_score': 92,
                'category': 'Audio',
                'brand': 'Sony',
                'rating': 4.7,
                'reviews_count': 67540,
                'source': 'amazon',
                'image_url': 'https://m.media-amazon.com/images/I/71o8Q5XJS5L._AC_SX679_.jpg'
            },
            {
                'id': 'mock_deal_004',
                'title': 'Ring Video Doorbell Pro 2',
                'description': 'Advanced security with 3D motion detection',
                'url': 'https://www.amazon.com/dp/B086Q54K53',
                'price': 149.99,
                'original_price': 249.99,
                'discount': 40,
                'deal_score': 85,
                'category': 'Home Security',
                'brand': 'Ring',
                'rating': 4.5,
                'reviews_count': 23450,
                'source': 'amazon',
                'image_url': 'https://m.media-amazon.com/images/I/51fITeUXROL._AC_SX679_.jpg'
            },
            {
                'id': 'mock_deal_005',
                'title': 'Nintendo Switch OLED Console',
                'description': 'Enhanced gaming with vibrant OLED screen',
                'url': 'https://www.amazon.com/dp/B098RKWHHZ',
                'price': 279.99,
                'original_price': 349.99,
                'discount': 20,
                'deal_score': 90,
                'category': 'Gaming',
                'brand': 'Nintendo',
                'rating': 4.9,
                'reviews_count': 8760,
                'source': 'amazon',
                'image_url': 'https://m.media-amazon.com/images/I/61-PblYntsL._AC_SX679_.jpg'
            }
        ]
        
        # Add some randomization to simulate real-time changes
        import random
        for deal in mock_deals:
            # Slight price variations
            deal['price'] += random.uniform(-5, 5)
            deal['price'] = round(deal['price'], 2)
            
            # Recalculate discount
            deal['discount'] = round(((deal['original_price'] - deal['price']) / deal['original_price']) * 100)
            
            # Add some score variation
            deal['deal_score'] += random.randint(-5, 5)
            deal['deal_score'] = max(70, min(100, deal['deal_score']))  # Keep in range 70-100
            
        # Sort by deal score
        mock_deals.sort(key=lambda x: x['deal_score'], reverse=True)
        return mock_deals
        
    def discover_deals(self, limit=10):
        """Main deal discovery method for production use"""
        try:
            # In production, this would call real APIs
            deals = self.get_trending_deals()
            return deals[:limit]
        except Exception as e:
            # Fallback to mock data if real discovery fails
            print(f"Warning: Deal discovery failed, using mock data: {e}")
            return self.get_mock_trending_deals()[:limit]