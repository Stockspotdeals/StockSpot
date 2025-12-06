#!/usr/bin/env python3
"""
StockSpot Flask API - Amazon + Twitter/X Only
Clean API focused on essential functionality
"""

import os
import logging

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Safe Flask import
try:
    from flask import Flask, jsonify, request
    FLASK_AVAILABLE = True
except ImportError as e:
    logger.error(f"Flask not available: {e}")
    FLASK_AVAILABLE = False

# Safe dotenv import
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    logger.warning("python-dotenv not available")

# Safe imports of our modules
try:
    from twitter_engine import send_tweet, get_twitter_client, test_twitter_connection
    TWITTER_ENGINE_AVAILABLE = True
    logger.info("Twitter engine imported successfully")
except ImportError as e:
    logger.warning(f"Twitter engine not available: {e}")
    TWITTER_ENGINE_AVAILABLE = False
    
    def send_tweet(message, image_path=None):
        """Fallback send_tweet function"""
        logger.warning("Twitter engine not available")
        return False
        
    def test_twitter_connection():
        return False

try:
    from amazon_links import generate_amazon_link, test_amazon_links
    AMAZON_ENGINE_AVAILABLE = True
    logger.info("Amazon link engine imported successfully")
except ImportError as e:
    logger.warning(f"Amazon link engine not available: {e}")
    AMAZON_ENGINE_AVAILABLE = False
    
    def generate_amazon_link(product_id):
        """Fallback Amazon link function"""
        logger.warning("Amazon engine not available")
        return {'affiliate_url': '', 'status': 'error', 'message': 'Amazon engine not available'}

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-change-in-production')


@app.route('/status', methods=['GET'])
def status():
    """Health check endpoint"""
    return jsonify({"status": "OK", "service": "StockSpot", "version": "1.0.0"})


@app.route('/tweet', methods=['POST'])
def tweet():
    """
    Post a tweet to Twitter/X
    
    Expected JSON:
    {
        "message": "Your tweet content here",
        "image": null or "/path/to/image.jpg" (optional)
    }
    """
    try:
        # Validate content type
        if not request.is_json:
            return jsonify({
                "error": "Content-Type must be application/json"
            }), 400
        
        data = request.get_json()
        
        # Validate required fields
        if not data or 'message' not in data:
            return jsonify({
                "error": "Missing required field 'message'"
            }), 400
        
        message = data['message']
        image_path = data.get('image', None)
        
        # Validate message
        if not message or not message.strip():
            return jsonify({
                "error": "Message cannot be empty"
            }), 400
        
        if len(message) > 280:
            return jsonify({
                "error": f"Message too long: {len(message)} characters (max 280)"
            }), 400
        
        # Post to Twitter
        success = send_tweet(message, image_path)
        
        if success:
            logger.info(f"Tweet posted successfully: {message[:50]}...")
            return jsonify({
                "success": True,
                "message": "Tweet posted successfully",
                "tweet_content": message[:100] + "..." if len(message) > 100 else message
            }), 200
        else:
            logger.error("Failed to post tweet")
            return jsonify({
                "error": "Failed to post tweet. Check logs for details."
            }), 500
            
    except Exception as e:
        logger.error(f"Error in /tweet endpoint: {e}")
        return jsonify({
            "error": "Internal server error"
        }), 500


@app.route('/test_tweet', methods=['GET', 'POST'])
def test_tweet():
    """Test endpoint to post 'StockSpot Test Post' to Twitter"""
    try:
        test_message = "StockSpot Test Post"
        
        success = send_tweet(test_message)
        
        if success:
            logger.info("Test tweet posted successfully")
            return jsonify({
                "success": True,
                "message": "Test tweet posted successfully",
                "tweet_content": test_message
            }), 200
        else:
            logger.error("Failed to post test tweet")
            return jsonify({
                "success": False,
                "error": "Failed to post test tweet. Check configuration and credentials."
            }), 500
            
    except Exception as e:
        logger.error(f"Error in /test_tweet endpoint: {e}")
        return jsonify({
            "success": False,
            "error": "Internal server error"
        }), 500


@app.route('/twitter/status', methods=['GET'])
def twitter_status():
    """Check Twitter API connection status"""
    try:
        # Check if posting engine is available
        if not POSTING_ENGINE_AVAILABLE:
            return jsonify({
                "connected": False,
                "error": "Posting engine not available"
            }), 500
            
        # For now, return basic status
        return jsonify({
            "connected": True,
            "posting_engine": "available",
            "message": "Twitter posting engine is loaded"
        })
        
    except Exception as e:
        logger.error(f"Error checking Twitter status: {e}")
        return jsonify({
            "connected": False,
            "error": str(e)
        }), 500


@app.route('/', methods=['GET'])
def home():
    """API information endpoint"""
    return jsonify({
        "service": "StockSpot API",
        "version": "1.0.0",
        "description": "Amazon affiliate marketing automation with Twitter integration",
        "endpoints": {
            "GET /status": "Health check",
            "POST /tweet": "Post a tweet",
            "GET|POST /test_tweet": "Post 'StockSpot Test Post' to Twitter",
            "GET /twitter/status": "Check Twitter API connection",
            "GET /": "This information"
        }
    })


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        "error": "Endpoint not found",
        "available_endpoints": ["/", "/status", "/tweet", "/test_tweet", "/twitter/status"]
    }), 404


@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {error}")
    return jsonify({
        "error": "Internal server error"
    }), 500


if __name__ == '__main__':
    # Development server
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    logger.info("Starting StockSpot API server...")
    logger.info(f"Environment: {'development' if debug else 'production'}")
    logger.info(f"Port: {port}")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug
    )