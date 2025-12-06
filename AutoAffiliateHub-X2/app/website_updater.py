import json
import os
import logging
from datetime import datetime
from typing import Dict, List, Optional
from flask import render_template

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WebsiteUpdater:
    def __init__(self):
        """Initialize the website updater with JSON feed file."""
        self.feed_file = os.path.join(os.path.dirname(__file__), "feed.json")
        
        # Create feed file if it doesn't exist
        if not os.path.exists(self.feed_file):
            self._initialize_feed_file()
        
        logger.info(f"WebsiteUpdater initialized with feed file: {self.feed_file}")
    
    def _initialize_feed_file(self):
        """Create an empty feed file with proper structure."""
        initial_data = {
            "feed_info": {
                "created_at": datetime.now().isoformat(),
                "last_updated": datetime.now().isoformat(),
                "total_products": 0,
                "version": "1.0"
            },
            "products": []
        }
        
        try:
            with open(self.feed_file, "w", encoding='utf-8') as f:
                json.dump(initial_data, f, indent=2, ensure_ascii=False)
            logger.info(f"Initialized new feed file: {self.feed_file}")
        except Exception as e:
            logger.error(f"Failed to initialize feed file: {str(e)}")
            raise
    
    def _load_feed(self) -> Dict:
        """Load feed data from JSON file."""
        try:
            with open(self.feed_file, "r", encoding='utf-8') as f:
                data = json.load(f)
            
            # Ensure proper structure for older feed files
            if isinstance(data, list):
                # Convert old format to new format
                data = {
                    "feed_info": {
                        "created_at": datetime.now().isoformat(),
                        "last_updated": datetime.now().isoformat(),
                        "total_products": len(data),
                        "version": "1.0"
                    },
                    "products": data
                }
                self._save_feed(data)
            
            return data
            
        except FileNotFoundError:
            logger.warning("Feed file not found, creating new one")
            self._initialize_feed_file()
            return self._load_feed()
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON in feed file: {str(e)}")
            # Backup corrupted file and create new one
            backup_file = f"{self.feed_file}.backup_{int(datetime.now().timestamp())}"
            os.rename(self.feed_file, backup_file)
            logger.info(f"Corrupted feed backed up to: {backup_file}")
            self._initialize_feed_file()
            return self._load_feed()
        except Exception as e:
            logger.error(f"Error loading feed: {str(e)}")
            raise
    
    def _save_feed(self, data: Dict):
        """Save feed data to JSON file."""
        try:
            # Update metadata
            data["feed_info"]["last_updated"] = datetime.now().isoformat()
            data["feed_info"]["total_products"] = len(data["products"])
            
            with open(self.feed_file, "w", encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            logger.info(f"Feed saved successfully with {len(data['products'])} products")
            
        except Exception as e:
            logger.error(f"Error saving feed: {str(e)}")
            raise
    
    def _generate_product_id(self, product: Dict) -> str:
        """Generate a unique ID for a product based on title and URL."""
        title = product.get('title', '').strip()
        url = product.get('affiliate_url', '').strip()
        
        # Create a simple hash-like ID
        import hashlib
        content = f"{title}_{url}".encode('utf-8')
        return hashlib.md5(content).hexdigest()[:12]
    
    def _validate_product(self, product: Dict) -> bool:
        """Validate that product has required fields."""
        required_fields = ['title', 'affiliate_url', 'price', 'hype_score', 'excerpt']
        
        for field in required_fields:
            if field not in product:
                logger.error(f"Product missing required field: {field}")
                return False
            
            if not product[field] and field != 'excerpt':  # excerpt can be empty
                logger.error(f"Product has empty required field: {field}")
                return False
        
        # Validate data types
        try:
            float(product['price'])
            int(product['hype_score'])
        except (ValueError, TypeError):
            logger.error("Invalid price or hype_score format")
            return False
        
        return True
    
    def add_post(self, product: Dict) -> bool:
        """
        Add a new product entry to the feed.
        
        Args:
            product: Dictionary with title, affiliate_url, price, hype_score, excerpt
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self._validate_product(product):
            return False
        
        title = product.get('title', 'Unknown Product')
        logger.info(f"Adding new product to feed: {title}")
        
        try:
            # Load current feed
            feed_data = self._load_feed()
            
            # Generate product ID and add metadata
            product_id = self._generate_product_id(product)
            
            # Check if product already exists
            existing_product = next(
                (p for p in feed_data["products"] if p.get("id") == product_id),
                None
            )
            
            if existing_product:
                logger.warning(f"Product already exists in feed: {title}")
                return self.update_post(product)
            
            # Prepare product entry
            product_entry = {
                "id": product_id,
                "title": product["title"],
                "affiliate_url": product["affiliate_url"],
                "price": float(product["price"]),
                "hype_score": int(product["hype_score"]),
                "excerpt": product["excerpt"],
                "added_at": datetime.now().isoformat(),
                "updated_at": datetime.now().isoformat(),
                "status": "active"
            }
            
            # Add to feed
            feed_data["products"].append(product_entry)
            
            # Sort by hype score (highest first)
            feed_data["products"].sort(key=lambda x: x["hype_score"], reverse=True)
            
            # Save feed
            self._save_feed(feed_data)
            
            logger.info(f"Successfully added product to feed: {title} (ID: {product_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error adding product to feed: {str(e)}")
            return False
    
    def update_post(self, product: Dict) -> bool:
        """
        Update an existing product entry in the feed.
        
        Args:
            product: Dictionary with title, affiliate_url, price, hype_score, excerpt
        
        Returns:
            bool: True if successful, False otherwise
        """
        if not self._validate_product(product):
            return False
        
        title = product.get('title', 'Unknown Product')
        logger.info(f"Updating product in feed: {title}")
        
        try:
            # Load current feed
            feed_data = self._load_feed()
            
            # Generate product ID
            product_id = self._generate_product_id(product)
            
            # Find existing product
            product_index = None
            for i, existing_product in enumerate(feed_data["products"]):
                if existing_product.get("id") == product_id:
                    product_index = i
                    break
            
            if product_index is None:
                logger.warning(f"Product not found in feed, adding as new: {title}")
                return self.add_post(product)
            
            # Update product entry
            updated_entry = {
                "id": product_id,
                "title": product["title"],
                "affiliate_url": product["affiliate_url"],
                "price": float(product["price"]),
                "hype_score": int(product["hype_score"]),
                "excerpt": product["excerpt"],
                "added_at": feed_data["products"][product_index].get("added_at", datetime.now().isoformat()),
                "updated_at": datetime.now().isoformat(),
                "status": "active"
            }
            
            # Replace existing entry
            feed_data["products"][product_index] = updated_entry
            
            # Sort by hype score (highest first)
            feed_data["products"].sort(key=lambda x: x["hype_score"], reverse=True)
            
            # Save feed
            self._save_feed(feed_data)
            
            logger.info(f"Successfully updated product in feed: {title} (ID: {product_id})")
            return True
            
        except Exception as e:
            logger.error(f"Error updating product in feed: {str(e)}")
            return False
    
    def remove_post(self, product_id: str) -> bool:
        """
        Remove a product from the feed.
        
        Args:
            product_id: Product ID to remove
        
        Returns:
            bool: True if successful, False otherwise
        """
        logger.info(f"Removing product from feed: {product_id}")
        
        try:
            feed_data = self._load_feed()
            
            # Find and remove product
            original_count = len(feed_data["products"])
            feed_data["products"] = [
                p for p in feed_data["products"] 
                if p.get("id") != product_id
            ]
            
            if len(feed_data["products"]) == original_count:
                logger.warning(f"Product not found for removal: {product_id}")
                return False
            
            # Save feed
            self._save_feed(feed_data)
            
            logger.info(f"Successfully removed product from feed: {product_id}")
            return True
            
        except Exception as e:
            logger.error(f"Error removing product from feed: {str(e)}")
            return False
    
    def get_feed(self, limit: Optional[int] = None, min_hype_score: Optional[int] = None) -> List[Dict]:
        """
        Return all product entries for rendering.
        
        Args:
            limit: Maximum number of products to return
            min_hype_score: Minimum hype score filter
        
        Returns:
            List of product dictionaries
        """
        try:
            feed_data = self._load_feed()
            products = feed_data["products"]
            
            # Filter by hype score if specified
            if min_hype_score is not None:
                products = [p for p in products if p.get("hype_score", 0) >= min_hype_score]
            
            # Filter active products only
            products = [p for p in products if p.get("status") == "active"]
            
            # Apply limit if specified
            if limit is not None:
                products = products[:limit]
            
            logger.info(f"Retrieved {len(products)} products from feed")
            return products
            
        except Exception as e:
            logger.error(f"Error retrieving feed: {str(e)}")
            return []
    
    def get_feed_stats(self) -> Dict:
        """Get statistics about the feed."""
        try:
            feed_data = self._load_feed()
            products = feed_data["products"]
            
            if not products:
                return {
                    "total_products": 0,
                    "active_products": 0,
                    "average_hype_score": 0,
                    "price_range": {"min": 0, "max": 0},
                    "last_updated": feed_data["feed_info"].get("last_updated", "N/A")
                }
            
            active_products = [p for p in products if p.get("status") == "active"]
            prices = [p.get("price", 0) for p in active_products]
            hype_scores = [p.get("hype_score", 0) for p in active_products]
            
            stats = {
                "total_products": len(products),
                "active_products": len(active_products),
                "average_hype_score": round(sum(hype_scores) / len(hype_scores), 2) if hype_scores else 0,
                "price_range": {
                    "min": min(prices) if prices else 0,
                    "max": max(prices) if prices else 0
                },
                "last_updated": feed_data["feed_info"].get("last_updated", "N/A")
            }
            
            return stats
            
        except Exception as e:
            logger.error(f"Error getting feed stats: {str(e)}")
            return {}
    
    def render_feed_page(self, template_name: str = "feed.html", **kwargs) -> str:
        """
        Render the feed page using Flask template.
        
        Args:
            template_name: Name of the template file
            **kwargs: Additional template variables
        
        Returns:
            Rendered HTML string
        """
        try:
            products = self.get_feed()
            stats = self.get_feed_stats()
            
            template_vars = {
                "products": products,
                "feed_stats": stats,
                "page_title": "Product Feed",
                **kwargs
            }
            
            # Note: This requires Flask app context to work
            rendered_html = render_template(template_name, **template_vars)
            logger.info(f"Rendered feed page with {len(products)} products")
            return rendered_html
            
        except Exception as e:
            logger.error(f"Error rendering feed page: {str(e)}")
            return f"<html><body><h1>Error loading feed</h1><p>{str(e)}</p></body></html>"
    
    def cleanup_old_products(self, days_old: int = 30) -> int:
        """
        Remove products older than specified days.
        
        Args:
            days_old: Number of days after which to remove products
        
        Returns:
            Number of products removed
        """
        logger.info(f"Cleaning up products older than {days_old} days")
        
        try:
            feed_data = self._load_feed()
            original_count = len(feed_data["products"])
            
            cutoff_date = datetime.now().timestamp() - (days_old * 24 * 60 * 60)
            
            # Filter out old products
            feed_data["products"] = [
                p for p in feed_data["products"]
                if datetime.fromisoformat(p.get("added_at", datetime.now().isoformat())).timestamp() > cutoff_date
            ]
            
            removed_count = original_count - len(feed_data["products"])
            
            if removed_count > 0:
                self._save_feed(feed_data)
                logger.info(f"Removed {removed_count} old products from feed")
            else:
                logger.info("No old products found for cleanup")
            
            return removed_count
            
        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")
            return 0


# Example usage and testing
if __name__ == "__main__":
    # Initialize the website updater
    updater = WebsiteUpdater()
    
    # Sample products for testing
    sample_products = [
        {
            "title": "Wireless Bluetooth Headphones",
            "affiliate_url": "https://short.ly/abc123",
            "price": 59.99,
            "hype_score": 85,
            "excerpt": "Premium wireless headphones with noise cancellation. Perfect for music lovers and professionals."
        },
        {
            "title": "Smart LED Light Bulb",
            "affiliate_url": "https://short.ly/def456",
            "price": 12.99,
            "hype_score": 72,
            "excerpt": "WiFi-enabled smart bulb with color changing capabilities. Control with your smartphone."
        },
        {
            "title": "Gaming Mechanical Keyboard",
            "affiliate_url": "https://short.ly/ghi789",
            "price": 89.99,
            "hype_score": 45,
            "excerpt": "RGB backlit mechanical keyboard with custom switches. Perfect for gaming and typing."
        }
    ]
    
    print("=== WebsiteUpdater Demo ===\n")
    
    # Test adding products
    print("1. Adding products to feed...")
    for i, product in enumerate(sample_products, 1):
        success = updater.add_post(product)
        print(f"   Product {i}: {'✅ Added' if success else '❌ Failed'} - {product['title']}")
    
    # Test getting feed
    print("\n2. Retrieving feed...")
    feed = updater.get_feed()
    print(f"   Feed contains {len(feed)} products")
    
    # Show feed contents
    print("\n3. Feed contents:")
    for product in feed:
        print(f"   - {product['title']} (${product['price']}, Hype: {product['hype_score']})")
    
    # Test updating a product
    print("\n4. Updating product...")
    updated_product = sample_products[0].copy()
    updated_product["price"] = 49.99  # Price change
    updated_product["hype_score"] = 90  # Hype increase
    
    success = updater.update_post(updated_product)
    print(f"   Update: {'✅ Success' if success else '❌ Failed'}")
    
    # Test feed statistics
    print("\n5. Feed statistics:")
    stats = updater.get_feed_stats()
    print(f"   Total products: {stats['total_products']}")
    print(f"   Active products: {stats['active_products']}")
    print(f"   Average hype score: {stats['average_hype_score']}")
    print(f"   Price range: ${stats['price_range']['min']:.2f} - ${stats['price_range']['max']:.2f}")
    
    # Test filtering
    print("\n6. Filtered feed (high hype only):")
    high_hype_feed = updater.get_feed(min_hype_score=80)
    print(f"   High hype products: {len(high_hype_feed)}")
    
    for product in high_hype_feed:
        print(f"   - {product['title']} (Hype: {product['hype_score']})")
    
    print("\nDemo completed successfully!")
    print(f"Feed file location: {updater.feed_file}")