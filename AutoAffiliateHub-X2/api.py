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
    from flask import Flask, jsonify, request, render_template, redirect, url_for, flash
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

# Initialize Flask app if available
if FLASK_AVAILABLE:
    app = Flask(__name__)
    app.secret_key = os.getenv('FLASK_SECRET_KEY', 'dev-secret-change-in-production')
    
    # Production settings
    if os.getenv('FLASK_ENV') == 'production':
        app.config['DEBUG'] = False
        app.config['TESTING'] = False
    else:
        app.config['DEBUG'] = True

# Safe queue import for autonomous operation
try:
    from queue_manager import job_queue, add_twitter_post_job, add_amazon_link_job
    QUEUE_AVAILABLE = True
    logger.info("Job queue system imported successfully")
except ImportError as e:
    logger.warning(f"Job queue not available: {e}")
    QUEUE_AVAILABLE = False
    
    def add_twitter_post_job(*args, **kwargs):
        logger.warning("Queue not available - job not added")
        return None

# Simple in-memory storage for demo (replace with database in production)
import json
import datetime

posts_data = []

def load_posts():
    """Load posts from JSON file if it exists"""
    try:
        with open('posts_data.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return []

def save_posts():
    """Save posts to JSON file"""
    try:
        with open('posts_data.json', 'w') as f:
            json.dump(posts_data, f, indent=2, default=str)
    except Exception as e:
        logger.error(f"Error saving posts: {e}")

# Load existing posts on startup
posts_data = load_posts()

# Dashboard Routes
@app.route('/')
def index():
    """Redirect to dashboard"""
    return redirect(url_for('dashboard'))

@app.route('/dashboard')
def dashboard():
    """Main dashboard page"""
    # Calculate metrics
    total_posts = len(posts_data)
    successful_posts = len([p for p in posts_data if p.get('twitter_status') == 'success'])
    pending_posts = len([p for p in posts_data if p.get('twitter_status') == 'pending'])
    
    # Get queue stats if available
    queue_stats = {}
    if QUEUE_AVAILABLE:
        try:
            queue_stats = job_queue.get_stats()
        except Exception as e:
            logger.error(f"Error getting queue stats: {e}")
            queue_stats = {}
    
    metrics = {
        'total_posts': total_posts,
        'successful_posts': successful_posts,
        'pending_posts': pending_posts,
        'success_rate': round((successful_posts / total_posts * 100) if total_posts > 0 else 0, 1),
        'queue_stats': queue_stats
    }
    
    # Get recent posts (last 20)
    recent_posts = sorted(posts_data, key=lambda x: x.get('created_at', ''), reverse=True)[:20]
    
    return render_template('dashboard.html', posts=recent_posts, metrics=metrics, 
                         twitter_available=TWITTER_ENGINE_AVAILABLE,
                         amazon_available=AMAZON_ENGINE_AVAILABLE,
                         queue_available=QUEUE_AVAILABLE)

@app.route('/add-item', methods=['GET', 'POST'])
def add_item():
    """Add item page/form"""
    if request.method == 'POST':
        # Get form data
        item_name = request.form.get('item_name', '').strip()
        product_url = request.form.get('product_url', '').strip()
        
        # Validate input
        if not item_name or not product_url:
            flash('Both item name and product URL are required.', 'error')
            return render_template('add_item.html')
        
        # Validate Amazon URL
        if 'amazon.' not in product_url.lower():
            flash('Please provide a valid Amazon product URL.', 'error')
            return render_template('add_item.html')
        
        try:
            # Generate Amazon affiliate link
            amazon_result = generate_amazon_link(product_url)
            
            if amazon_result.get('status') == 'error':
                flash(f'Error generating Amazon link: {amazon_result.get("message", "Unknown error")}', 'error')
                return render_template('add_item.html')
            
            # Create post data
            post_data = {
                'id': len(posts_data) + 1,
                'title': item_name,
                'original_url': product_url,
                'affiliate_url': amazon_result.get('affiliate_url', product_url),
                'twitter_status': 'queued',
                'twitter_message': '',
                'created_at': datetime.datetime.now().isoformat(),
                'updated_at': datetime.datetime.now().isoformat()
            }
            
            # Queue Twitter posting for autonomous processing
            if QUEUE_AVAILABLE:
                try:
                    job_id = add_twitter_post_job(
                        item_name=item_name,
                        product_url=product_url,
                        affiliate_url=post_data['affiliate_url']
                    )
                    post_data['job_id'] = job_id
                    post_data['twitter_status'] = 'queued'
                    flash('Item added and queued for posting! The worker will post it automatically.', 'success')
                    logger.info(f"Queued Twitter post job {job_id} for item: {item_name}")
                except Exception as e:
                    logger.error(f"Error queuing Twitter job: {e}")
                    post_data['twitter_status'] = 'queue_failed'
                    flash('Item added but failed to queue for posting.', 'warning')
            else:
                # Fallback to immediate posting if queue not available
                tweet_message = f"🎯 {item_name}\n\nCheck it out: {post_data['affiliate_url']}\n\n#StockSpot #Deal"
                
                if TWITTER_ENGINE_AVAILABLE:
                    try:
                        tweet_success = send_tweet(tweet_message)
                        if tweet_success:
                            post_data['twitter_status'] = 'success'
                            post_data['twitter_message'] = tweet_message
                            flash('Item added and posted to Twitter/X successfully!', 'success')
                        else:
                            post_data['twitter_status'] = 'failed'
                            flash('Item added but failed to post to Twitter/X.', 'warning')
                    except Exception as e:
                        post_data['twitter_status'] = 'failed'
                        logger.error(f"Twitter posting error: {e}")
                        flash('Item added but Twitter/X posting failed.', 'warning')
                    except Exception as e:
                        post_data['twitter_status'] = 'failed'
                        logger.error(f"Twitter posting error: {e}")
                        flash('Item added but Twitter/X posting failed.', 'warning')
                else:
                    flash('Item added (Twitter/X not available for posting).', 'warning')
            
            # Add to posts and save
            posts_data.append(post_data)
            save_posts()
            
            return redirect(url_for('dashboard'))
            
        except Exception as e:
            logger.error(f"Error processing item: {e}")
            flash(f'Error processing item: {str(e)}', 'error')
            return render_template('add_item.html')
    
    return render_template('add_item.html')


@app.route('/status', methods=['GET'])
def status():
    """Health check endpoint"""
    return jsonify({
        "status": "OK", 
        "service": "StockSpot", 
        "version": "2.0.0",
        "integrations": {
            "twitter": TWITTER_ENGINE_AVAILABLE,
            "amazon": AMAZON_ENGINE_AVAILABLE,
            "queue": QUEUE_AVAILABLE
        }
    })

@app.route('/health', methods=['GET'])
def health():
    """Detailed health check for deployment platforms"""
    try:
        health_data = {
            "status": "healthy",
            "timestamp": datetime.datetime.now().isoformat(),
            "services": {
                "twitter": "available" if TWITTER_ENGINE_AVAILABLE else "unavailable",
                "amazon": "available" if AMAZON_ENGINE_AVAILABLE else "unavailable", 
                "queue": "available" if QUEUE_AVAILABLE else "unavailable"
            }
        }
        
        if QUEUE_AVAILABLE:
            try:
                queue_stats = job_queue.get_stats()
                health_data["queue_stats"] = queue_stats
            except Exception as e:
                health_data["queue_error"] = str(e)
        
        return jsonify(health_data), 200
        
    except Exception as e:
        return jsonify({
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.datetime.now().isoformat()
        }), 500

@app.route('/queue/stats', methods=['GET'])
def queue_stats():
    """Get job queue statistics"""
    if not QUEUE_AVAILABLE:
        return jsonify({"error": "Queue not available"}), 503
    
    try:
        stats = job_queue.get_stats()
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


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
        if not TWITTER_ENGINE_AVAILABLE:
            return jsonify({
                "error": "Twitter engine not available"
            }), 503

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
        if not TWITTER_ENGINE_AVAILABLE:
            return jsonify({
                "error": "Twitter engine not available"
            }), 503

        test_message = "StockSpot Test Post - Amazon + Twitter Integration Working! 🚀"
        
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


@app.route('/amazon/link', methods=['POST'])
def amazon_link():
    """
    Generate Amazon affiliate link
    
    Expected JSON:
    {
        "product_url": "https://www.amazon.com/dp/B08N5WRWNW" or "B08N5WRWNW"
    }
    """
    try:
        if not AMAZON_ENGINE_AVAILABLE:
            return jsonify({
                "error": "Amazon link engine not available"
            }), 503

        # Validate content type
        if not request.is_json:
            return jsonify({
                "error": "Content-Type must be application/json"
            }), 400
        
        data = request.get_json()
        
        # Validate required fields
        if not data or 'product_url' not in data:
            return jsonify({
                "error": "Missing required field 'product_url'"
            }), 400
        
        product_url = data['product_url']
        
        if not product_url or not product_url.strip():
            return jsonify({
                "error": "product_url cannot be empty"
            }), 400
        
        # Generate Amazon affiliate link
        result = generate_amazon_link(product_url.strip())
        
        if result['status'] == 'success':
            logger.info(f"Generated Amazon link for: {product_url}")
            return jsonify({
                "success": True,
                "affiliate_url": result['affiliate_url'],
                "product_info": result.get('product_info'),
                "message": result['message']
            }), 200
        else:
            logger.error(f"Failed to generate Amazon link: {result['message']}")
            return jsonify({
                "error": result['message']
            }), 400
            
    except Exception as e:
        logger.error(f"Error in /amazon/link endpoint: {e}")
        return jsonify({
            "error": "Internal server error"
        }), 500


@app.route('/amazon/test', methods=['GET'])
def test_amazon():
    """Test Amazon link generation"""
    try:
        if not AMAZON_ENGINE_AVAILABLE:
            return jsonify({
                "error": "Amazon link engine not available"
            }), 503

        # Test with sample ASIN
        test_asin = "B08N5WRWNW"  # Sample ASIN
        result = generate_amazon_link(test_asin)
        
        return jsonify({
            "test_asin": test_asin,
            "result": result
        })
        
    except Exception as e:
        logger.error(f"Error in /amazon/test endpoint: {e}")
        return jsonify({
            "error": "Internal server error"
        }), 500


@app.route('/twitter/status', methods=['GET'])
def twitter_status():
    """Check Twitter API connection status"""
    try:
        if not TWITTER_ENGINE_AVAILABLE:
            return jsonify({
                "connected": False,
                "error": "Twitter engine not available"
            }), 503
            
        connected = test_twitter_connection()
        
        return jsonify({
            "connected": connected,
            "engine": "available" if TWITTER_ENGINE_AVAILABLE else "unavailable",
            "message": "Twitter connection OK" if connected else "Check credentials"
        })
        
    except Exception as e:
        logger.error(f"Error checking Twitter status: {e}")
        return jsonify({
            "connected": False,
            "error": str(e)
        }), 500


@app.route('/deal', methods=['POST'])
def post_deal():
    """
    Post a deal to Twitter with Amazon affiliate link
    
    Expected JSON:
    {
        "title": "Amazing Product",
        "price": "29.99",
        "original_price": "49.99", 
        "product_url": "https://www.amazon.com/dp/B08N5WRWNW",
        "discount_percent": 40
    }
    """
    try:
        if not TWITTER_ENGINE_AVAILABLE:
            return jsonify({
                "error": "Twitter engine not available"
            }), 503

        # Validate content type
        if not request.is_json:
            return jsonify({
                "error": "Content-Type must be application/json"
            }), 400
        
        data = request.get_json()
        
        # Validate required fields
        if not data or 'title' not in data or 'product_url' not in data:
            return jsonify({
                "error": "Missing required fields: title, product_url"
            }), 400

        # Generate Amazon affiliate link if Amazon engine available
        affiliate_url = data['product_url']
        if AMAZON_ENGINE_AVAILABLE:
            link_result = generate_amazon_link(data['product_url'])
            if link_result['status'] == 'success':
                affiliate_url = link_result['affiliate_url']
        
        # Prepare deal data for Twitter posting
        deal_data = {
            'title': data['title'],
            'price': data.get('price', ''),
            'original_price': data.get('original_price', ''),
            'discount_percent': data.get('discount_percent', 0),
            'affiliate_url': affiliate_url
        }
        
        # Format and post tweet (using our Twitter engine's deal formatting)
        from twitter_engine import get_poster
        poster = get_poster()
        success = poster.post_deal(deal_data)
        
        if success:
            return jsonify({
                "success": True,
                "message": "Deal posted to Twitter successfully",
                "affiliate_url": affiliate_url
            }), 200
        else:
            return jsonify({
                "error": "Failed to post deal to Twitter"
            }), 500
            
    except Exception as e:
        logger.error(f"Error in /deal endpoint: {e}")
        return jsonify({
            "error": "Internal server error"
        }), 500


@app.route('/', methods=['GET'])
def home():
    """API information endpoint"""
    return jsonify({
        "service": "StockSpot API",
        "version": "2.0.0",
        "description": "Amazon affiliate + Twitter/X integration for automated deal posting",
        "integrations": {
            "twitter": TWITTER_ENGINE_AVAILABLE,
            "amazon": AMAZON_ENGINE_AVAILABLE
        },
        "endpoints": {
            "GET /status": "Health check and service status",
            "POST /tweet": "Post a tweet to Twitter/X",
            "GET|POST /test_tweet": "Post test tweet",
            "POST /amazon/link": "Generate Amazon affiliate link",
            "GET /amazon/test": "Test Amazon link generation",
            "GET /twitter/status": "Check Twitter connection",
            "POST /deal": "Post deal to Twitter with Amazon link",
            "GET /": "This information"
        }
    })


@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors"""
    return jsonify({
        "error": "Endpoint not found",
        "available_endpoints": ["/", "/status", "/tweet", "/test_tweet", "/amazon/link", "/amazon/test", "/twitter/status", "/deal"]
    }), 404


def run_server():
    """Run the Flask server"""
    if not FLASK_AVAILABLE:
        print("Flask not available - cannot start server")
        return
        
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') != 'production'
    host = os.getenv('HOST', '0.0.0.0')
    
    logger.info("🚀 Starting StockSpot API server...")
    logger.info(f"Environment: {os.getenv('FLASK_ENV', 'development')}")
    logger.info(f"Host: {host}")
    logger.info(f"Port: {port}")
    logger.info(f"Debug: {debug}")
    logger.info(f"Twitter integration: {'✅' if TWITTER_ENGINE_AVAILABLE else '❌'}")
    logger.info(f"Amazon integration: {'✅' if AMAZON_ENGINE_AVAILABLE else '❌'}")
    logger.info(f"Queue integration: {'✅' if QUEUE_AVAILABLE else '❌'}")
    
    # Production vs Development server
    if os.getenv('FLASK_ENV') == 'production':
        # Use a production WSGI server in production
        try:
            from waitress import serve
            logger.info("🏗️  Using Waitress WSGI server for production")
            serve(app, host=host, port=port, threads=4)
        except ImportError:
            logger.warning("Waitress not available, using Flask dev server (not recommended for production)")
            app.run(host=host, port=port, debug=False, threaded=True)
    else:
        logger.info("🔧 Using Flask development server")
        app.run(host=host, port=port, debug=debug)


if __name__ == '__main__':
    run_server()