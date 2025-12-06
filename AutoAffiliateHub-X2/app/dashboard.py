from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
import os
import logging
from functools import wraps
from datetime import datetime, timedelta
from typing import Dict, List

# Import our custom modules
from app.deal_engine import DealEngine
from app.affiliate_link_engine import AffiliateLinkEngine
from app.caption_engine import CaptionEngine
from app.posting_engine import PostingEngine
from app.website_updater import WebsiteUpdater
from app.monetization_engine import monetization_engine

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__, template_folder='../templates', static_folder='../static')
app.secret_key = os.urandom(24)

# Load dashboard password from environment
OWNER_PASSWORD = os.getenv("OWNER_DASHBOARD_PASSWORD", "admin123")  # Default for demo

# Initialize system components
deal_engine = DealEngine()
affiliate_engine = AffiliateLinkEngine()
caption_engine = CaptionEngine()
posting_engine = PostingEngine()
website_updater = WebsiteUpdater()

# System status tracking
system_status = {
    "is_paused": False,
    "last_run": None,
    "total_processed": 0,
    "errors": []
}

logger.info("Dashboard initialized with all engines")

def login_required(f):
    """Decorator to require login for protected routes."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session:
            logger.warning(f"Unauthorized access attempt to {request.endpoint}")
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def log_dashboard_action(action: str, details: str = ""):
    """Log dashboard actions for audit trail."""
    timestamp = datetime.now().isoformat()
    log_entry = f"[{timestamp}] Dashboard Action: {action}"
    if details:
        log_entry += f" - {details}"
    logger.info(log_entry)

@app.route("/login", methods=["GET", "POST"])
def login():
    """Login page with password authentication."""
    if request.method == "POST":
        password = request.form.get("password", "")
        
        if password == OWNER_PASSWORD:
            session['logged_in'] = True
            session['login_time'] = datetime.now().isoformat()
            log_dashboard_action("User logged in successfully")
            flash("Login successful!", "success")
            return redirect(url_for('overview'))
        else:
            log_dashboard_action("Failed login attempt")
            flash("Invalid password!", "error")
    
    return render_template("login.html")

@app.route("/logout")
@login_required
def logout():
    """Logout and clear session."""
    log_dashboard_action("User logged out")
    session.clear()
    flash("Logged out successfully!", "info")
    return redirect(url_for('login'))

@app.route("/")
@login_required
def overview():
    """Dashboard overview page with system metrics."""
    log_dashboard_action("Accessed overview page")
    
    try:
        # Get posting statistics
        posting_stats = posting_engine.get_posting_stats()
        
        # Get feed statistics
        feed_stats = website_updater.get_feed_stats()
        
        # Get recent deals
        recent_deals = deal_engine.get_trending_deals()[:5]  # Top 5 deals
        
        # Get monetization data for overview
        monetization_summary = monetization_engine.get_summary_stats()
        estimated_revenue = monetization_summary.get('total_revenue', 0.0)
        
        # System health check
        health_status = {
            "deal_engine": "✅ Operational",
            "affiliate_engine": "✅ Operational" if affiliate_engine.amazon_associate_id else "⚠️ Missing Config",
            "posting_engine": "✅ Operational" if posting_engine.twitter_client else "⚠️ Missing Twitter Config",
            "website_updater": "✅ Operational"
        }
        
        dashboard_data = {
            "estimated_revenue": round(estimated_revenue, 2),
            "total_posts": posting_stats.get('total_posts', 0),
            "success_rate": posting_stats.get('success_rate', 0),
            "active_products": feed_stats.get('active_products', 0),
            "queue_size": posting_stats.get('queue_size', 0),
            "system_status": system_status,
            "health_status": health_status,
            "recent_deals": recent_deals,
            "platform_stats": posting_stats.get('platform_stats', {}),
            "monetization_summary": monetization_summary
        }
        
        return render_template("overview.html", **dashboard_data)
        
    except Exception as e:
        logger.error(f"Error loading overview: {str(e)}")
        flash(f"Error loading dashboard: {str(e)}", "error")
        return render_template("overview.html", error=True)

@app.route("/queue")
@login_required
def queue():
    """Queue management page."""
    log_dashboard_action("Accessed queue page")
    
    try:
        # Get current queue
        current_queue = posting_engine.posting_queue
        
        # Get recent deals for adding to queue
        available_deals = deal_engine.get_trending_deals()
        
        # Get queue status
        queue_status = posting_engine.get_queue_status()
        
        queue_data = {
            "queue_items": current_queue,
            "queue_size": len(current_queue),
            "queue_status": queue_status,
            "available_deals": available_deals,
            "system_paused": system_status["is_paused"]
        }
        
        return render_template("queue.html", **queue_data)
        
    except Exception as e:
        logger.error(f"Error loading queue: {str(e)}")
        flash(f"Error loading queue: {str(e)}", "error")
        return render_template("queue.html", error=True)

@app.route("/queue/add", methods=["POST"])
@login_required
def add_to_queue():
    """Add a deal to the posting queue."""
    try:
        deal_index = int(request.form.get("deal_index", -1))
        schedule_time = request.form.get("schedule_time", "")
        
        if deal_index < 0:
            flash("Invalid deal selected!", "error")
            return redirect(url_for('queue'))
        
        # Get the deal
        deals = deal_engine.get_trending_deals()
        if deal_index >= len(deals):
            flash("Deal not found!", "error")
            return redirect(url_for('queue'))
        
        deal = deals[deal_index]
        
        # Process through the pipeline
        affiliate_deal = affiliate_engine.process_deal_url(deal.get('url', ''), deal)
        content_deal = caption_engine.generate_all_content(affiliate_deal)
        
        # Parse schedule time if provided
        schedule_datetime = None
        if schedule_time:
            try:
                schedule_datetime = datetime.fromisoformat(schedule_time)
            except ValueError:
                flash("Invalid schedule time format!", "error")
                return redirect(url_for('queue'))
        
        # Add to queue
        posting_engine.add_to_queue(content_deal, schedule_datetime)
        
        # Add to website feed
        website_updater.add_post(content_deal)
        
        log_dashboard_action("Added deal to queue", f"Deal: {deal['title']}")
        flash(f"Added '{deal['title']}' to queue!", "success")
        
    except Exception as e:
        logger.error(f"Error adding to queue: {str(e)}")
        flash(f"Error adding to queue: {str(e)}", "error")
    
    return redirect(url_for('queue'))

@app.route("/queue/remove/<int:index>")
@login_required
def remove_from_queue(index):
    """Remove an item from the queue."""
    try:
        if 0 <= index < len(posting_engine.queue):
            removed_item = posting_engine.queue.pop(index)
            title = removed_item['product'].get('title', 'Unknown')
            log_dashboard_action("Removed from queue", f"Item: {title}")
            flash(f"Removed '{title}' from queue!", "success")
        else:
            flash("Invalid queue item!", "error")
    except Exception as e:
        logger.error(f"Error removing from queue: {str(e)}")
        flash(f"Error removing from queue: {str(e)}", "error")
    
    return redirect(url_for('queue'))

@app.route("/queue/process")
@login_required
def process_queue():
    """Process all items in the queue."""
    try:
        if system_status["is_paused"]:
            flash("System is paused! Resume to process queue.", "warning")
            return redirect(url_for('queue'))
        
        if not posting_engine.posting_queue:
            flash("Queue is empty!", "info")
            return redirect(url_for('queue'))
        
        log_dashboard_action("Processing queue", f"{len(posting_engine.posting_queue)} items")
        results = posting_engine.process_queue()
        
        successful = results.get('successful', 0)
        total = results.get('total', 0)
        
        system_status["last_run"] = datetime.now().isoformat()
        system_status["total_processed"] += total
        
        flash(f"Processed queue: {successful}/{total} successful!", "success")
        
    except Exception as e:
        logger.error(f"Error processing queue: {str(e)}")
        flash(f"Error processing queue: {str(e)}", "error")
    
    return redirect(url_for('queue'))

@app.route("/history")
@login_required
def history():
    """Post history and analytics page."""
    log_dashboard_action("Accessed history page")
    
    try:
        # Get posting history
        posting_history = posting_engine.posting_history
        
        # Get feed history
        feed_data = website_updater.get_feed()
        
        # Calculate analytics
        total_posts = len(posting_history)
        successful_posts = sum(1 for post in posting_history if post['success'])
        
        # Platform breakdown
        platform_analytics = {}
        for post in posting_history:
            for platform, result in post.get('platform_results', {}).items():
                if platform not in platform_analytics:
                    platform_analytics[platform] = {'total': 0, 'successful': 0}
                platform_analytics[platform]['total'] += 1
                if result['success']:
                    platform_analytics[platform]['successful'] += 1
        
        history_data = {
            "posting_history": posting_history[:50],  # Latest 50 posts
            "feed_history": feed_data[:20],  # Latest 20 feed items
            "total_posts": total_posts,
            "successful_posts": successful_posts,
            "success_rate": round((successful_posts / total_posts) * 100, 2) if total_posts > 0 else 0,
            "platform_analytics": platform_analytics
        }
        
        return render_template("history.html", **history_data)
        
    except Exception as e:
        logger.error(f"Error loading history: {str(e)}")
        flash(f"Error loading history: {str(e)}", "error")
        return render_template("history.html", error=True)

@app.route("/settings", methods=["GET", "POST"])
@login_required
def settings():
    """Settings management page."""
    if request.method == "POST":
        try:
            action = request.form.get("action")
            
            if action == "update_credentials":
                # Update environment variables (in production, this would update .env file)
                updates = {
                    "amazon_associate_id": request.form.get("amazon_associate_id", ""),
                    "amazon_access_key": request.form.get("amazon_access_key", ""),
                    "amazon_secret_key": request.form.get("amazon_secret_key", ""),
                    "twitter_api_key": request.form.get("twitter_api_key", ""),
                    "twitter_api_secret": request.form.get("twitter_api_secret", ""),
                    "twitter_access_token": request.form.get("twitter_access_token", ""),
                    "twitter_access_secret": request.form.get("twitter_access_secret", "")
                }
                
                # Update engines with new credentials
                affiliate_engine.amazon_associate_id = updates["amazon_associate_id"]
                affiliate_engine.amazon_access_key = updates["amazon_access_key"]
                affiliate_engine.amazon_secret_key = updates["amazon_secret_key"]
                
                # Update Twitter credentials
                posting_engine.twitter_api_key = updates["twitter_api_key"]
                posting_engine.twitter_api_secret = updates["twitter_api_secret"]
                posting_engine.twitter_access_token = updates["twitter_access_token"]
                posting_engine.twitter_access_secret = updates["twitter_access_secret"]
                
                # Reinitialize Twitter client if credentials changed
                if posting_engine._validate_twitter_credentials():
                    posting_engine._initialize_twitter_client()
                
                log_dashboard_action("Updated credentials")
                flash("Credentials updated successfully!", "success")
                
            elif action == "toggle_system":
                system_status["is_paused"] = not system_status["is_paused"]
                status = "paused" if system_status["is_paused"] else "resumed"
                log_dashboard_action(f"System {status}")
                flash(f"System {status}!", "info")
                
            elif action == "clear_history":
                posting_engine.posting_history.clear()
                log_dashboard_action("Cleared posting history")
                flash("Posting history cleared!", "info")
                
            elif action == "cleanup_feed":
                days = int(request.form.get("cleanup_days", 30))
                removed = website_updater.cleanup_old_products(days)
                log_dashboard_action("Feed cleanup", f"Removed {removed} old products")
                flash(f"Removed {removed} old products from feed!", "success")
                
        except Exception as e:
            logger.error(f"Error updating settings: {str(e)}")
            flash(f"Error updating settings: {str(e)}", "error")
        
        return redirect(url_for('settings'))
    
    # GET request - show settings page
    log_dashboard_action("Accessed settings page")
    
    settings_data = {
        "current_credentials": {
            "amazon_associate_id": affiliate_engine.amazon_associate_id or "",
            "amazon_access_key": affiliate_engine.amazon_access_key or "",
            "amazon_secret_key": affiliate_engine.amazon_secret_key or "",
            "twitter_api_key": posting_engine.twitter_api_key or "",
            "twitter_api_secret": posting_engine.twitter_api_secret or "",
            "twitter_access_token": posting_engine.twitter_access_token or "",
            "twitter_access_secret": posting_engine.twitter_access_secret or ""
        },
        "system_status": system_status,
        "feed_stats": website_updater.get_feed_stats()
    }
    
    return render_template("settings.html", **settings_data)

@app.route("/api/stats")
@login_required
def api_stats():
    """API endpoint for real-time statistics."""
    try:
        stats = {
            "posting_stats": posting_engine.get_posting_stats(),
            "feed_stats": website_updater.get_feed_stats(),
            "system_status": system_status,
            "queue_size": len(posting_engine.queue)
        }
        return jsonify(stats)
    except Exception as e:
        logger.error(f"Error getting API stats: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/api/deals")
@login_required
def api_deals():
    """API endpoint for current deals."""
    try:
        deals = deal_engine.get_trending_deals()
        return jsonify(deals)
    except Exception as e:
        logger.error(f"Error getting API deals: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.errorhandler(404)
def not_found(error):
    """Custom 404 page."""
    return render_template("404.html"), 404

@app.errorhandler(500)
def internal_error(error):
    """Custom 500 page."""
    logger.error(f"Internal server error: {str(error)}")
    return render_template("500.html"), 500

@app.context_processor
def inject_globals():
    """Inject global variables into all templates."""
    return {
        "system_paused": system_status["is_paused"],
        "login_time": session.get('login_time'),
        "app_name": "StockSpot"
    }

# Development route for testing
@app.route("/analytics")
@login_required
def analytics():
    """Revenue Analytics & Performance Intelligence page."""
    log_dashboard_action("Accessed analytics page")
    
    try:
        # Get monetization data
        summary_stats = monetization_engine.get_summary_stats()
        top_performers = monetization_engine.get_top_performers(10)
        platform_analytics = monetization_engine.get_platform_analytics()
        
        analytics_data = {
            "summary_stats": summary_stats,
            "top_performers": top_performers,
            "platform_analytics": platform_analytics
        }
        
        return render_template("analytics.html", **analytics_data)
        
    except Exception as e:
        logger.error(f"Error loading analytics: {str(e)}")
        flash(f"Error loading analytics: {str(e)}", "error")
        return render_template("analytics.html", 
                             summary_stats={}, 
                             top_performers=[], 
                             platform_analytics={}, 
                             error=True)

@app.route("/analytics/export")
@login_required  
def export_analytics():
    """Export analytics data as CSV."""
    try:
        import io
        from flask import make_response
        
        # Create CSV content
        output = io.StringIO()
        
        # Write header
        output.write("post_id,deal_title,platform,ctr,epc,conversions,revenue,performance_score,last_updated\n")
        
        # Write data
        top_performers = monetization_engine.get_top_performers(100)  # Export top 100
        for deal in top_performers:
            row = f"{deal['post_id']},{deal['deal_title']},{deal['platform']},{deal['ctr']},{deal['epc']},{deal['total_conversions']},{deal['total_revenue']},{deal['performance_score']},{deal['last_updated']}\n"
            output.write(row)
        
        # Create response
        response = make_response(output.getvalue())
        response.headers["Content-Type"] = "text/csv"
        response.headers["Content-Disposition"] = f"attachment; filename=stockspot_analytics_{datetime.now().strftime('%Y%m%d')}.csv"
        
        log_dashboard_action("Exported analytics data")
        return response
        
    except Exception as e:
        logger.error(f"Error exporting analytics: {str(e)}")
        flash(f"Error exporting analytics: {str(e)}", "error")
        return redirect(url_for('analytics'))

@app.route("/api/monetization/update", methods=["POST"])
@login_required
def update_monetization():
    """API endpoint to update monetization metrics."""
    try:
        data = request.get_json()
        
        monetization_engine.update_metrics(
            post_id=data.get('post_id'),
            clicks=data.get('clicks', 0),
            conversions=data.get('conversions', 0),
            revenue=data.get('revenue', 0.0),
            engagement=data.get('engagement', {}),
            platform=data.get('platform', 'unknown'),
            deal_title=data.get('deal_title', ''),
            post_url=data.get('post_url', '')
        )
        
        return jsonify({"success": True, "message": "Metrics updated successfully"})
        
    except Exception as e:
        logger.error(f"Error updating monetization metrics: {str(e)}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route("/test")
@login_required
def test_systems():
    """Test all systems and return status."""
    log_dashboard_action("Running system tests")
    
    test_results = {
        "deal_engine": "✅ OK",
        "affiliate_engine": "✅ OK",
        "caption_engine": "✅ OK",
        "posting_engine": "✅ OK",
        "website_updater": "✅ OK",
        "monetization_engine": "✅ OK"
    }
    
    try:
        # Test deal engine
        deals = deal_engine.get_trending_deals()
        if not deals:
            test_results["deal_engine"] = "⚠️ No deals found"
        
        # Test affiliate engine
        if not affiliate_engine.amazon_associate_id:
            test_results["affiliate_engine"] = "⚠️ Missing Amazon credentials"
        
        # Test posting engine
        if not posting_engine.twitter_client:
            test_results["posting_engine"] = "⚠️ Twitter not configured"
        
        # Test website updater
        stats = website_updater.get_feed_stats()
        if stats.get('total_products', 0) == 0:
            test_results["website_updater"] = "⚠️ Empty feed"
            
        # Test monetization engine
        summary_stats = monetization_engine.get_summary_stats()
        if summary_stats.get('total_posts', 0) == 0:
            test_results["monetization_engine"] = "⚠️ No tracking data"
            
    except Exception as e:
        logger.error(f"System test error: {str(e)}")
        test_results["error"] = str(e)
    
    return jsonify(test_results)

if __name__ == "__main__":
    logger.info("Starting StockSpot Dashboard")
    logger.info("Dashboard will be available at:")
    logger.info("  Local: http://localhost:5000")
    logger.info("  Network: http://0.0.0.0:5000")
    
    if not OWNER_PASSWORD or OWNER_PASSWORD == "admin123":
        logger.warning("⚠️  Using default password! Set OWNER_DASHBOARD_PASSWORD in .env")
    
    app.run(host="0.0.0.0", port=5000, debug=True)