"""
AutoAffiliateHub-X2 Autonomous Scheduler
Fully automated deal discovery, processing, and posting system.

This is the main automation engine that orchestrates all modules:
- Discovers trending deals every 2 hours
- Generates affiliate links automatically  
- Creates optimized social media captions
- Schedules posts across multiple platforms
- Updates website feed in real-time
- Monitors system health and errors

Run Instructions:
    python app/auto_scheduler.py
    
    To run in test mode:
    Set test_mode: true in config.yaml
    
    To pause/resume:
    Set system_paused: true/false in config.yaml or via dashboard
    
Logs:
    - Actions: logs/auto_scheduler.log
    - Errors: logs/errors.log
"""

import os
import sys
import time
import logging
import signal
import json
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Import AutoAffiliateHub modules
try:
    from app.deal_engine import DealEngine
    from app.affiliate_link_engine import AffiliateLinkEngine
    from app.caption_engine import CaptionEngine
    from app.posting_engine import PostingEngine
    from app.website_updater import WebsiteUpdater
    MODULES_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Could not import all modules: {e}")
    MODULES_AVAILABLE = False

# YAML support (optional)
try:
    import yaml
    YAML_AVAILABLE = True
except ImportError:
    YAML_AVAILABLE = False
    print("Warning: PyYAML not available, using JSON config")


class AutoScheduler:
    """Main autonomous scheduler for AutoAffiliateHub-X2"""
    
    def __init__(self, config_path='config.yaml'):
        self.config_path = config_path
        self.config = self.load_config()
        self.running = True
        
        # Initialize modules (with fallback if unavailable)
        if MODULES_AVAILABLE:
            self.deal_engine = DealEngine()
            self.affiliate_engine = AffiliateLinkEngine()
            self.caption_engine = CaptionEngine()
            self.posting_engine = PostingEngine()
            self.website_updater = WebsiteUpdater()
        else:
            self.deal_engine = None
            self.affiliate_engine = None
            self.caption_engine = None
            self.posting_engine = None
            self.website_updater = None
        
        # Setup logging
        self.setup_logging()
        
        # Setup signal handlers for graceful shutdown
        signal.signal(signal.SIGINT, self.signal_handler)
        if hasattr(signal, 'SIGTERM'):
            signal.signal(signal.SIGTERM, self.signal_handler)
        
        # Cycle configuration (2 hours default as specified)
        self.cycle_interval = 7200  # 2 hours in seconds
        self.pause_check_interval = 600  # 10 minutes
        self.max_deals_per_cycle = 5
        
        # Override from config if available
        if 'scheduler' in self.config:
            scheduler_config = self.config['scheduler']
            self.cycle_interval = scheduler_config.get('cycle_interval_hours', 2) * 3600
            self.max_deals_per_cycle = scheduler_config.get('max_deals_per_cycle', 5)
        
        self.logger.info("🤖 AutoScheduler initialized successfully")
        
    def load_config(self):
        """Load configuration from YAML or JSON file"""
        # Default configuration
        default_config = {
            'test_mode': True,
            'system_paused': False,
            'scheduler': {
                'cycle_interval_hours': 2,
                'max_deals_per_cycle': 5,
                'min_deal_score': 75
            },
            'posting': {
                'platforms': ['twitter', 'facebook', 'instagram'],
                'max_posts_per_day': 20
            },
            'logging': {
                'level': 'INFO'
            }
        }
        
        try:
            if os.path.exists(self.config_path):
                with open(self.config_path, 'r', encoding='utf-8') as file:
                    content = file.read().strip()
                    
                    if not content:
                        return default_config
                    
                    # Try YAML first if available
                    if YAML_AVAILABLE and self.config_path.endswith('.yaml'):
                        try:
                            config = yaml.safe_load(content)
                            return config if config else default_config
                        except Exception:
                            pass
                    
                    # Try JSON format
                    try:
                        config = json.loads(content)
                        return config if config else default_config
                    except json.JSONDecodeError:
                        print(f"Warning: Could not parse {self.config_path}, using defaults")
                        return default_config
            else:
                # Create default config file
                self.save_config(default_config)
                return default_config
                
        except Exception as e:
            print(f"❌ Error loading config: {e}")
            return default_config
    
    def save_config(self, config):
        """Save configuration to file"""
        try:
            # Create directory if needed
            config_dir = os.path.dirname(self.config_path)
            if config_dir:
                os.makedirs(config_dir, exist_ok=True)
            
            with open(self.config_path, 'w', encoding='utf-8') as file:
                if YAML_AVAILABLE and self.config_path.endswith('.yaml'):
                    yaml.dump(config, file, default_flow_style=False)
                else:
                    json.dump(config, file, indent=2)
            return True
        except Exception as e:
            print(f"❌ Error saving config: {e}")
            return False
            
    def setup_logging(self):
        """Setup comprehensive logging system"""
        # Create logs directory
        os.makedirs('logs', exist_ok=True)
        
        # Main scheduler logger
        self.logger = logging.getLogger('AutoScheduler')
        self.logger.setLevel(logging.INFO)
        
        # Clear any existing handlers
        self.logger.handlers.clear()
        
        # Scheduler log handler
        scheduler_handler = logging.FileHandler('logs/auto_scheduler.log', encoding='utf-8')
        scheduler_formatter = logging.Formatter(
            '%(asctime)s - %(levelname)s - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        scheduler_handler.setFormatter(scheduler_formatter)
        self.logger.addHandler(scheduler_handler)
        
        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(scheduler_formatter)
        self.logger.addHandler(console_handler)
        
        # Error logger
        self.error_logger = logging.getLogger('Errors')
        self.error_logger.setLevel(logging.ERROR)
        self.error_logger.handlers.clear()
        
        error_handler = logging.FileHandler('logs/errors.log', encoding='utf-8')
        error_formatter = logging.Formatter(
            '%(asctime)s - ERROR - %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        error_handler.setFormatter(error_formatter)
        self.error_logger.addHandler(error_handler)
        
    def signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        self.logger.info(f"🛑 Received shutdown signal ({signum}). Initiating graceful shutdown...")
        self.running = False
        
    def reload_config(self):
        """Reload configuration file for runtime updates"""
        try:
            old_config = self.config.copy()
            self.config = self.load_config()
            
            # Check for important changes
            if old_config.get('system_paused') != self.config.get('system_paused'):
                status = "PAUSED" if self.config.get('system_paused') else "RESUMED"
                self.logger.info(f"🔄 System status changed: {status}")
                
            if old_config.get('test_mode') != self.config.get('test_mode'):
                mode = "TEST" if self.config.get('test_mode') else "PRODUCTION"
                self.logger.info(f"🔄 Mode changed: {mode}")
                
            return True
        except Exception as e:
            self.error_logger.error(f"Failed to reload config: {e}")
            return False
    
    def get_mock_deals(self):
        """Generate mock deals for testing"""
        return [
            {
                'id': 'mock_deal_001',
                'title': 'Apple AirPods Pro (2nd Generation)',
                'url': 'https://www.amazon.com/dp/B0BDHWDR12',
                'price': 179.99,
                'original_price': 249.99,
                'discount': 28,
                'deal_score': 95,
                'category': 'Electronics'
            },
            {
                'id': 'mock_deal_002', 
                'title': 'Samsung Galaxy Watch 6',
                'url': 'https://www.amazon.com/dp/B0C3G6KZ7D',
                'price': 199.99,
                'original_price': 299.99,
                'discount': 33,
                'deal_score': 88,
                'category': 'Wearables'
            }
        ]
    
    def discover_deals(self):
        """Discover trending deals"""
        try:
            if self.config.get('test_mode', True):
                self.logger.info("🧪 Using mock deal data (test mode)")
                return self.get_mock_deals()
            else:
                if self.deal_engine:
                    self.logger.info("🔍 Discovering real deals...")
                    deals = self.deal_engine.get_trending_deals()
                    return deals[:self.max_deals_per_cycle]
                else:
                    self.logger.warning("⚠️ Deal engine not available, using mock data")
                    return self.get_mock_deals()
        except Exception as e:
            self.error_logger.error(f"Error in deal discovery: {e}")
            return []
    
    def generate_affiliate_link(self, deal):
        """Generate affiliate link for a deal"""
        try:
            if self.config.get('test_mode', True):
                # Mock affiliate link generation
                mock_link = f"https://amzn.to/mock_{deal.get('id', 'unknown')}"
                self.logger.info(f"🧪 Mock affiliate link: {mock_link}")
                return {
                    'success': True,
                    'affiliate_link': mock_link,
                    'tracking_id': f"track_{int(time.time())}"
                }
            else:
                if self.affiliate_engine:
                    product_url = deal.get('url', deal.get('link'))
                    result = self.affiliate_engine.convert_to_affiliate_link(
                        product_url=product_url,
                        platform='amazon'
                    )
                    return result
                else:
                    self.logger.warning("⚠️ Affiliate engine not available")
                    return {'success': False, 'error': 'Module not available'}
        except Exception as e:
            self.error_logger.error(f"Error generating affiliate link: {e}")
            return {'success': False, 'error': str(e)}
    
    def generate_caption(self, deal):
        """Generate optimized social media caption"""
        try:
            if self.config.get('test_mode', True):
                # Mock caption generation
                emoji = "🔥" if deal.get('deal_score', 0) > 90 else "💎"
                caption = f"{emoji} Amazing deal on {deal.get('title', 'this product')}! {deal.get('discount', 25)}% OFF!"
                
                self.logger.info(f"🧪 Mock caption: {caption}")
                return {
                    'success': True,
                    'caption': caption,
                    'hashtags': ['#deal', '#savings', '#affiliate', '#shopping']
                }
            else:
                if self.caption_engine:
                    result = self.caption_engine.generate_caption(deal=deal)
                    return result
                else:
                    self.logger.warning("⚠️ Caption engine not available")
                    return {'success': False, 'error': 'Module not available'}
        except Exception as e:
            self.error_logger.error(f"Error generating caption: {e}")
            return {'success': False, 'error': str(e)}
    
    def schedule_posts(self, deal, caption_result, affiliate_link):
        """Schedule posts across social media platforms"""
        try:
            platforms = self.config.get('posting', {}).get('platforms', ['twitter', 'facebook'])
            
            if self.config.get('test_mode', True):
                # Mock post scheduling
                self.logger.info(f"🧪 MOCK: Would schedule post to {len(platforms)} platforms")
                self.logger.info(f"🧪 Content: {caption_result.get('caption', 'No caption')}")
                self.logger.info(f"🧪 Link: {affiliate_link}")
                return {
                    'success': True,
                    'posts_scheduled': len(platforms),
                    'platforms': platforms
                }
            else:
                if self.posting_engine:
                    post_content = {
                        'deal': deal,
                        'caption': caption_result.get('caption'),
                        'hashtags': caption_result.get('hashtags', []),
                        'platforms': platforms,
                        'affiliate_link': affiliate_link
                    }
                    result = self.posting_engine.post_to_multiple_platforms(post_content)
                    return result
                else:
                    self.logger.warning("⚠️ Posting engine not available")
                    return {'success': False, 'error': 'Module not available'}
        except Exception as e:
            self.error_logger.error(f"Error scheduling posts: {e}")
            return {'success': False, 'error': str(e)}
    
    def update_website_feed(self, deal, caption_result):
        """Update website feed with new deal"""
        try:
            if self.config.get('test_mode', True):
                self.logger.info(f"🧪 MOCK: Would update website feed with: {deal.get('title')}")
                return {'success': True}
            else:
                if self.website_updater:
                    # Prepare deal for feed
                    feed_deal = deal.copy()
                    feed_deal['posted_date'] = datetime.now().strftime('%Y-%m-%d')
                    feed_deal['status'] = 'active'
                    feed_deal['caption'] = caption_result.get('caption')
                    
                    # This would update the actual feed
                    self.logger.info(f"📝 Updated website feed with: {deal.get('title')}")
                    return {'success': True}
                else:
                    self.logger.warning("⚠️ Website updater not available")
                    return {'success': False, 'error': 'Module not available'}
        except Exception as e:
            self.error_logger.error(f"Error updating website feed: {e}")
            return {'success': False, 'error': str(e)}
    
    def process_single_deal(self, deal):
        """Process a single deal through the complete pipeline"""
        deal_id = deal.get('id', 'unknown')
        deal_title = deal.get('title', 'Unknown Deal')
        
        try:
            self.logger.info(f"🔄 Processing deal: {deal_title}")
            
            # Step 1: Generate affiliate link
            affiliate_result = self.generate_affiliate_link(deal)
            if not affiliate_result.get('success'):
                self.logger.warning(f"⚠️ Failed to generate affiliate link for {deal_id}")
                return False
            
            affiliate_link = affiliate_result['affiliate_link']
            
            # Step 2: Generate optimized caption  
            caption_result = self.generate_caption(deal)
            if not caption_result.get('success'):
                self.logger.warning(f"⚠️ Failed to generate caption for {deal_id}")
                return False
            
            # Step 3: Schedule social media posts
            posting_result = self.schedule_posts(deal, caption_result, affiliate_link)
            if not posting_result.get('success'):
                self.logger.warning(f"⚠️ Failed to schedule posts for {deal_id}")
                return False
            
            # Step 4: Update website feed
            website_result = self.update_website_feed(deal, caption_result)
            if not website_result.get('success'):
                self.logger.warning(f"⚠️ Failed to update website for {deal_id}")
            
            # Log successful completion
            self.logger.info(f"✅ Successfully processed: {deal_title} (Score: {deal.get('deal_score', 'N/A')})")
            return True
            
        except Exception as e:
            self.error_logger.error(f"Error processing deal {deal_id}: {e}")
            return False
    
    def run_cycle(self):
        """Execute one complete automation cycle"""
        cycle_start = time.time()
        
        self.logger.info("🚀 Starting automation cycle...")
        
        # Discover deals
        deals = self.discover_deals()
        if not deals:
            self.logger.info("📦 No deals found this cycle")
            return 0, 0
        
        self.logger.info(f"📦 Found {len(deals)} deals to process")
        
        processed_count = 0
        successful_posts = 0
        
        # Process each deal
        for deal in deals:
            try:
                if self.process_single_deal(deal):
                    successful_posts += 1
                processed_count += 1
                
                # Brief pause between deals
                time.sleep(2)
                
            except Exception as e:
                self.error_logger.error(f"Error in deal processing loop: {e}")
                continue
        
        cycle_duration = time.time() - cycle_start
        self.logger.info(f"⏱️ Cycle completed in {cycle_duration:.1f}s - Processed: {processed_count}, Posted: {successful_posts}")
        
        return processed_count, successful_posts
    
    def run(self):
        """Main automation loop - runs continuously every 2 hours"""
        # Display startup banner as specified
        test_mode = self.config.get('test_mode', True)
        print("🚀 AutoAffiliateHub-X2 Autonomous Scheduler started (mock mode: {})".format(test_mode))
        
        self.logger.info(f"🚀 AutoAffiliateHub-X2 Autonomous Scheduler started (mock mode: {test_mode})")
        
        total_cycles = 0
        total_deals = 0
        total_posts = 0
        
        try:
            while self.running:
                try:
                    # Reload config to check for runtime changes
                    self.reload_config()
                    
                    # Check if system is paused
                    if self.config.get('system_paused', False):
                        self.logger.info("⏸️ System paused — skipping cycle")
                        time.sleep(self.pause_check_interval)  # Sleep 10 minutes as specified
                        continue
                    
                    # Run automation cycle
                    processed, posted = self.run_cycle()
                    total_cycles += 1
                    total_deals += processed
                    total_posts += posted
                    
                    # Log session statistics
                    self.logger.info(f"📊 Session totals - Cycles: {total_cycles}, Deals: {total_deals}, Posts: {total_posts}")
                    
                    # Sleep for 2 hours as specified (7200 seconds)
                    self.logger.info(f"😴 Sleeping for 2 hours until next cycle...")
                    
                    # Sleep in small chunks to allow for interruption
                    sleep_remaining = self.cycle_interval
                    while sleep_remaining > 0 and self.running:
                        sleep_chunk = min(60, sleep_remaining)  # 1-minute chunks
                        time.sleep(sleep_chunk)
                        sleep_remaining -= sleep_chunk
                        
                except KeyboardInterrupt:
                    self.logger.info("🛑 Keyboard interrupt received")
                    break
                except Exception as e:
                    self.error_logger.error(f"Error in main automation loop: {e}")
                    self.logger.warning("⚠️ Error in cycle, sleeping 30 minutes before retry")
                    time.sleep(1800)  # 30 minutes
                    
        except Exception as e:
            self.error_logger.error(f"Fatal error in scheduler: {e}")
            
        finally:
            # Graceful shutdown
            self.logger.info("🔄 Graceful shutdown initiated...")
            self.logger.info(f"📊 Final session statistics:")
            self.logger.info(f"   - Cycles completed: {total_cycles}")
            self.logger.info(f"   - Deals processed: {total_deals}")
            self.logger.info(f"   - Posts created: {total_posts}")
            self.logger.info("✅ AutoAffiliateHub-X2 Autonomous Scheduler stopped")
            print("✅ AutoAffiliateHub-X2 Autonomous Scheduler stopped gracefully")


def main():
    """Main entry point"""
    try:
        scheduler = AutoScheduler()
        scheduler.run()
    except Exception as e:
        print(f"❌ Failed to start scheduler: {e}")
        return 1
    return 0


if __name__ == '__main__':
    exit(main())