import logging
import random
import re

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CaptionEngine:
    def __init__(self):
        """Initialize the caption engine with predefined templates and hashtags."""
        logger.info("CaptionEngine initialized")
        
        # Caption templates for different hype score ranges
        self.high_hype_templates = [
            "🔥 TRENDING NOW: {title} at ${price}! Hype Score: {hype_score}/100 💯",
            "⚡ VIRAL ALERT: Everyone's talking about this {title}! Only ${price} 🚨",
            "🏆 TOP PICK: {title} is breaking the internet! Get it for ${price} ⭐",
            "💥 MUST-HAVE: {title} at an amazing ${price}! Don't miss out! 🎯",
            "🌟 TRENDING: {title} - ${price} | Hype Level: {hype_score}% 📈"
        ]
        
        self.medium_hype_templates = [
            "✨ Great Find: {title} for just ${price}! Worth checking out 👀",
            "💡 Smart Buy: {title} at ${price} - Good value deal! 💰",
            "🎁 Deal Alert: {title} available for ${price}! Limited time ⏰",
            "🛍️ Shopping Tip: {title} priced at ${price} - Solid choice! ✅",
            "📦 Product Spotlight: {title} - ${price} | Score: {hype_score}/100 📊"
        ]
        
        self.low_hype_templates = [
            "📋 Product Update: {title} available for ${price} 🏷️",
            "🔍 Found This: {title} at ${price} - Check it out! 👈",
            "💼 Budget Option: {title} for ${price} - Affordable choice 💵",
            "📝 Deal Note: {title} priced at ${price} | Score: {hype_score} 📌",
            "🛒 Shopping List: {title} - ${price} available now 📍"
        ]
        
        # Hashtag categories based on product keywords
        self.hashtag_categories = {
            'electronics': ['#Electronics', '#Tech', '#Gadgets', '#TechDeals', '#Innovation', '#DigitalLife'],
            'headphones': ['#Headphones', '#Audio', '#Music', '#Wireless', '#Sound', '#TechGear'],
            'smart': ['#SmartHome', '#IoT', '#ConnectedHome', '#TechLife', '#Automation', '#Modern'],
            'led': ['#LED', '#Lighting', '#HomeDecor', '#EnergyEfficient', '#SmartLighting', '#HomeImprovement'],
            'phone': ['#Smartphone', '#Mobile', '#Tech', '#Communication', '#Apps', '#DigitalLife'],
            'computer': ['#Computer', '#PC', '#Tech', '#Productivity', '#Gaming', '#WorkFromHome'],
            'gaming': ['#Gaming', '#Gamer', '#VideoGames', '#Console', '#GamingGear', '#Entertainment'],
            'kitchen': ['#Kitchen', '#Cooking', '#HomeAppliances', '#Chef', '#Foodie', '#HomeLife'],
            'fitness': ['#Fitness', '#Health', '#Workout', '#Exercise', '#Wellness', '#HealthyLife'],
            'home': ['#Home', '#HomeDecor', '#Lifestyle', '#Comfort', '#Living', '#HomeImprovement'],
            'fashion': ['#Fashion', '#Style', '#Trendy', '#Outfit', '#Shopping', '#Lifestyle'],
            'book': ['#Books', '#Reading', '#Literature', '#Learning', '#Education', '#BookLovers'],
            'beauty': ['#Beauty', '#Skincare', '#Cosmetics', '#SelfCare', '#BeautyTips', '#Glam'],
            'toy': ['#Toys', '#Kids', '#Children', '#Play', '#Fun', '#Family'],
            'tool': ['#Tools', '#DIY', '#HomeImprovement', '#Workshop', '#Building', '#Repair']
        }
        
        # Common deal hashtags
        self.deal_hashtags = ['#Deal', '#Sale', '#Discount', '#Shopping', '#BargainHunt', '#SaveMoney', '#Deal', '#Offer']
        
        # Urgency words for captions
        self.urgency_words = ['Limited Time', 'Don\'t Miss', 'Hurry', 'Last Chance', 'Today Only', 'While Supplies Last']
    
    def detect_category(self, title):
        """Detect product category from title keywords."""
        title_lower = title.lower()
        
        # Check for specific category keywords
        for category, hashtags in self.hashtag_categories.items():
            if category in title_lower:
                return category
        
        # Check for broader keywords
        if any(word in title_lower for word in ['phone', 'iphone', 'android', 'mobile']):
            return 'phone'
        elif any(word in title_lower for word in ['laptop', 'computer', 'pc', 'desktop']):
            return 'computer'
        elif any(word in title_lower for word in ['game', 'gaming', 'console', 'playstation', 'xbox']):
            return 'gaming'
        elif any(word in title_lower for word in ['kitchen', 'cooking', 'chef', 'recipe']):
            return 'kitchen'
        elif any(word in title_lower for word in ['fitness', 'exercise', 'gym', 'workout']):
            return 'fitness'
        elif any(word in title_lower for word in ['book', 'novel', 'reading', 'author']):
            return 'book'
        elif any(word in title_lower for word in ['beauty', 'makeup', 'skincare', 'cosmetic']):
            return 'beauty'
        elif any(word in title_lower for word in ['toy', 'kids', 'children', 'play']):
            return 'toy'
        elif any(word in title_lower for word in ['tool', 'drill', 'hammer', 'screwdriver']):
            return 'tool'
        elif any(word in title_lower for word in ['fashion', 'clothing', 'shirt', 'dress', 'shoes']):
            return 'fashion'
        else:
            return 'electronics'  # Default category
    
    def generate_hashtags(self, product):
        """Generate relevant hashtags based on product category and content."""
        title = product.get('title', '')
        price = product.get('price', 0)
        hype_score = product.get('hype_score', 50)
        
        logger.info(f"Generating hashtags for product: {title[:30]}...")
        
        # Detect category and get specific hashtags
        category = self.detect_category(title)
        category_hashtags = self.hashtag_categories.get(category, self.hashtag_categories['electronics'])
        
        # Select 3-4 category hashtags
        selected_category_hashtags = random.sample(category_hashtags, min(4, len(category_hashtags)))
        
        # Add deal hashtags
        selected_deal_hashtags = random.sample(self.deal_hashtags, 2)
        
        # Add performance-based hashtags
        performance_hashtags = []
        if hype_score >= 80:
            performance_hashtags.extend(['#Trending', '#Viral', '#MustHave'])
        elif hype_score >= 60:
            performance_hashtags.extend(['#Popular', '#Recommended'])
        else:
            performance_hashtags.extend(['#GoodDeal', '#Value'])
        
        # Add price-based hashtags
        if price < 25:
            performance_hashtags.append('#Affordable')
        elif price < 100:
            performance_hashtags.append('#GreatValue')
        else:
            performance_hashtags.append('#Premium')
        
        # Combine all hashtags
        all_hashtags = selected_category_hashtags + selected_deal_hashtags + performance_hashtags
        
        # Remove duplicates and limit to 8 hashtags
        unique_hashtags = list(dict.fromkeys(all_hashtags))[:8]
        
        logger.info(f"Generated {len(unique_hashtags)} hashtags for {title[:30]}...")
        return unique_hashtags
    
    def generate_caption(self, product):
        """Generate a social media caption based on product details and hype score."""
        title = product.get('title', 'Unknown Product')
        price = product.get('price', 0)
        hype_score = product.get('hype_score', 50)
        
        logger.info(f"Generating caption for product: {title[:30]}...")
        
        # Format price
        formatted_price = f"{price:.2f}"
        
        # Select template based on hype score
        if hype_score >= 80:
            template = random.choice(self.high_hype_templates)
        elif hype_score >= 60:
            template = random.choice(self.medium_hype_templates)
        else:
            template = random.choice(self.low_hype_templates)
        
        # Generate base caption
        caption = template.format(
            title=title,
            price=formatted_price,
            hype_score=hype_score
        )
        
        # Add urgency for high hype scores
        if hype_score >= 80 and random.random() < 0.6:
            urgency = random.choice(self.urgency_words)
            caption += f" {urgency}!"
        
        # Add call to action
        call_to_actions = [
            "Click link in bio! 👆",
            "Link in comments 👇",
            "Get yours now! 🛒",
            "Shop the link! 🔗",
            "Don't wait! ⚡"
        ]
        
        if random.random() < 0.7:  # 70% chance to add CTA
            cta = random.choice(call_to_actions)
            caption += f" {cta}"
        
        logger.info(f"Generated caption for {title[:30]}... (Length: {len(caption)} chars)")
        return caption
    
    def generate_excerpt(self, product):
        """Generate a plain text excerpt suitable for website display."""
        title = product.get('title', 'Unknown Product')
        price = product.get('price', 0)
        hype_score = product.get('hype_score', 50)
        
        logger.info(f"Generating excerpt for product: {title[:30]}...")
        
        # Format price
        formatted_price = f"${price:.2f}"
        
        # Create base excerpt
        excerpt_templates = [
            f"{title} is available for {formatted_price}.",
            f"Get {title} at the great price of {formatted_price}.",
            f"{title} - Now priced at {formatted_price}.",
            f"Shop {title} for just {formatted_price}.",
            f"Discover {title} at {formatted_price}."
        ]
        
        base_excerpt = random.choice(excerpt_templates)
        
        # Add hype score context
        if hype_score >= 80:
            hype_text = " This trending item has a high popularity score and is currently in high demand."
        elif hype_score >= 60:
            hype_text = " This popular item is getting positive attention from shoppers."
        else:
            hype_text = " A solid choice with good value for the price."
        
        excerpt = base_excerpt + hype_text
        
        # Add value proposition
        value_props = [
            " Perfect for anyone looking for quality and value.",
            " A smart purchase for budget-conscious shoppers.",
            " Great addition to your shopping list.",
            " Recommended by deal hunters.",
            " Worth considering for your next purchase."
        ]
        
        if random.random() < 0.5:  # 50% chance to add value prop
            excerpt += random.choice(value_props)
        
        logger.info(f"Generated excerpt for {title[:30]}... (Length: {len(excerpt)} chars)")
        return excerpt
    
    def generate_all_content(self, product):
        """Generate caption, hashtags, and excerpt for a product."""
        if not isinstance(product, dict):
            logger.error("Invalid product format - expected dictionary")
            return product
        
        title = product.get('title', 'Unknown Product')
        logger.info(f"Generating all content for product: {title}")
        
        # Generate all content types
        caption = self.generate_caption(product)
        hashtags = self.generate_hashtags(product)
        excerpt = self.generate_excerpt(product)
        
        # Add to product dictionary
        product['caption'] = caption
        product['hashtags'] = hashtags
        product['excerpt'] = excerpt
        
        logger.info(f"Generated complete content package for: {title}")
        return product
    
    def generate_multiple_content(self, products):
        """Generate content for multiple products."""
        if not isinstance(products, list):
            logger.error("Invalid input - expected list of products")
            return products
        
        logger.info(f"Generating content for {len(products)} products")
        
        processed_products = []
        for i, product in enumerate(products):
            logger.info(f"Processing product {i+1}/{len(products)}")
            processed_product = self.generate_all_content(product)
            processed_products.append(processed_product)
        
        logger.info(f"Successfully generated content for {len(processed_products)} products")
        return processed_products


# Example usage and testing
if __name__ == "__main__":
    # Initialize the caption engine
    engine = CaptionEngine()
    
    # Sample products for testing
    sample_products = [
        {
            "title": "Wireless Bluetooth Headphones",
            "price": 59.99,
            "hype_score": 85,
            "affiliate_url": "https://short.ly/abc123"
        },
        {
            "title": "Smart LED Light Bulb",
            "price": 12.99,
            "hype_score": 72,
            "affiliate_url": "https://short.ly/def456"
        },
        {
            "title": "Gaming Mechanical Keyboard",
            "price": 89.99,
            "hype_score": 45,
            "affiliate_url": "https://short.ly/ghi789"
        }
    ]
    
    print("=== CaptionEngine Demo ===\n")
    
    # Test individual functions
    for i, product in enumerate(sample_products, 1):
        print(f"--- Product {i}: {product['title']} ---")
        
        # Generate caption
        caption = engine.generate_caption(product)
        print(f"Caption: {caption}")
        
        # Generate hashtags
        hashtags = engine.generate_hashtags(product)
        print(f"Hashtags: {' '.join(hashtags)}")
        
        # Generate excerpt
        excerpt = engine.generate_excerpt(product)
        print(f"Excerpt: {excerpt}")
        
        print("\n")
    
    # Test bulk processing
    print("=== Bulk Processing Test ===")
    processed_products = engine.generate_multiple_content(sample_products.copy())
    
    for product in processed_products:
        print(f"Product: {product['title']}")
        print(f"Full package generated: Caption={len(product['caption'])} chars, "
              f"Hashtags={len(product['hashtags'])}, Excerpt={len(product['excerpt'])} chars")
        print()
    
    print("Demo completed successfully!")