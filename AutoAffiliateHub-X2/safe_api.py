#!/usr/bin/env python3
"""
Safe Flask API for StockSpot
Uses safe imports to prevent crashes when Flask is missing
"""

import os
import sys
import logging

# Add project root to path
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

from src.utils.safe_import import get_flask, get_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv = get_dotenv()
if load_dotenv:
    load_dotenv()

# Get Flask safely
Flask = get_flask()

if Flask and hasattr(Flask, '__name__'):
    # Real Flask is available
    from flask import jsonify, request
    
    app = Flask(__name__)
    app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-change-in-production')
    
    @app.route('/status', methods=['GET'])
    def status():
        """Health check endpoint"""
        return jsonify({"status": "OK", "service": "StockSpot", "version": "1.0.0"})
    
    @app.route('/tweet', methods=['POST'])
    def tweet():
        """Post a tweet to Twitter/X"""
        try:
            if not request.is_json:
                return jsonify({"error": "Content-Type must be application/json"}), 400
            
            data = request.get_json()
            if not data or 'message' not in data:
                return jsonify({"error": "Missing required field 'message'"}), 400
            
            message = data['message']
            image_path = data.get('image', None)
            
            if not message.strip():
                return jsonify({"error": "Message cannot be empty"}), 400
            
            if len(message) > 280:
                return jsonify({"error": f"Message too long: {len(message)} characters"}), 400
            
            # Import Twitter engine lazily
            from src.engines.twitter_engine import get_twitter_engine
            
            engine = get_twitter_engine()
            success = engine.post_tweet(message, image_path)
            
            if success:
                return jsonify({
                    "success": True,
                    "message": "Tweet posted successfully",
                    "tweet_content": message[:100] + "..." if len(message) > 100 else message
                }), 200
            else:
                return jsonify({"error": "Failed to post tweet"}), 500
                
        except Exception as e:
            logger.error(f"Error in /tweet endpoint: {e}")
            return jsonify({"error": "Internal server error"}), 500
    
    @app.route('/twitter/status', methods=['GET'])
    def twitter_status():
        """Check Twitter API connection status"""
        try:
            from src.engines.twitter_engine import get_twitter_engine
            
            engine = get_twitter_engine()
            status = engine.get_status()
            
            return jsonify({
                "connected": status.get('configured', False),
                "status": status
            })
            
        except Exception as e:
            logger.error(f"Error checking Twitter status: {e}")
            return jsonify({"connected": False, "error": str(e)}), 500
    
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
                "GET /twitter/status": "Check Twitter connection",
                "GET /": "This information"
            }
        })
    
    def run_server():
        """Run the Flask development server"""
        port = int(os.getenv('PORT', 5000))
        debug = os.getenv('FLASK_ENV') == 'development'
        
        logger.info("🔥 Starting StockSpot API server...")
        logger.info(f"Port: {port}")
        logger.info(f"Debug: {debug}")
        
        app.run(
            host='0.0.0.0',
            port=port,
            debug=debug
        )

else:
    # Flask fallback - no actual server
    class MockApp:
        def route(self, *args, **kwargs):
            def decorator(func):
                return func
            return decorator
        
        def run(self, *args, **kwargs):
            print("Flask not installed, skipping UI service")
            logger.info("Flask not available - UI service disabled")
    
    app = MockApp()
    
    def status():
        return {"status": "OK (Flask fallback)", "service": "StockSpot", "version": "1.0.0"}
    
    def tweet():
        print("Flask not available - cannot handle /tweet endpoint")
        return {"error": "Flask not installed"}
    
    def twitter_status():
        print("Flask not available - cannot handle /twitter/status endpoint")
        return {"error": "Flask not installed"}
    
    def home():
        return {
            "service": "StockSpot API (Flask Fallback)",
            "version": "1.0.0",
            "note": "Flask not installed - web interface disabled"
        }
    
    def run_server():
        """Fallback server function"""
        print("Flask not installed, skipping UI service")
        logger.warning("Flask not available - cannot start web server")
        logger.info("Install Flask to enable web interface: pip install flask")


if __name__ == '__main__':
    run_server()