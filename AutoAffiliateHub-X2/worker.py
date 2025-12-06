#!/usr/bin/env python3
"""
StockSpot Autonomous Background Worker
Processes jobs from the queue autonomously in the cloud
"""

import os
import sys
import time
import signal
import logging
from datetime import datetime
from typing import Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Safe imports with fallbacks
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    logger.warning("python-dotenv not available")

try:
    from queue_manager import job_queue
    QUEUE_AVAILABLE = True
except ImportError as e:
    logger.error(f"Queue manager not available: {e}")
    QUEUE_AVAILABLE = False

try:
    from twitter_engine import send_tweet
    TWITTER_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Twitter engine not available: {e}")
    TWITTER_AVAILABLE = False
    
    def send_tweet(message, image_path=None):
        logger.warning("Twitter engine not available - simulating tweet")
        return False

try:
    from amazon_links import generate_amazon_link
    AMAZON_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Amazon engine not available: {e}")
    AMAZON_AVAILABLE = False
    
    def generate_amazon_link(url):
        logger.warning("Amazon engine not available")
        return {'status': 'error', 'message': 'Engine not available'}

class StockSpotWorker:
    """Autonomous background worker for StockSpot"""
    
    def __init__(self):
        self.running = True
        self.jobs_processed = 0
        self.start_time = datetime.now()
        
        # Register signal handlers for graceful shutdown
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        
        logger.info("🚀 StockSpot Worker starting up...")
        logger.info(f"Twitter available: {TWITTER_AVAILABLE}")
        logger.info(f"Amazon available: {AMAZON_AVAILABLE}")
        logger.info(f"Queue available: {QUEUE_AVAILABLE}")
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down gracefully...")
        self.running = False
    
    def process_twitter_post_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Process a Twitter posting job"""
        try:
            data = job['data']
            item_name = data.get('item_name', '')
            affiliate_url = data.get('affiliate_url', data.get('product_url', ''))
            
            # Create optimized tweet content
            tweet_content = self._format_tweet(item_name, affiliate_url)
            
            # Post to Twitter
            if TWITTER_AVAILABLE:
                success = send_tweet(tweet_content)
                
                if success:
                    logger.info(f"Successfully posted tweet for: {item_name}")
                    return {
                        'status': 'success',
                        'tweet_content': tweet_content,
                        'posted_at': datetime.now().isoformat()
                    }
                else:
                    raise Exception("Tweet posting failed")
            else:
                logger.warning("Twitter not available - simulating success")
                return {
                    'status': 'simulated',
                    'tweet_content': tweet_content,
                    'message': 'Twitter engine not available'
                }
                
        except Exception as e:
            logger.error(f"Error processing Twitter post job: {e}")
            raise
    
    def process_amazon_link_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Process an Amazon link generation job"""
        try:
            data = job['data']
            product_url = data.get('product_url', '')
            
            if not product_url:
                raise Exception("No product URL provided")
            
            # Generate affiliate link
            result = generate_amazon_link(product_url)
            
            if result.get('status') == 'error':
                raise Exception(result.get('message', 'Amazon link generation failed'))
            
            logger.info(f"Generated Amazon link: {result.get('affiliate_url', 'No URL')}")
            return {
                'status': 'success',
                'original_url': product_url,
                'affiliate_url': result.get('affiliate_url', product_url),
                'generated_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error processing Amazon link job: {e}")
            raise
    
    def process_metrics_update_job(self, job: Dict[str, Any]) -> Dict[str, Any]:
        """Process a metrics update job"""
        try:
            # Update metrics (cleanup, recalculate stats, etc.)
            if QUEUE_AVAILABLE:
                job_queue.cleanup_old_jobs(days=7)
            
            logger.info("Metrics updated successfully")
            return {
                'status': 'success',
                'updated_at': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error processing metrics update: {e}")
            raise
    
    def _format_tweet(self, item_name: str, affiliate_url: str) -> str:
        """Format a tweet with optimal content"""
        # Keep tweet under 280 characters
        base_text = f"🎯 {item_name}\n\nCheck it out: {affiliate_url}\n\n#StockSpot #Deal"
        
        if len(base_text) <= 280:
            return base_text
        
        # Truncate item name if needed
        max_name_length = 280 - len(f"🎯 ...\n\nCheck it out: {affiliate_url}\n\n#StockSpot #Deal")
        if max_name_length > 10:
            truncated_name = item_name[:max_name_length-3] + "..."
            return f"🎯 {truncated_name}\n\nCheck it out: {affiliate_url}\n\n#StockSpot #Deal"
        
        # Fallback minimal format
        return f"🎯 Deal Alert!\n\n{affiliate_url}\n\n#StockSpot"
    
    def process_job(self, job: Dict[str, Any]) -> bool:
        """Process a single job"""
        try:
            job_type = job.get('type')
            job_id = job.get('id')
            
            logger.info(f"Processing job {job_id} of type {job_type}")
            
            # Route to appropriate processor
            if job_type == 'twitter_post':
                result = self.process_twitter_post_job(job)
            elif job_type == 'amazon_link':
                result = self.process_amazon_link_job(job)
            elif job_type == 'metrics_update':
                result = self.process_metrics_update_job(job)
            else:
                raise Exception(f"Unknown job type: {job_type}")
            
            # Mark job as completed
            if QUEUE_AVAILABLE:
                job_queue.complete_job(job_id, result)
            
            self.jobs_processed += 1
            logger.info(f"Job {job_id} completed successfully")
            return True
            
        except Exception as e:
            logger.error(f"Job {job.get('id')} failed: {e}")
            if QUEUE_AVAILABLE:
                job_queue.fail_job(job.get('id'), str(e))
            return False
    
    def run(self):
        """Main worker loop"""
        logger.info("✅ Worker is running and processing jobs...")
        
        while self.running:
            try:
                if not QUEUE_AVAILABLE:
                    logger.error("Queue not available - worker cannot function")
                    time.sleep(60)
                    continue
                
                # Get next job from queue
                job = job_queue.get_next_job()
                
                if job:
                    self.process_job(job)
                else:
                    # No jobs available, wait before checking again
                    time.sleep(10)
                
                # Log stats periodically
                if self.jobs_processed > 0 and self.jobs_processed % 10 == 0:
                    uptime = datetime.now() - self.start_time
                    logger.info(f"Worker stats: {self.jobs_processed} jobs processed, uptime: {uptime}")
                
            except Exception as e:
                logger.error(f"Worker error: {e}")
                time.sleep(30)  # Wait before retrying
        
        logger.info("🛑 Worker shutting down...")
        
        # Final stats
        uptime = datetime.now() - self.start_time
        logger.info(f"Final stats: {self.jobs_processed} jobs processed, total uptime: {uptime}")

def main():
    """Main entry point"""
    if not QUEUE_AVAILABLE:
        logger.error("❌ Job queue not available - cannot start worker")
        sys.exit(1)
    
    # Initialize worker
    worker = StockSpotWorker()
    
    try:
        # Start processing
        worker.run()
    except KeyboardInterrupt:
        logger.info("Worker interrupted by user")
    except Exception as e:
        logger.error(f"Worker crashed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()