#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Post Flow Test

This script tests the complete post lifecycle including:
- Post queue management and scheduling
- Platform-specific posting simulation
- Affiliate link tracking and conversion
- Analytics integration and dashboard updates
- Rate limiting and error handling

All operations run in TEST MODE with mock API responses.

Usage:
    python deployment/pilot_scripts/test_post_flow.py
    python deployment/pilot_scripts/test_post_flow.py --platform twitter
    python deployment/pilot_scripts/test_post_flow.py --posts 10
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import argparse
from unittest.mock import Mock, patch

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Import AutoAffiliateHub components
try:
    from app.posting_engine import PostingEngine
    from app.queue_manager import QueueManager
    from app.monetization_engine import MonetizationEngine
    from app.affiliate_link_engine import AffiliateLinkEngine
    from app.caption_engine import CaptionEngine
except ImportError as e:
    print(f"❌ Import error: {e}")
    print("💡 Make sure you're running from the AutoAffiliateHub-X2 directory")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('deployment/logs/post_flow_test.log')
    ]
)
logger = logging.getLogger(__name__)

class PostFlowTester:
    """Test complete post lifecycle and platform integrations."""
    
    def __init__(self, target_platform: Optional[str] = None, verbose: bool = False):
        """Initialize post flow tester."""
        self.target_platform = target_platform
        self.verbose = verbose
        
        if verbose:
            logging.getLogger().setLevel(logging.DEBUG)
        
        # Force test mode
        os.environ['TEST_MODE'] = 'true'
        os.environ['DRY_RUN'] = 'true'
        
        # Test statistics
        self.stats = {
            'posts_created': 0,
            'posts_queued': 0,
            'posts_processed': 0,
            'posts_successful': 0,
            'posts_failed': 0,
            'conversions_tracked': 0,
            'revenue_generated': 0.0,
            'rate_limits_hit': 0,
            'errors': [],
            'start_time': datetime.now()
        }
        
        # Platform configurations for testing
        self.platforms = {
            'twitter': {
                'rate_limit': 300,  # tweets per hour
                'max_length': 280,
                'supports_images': True,
                'supports_hashtags': True
            },
            'reddit': {
                'rate_limit': 600,  # posts per hour
                'max_length': 10000,
                'supports_images': True,
                'supports_hashtags': False
            },
            'instagram': {
                'rate_limit': 200,  # posts per hour
                'max_length': 2200,
                'supports_images': True,
                'supports_hashtags': True
            }
        }
        
        # Test post data
        self.test_posts = [
            {
                'deal_id': 'test_deal_1',
                'title': 'Amazing Tech Deal - MacBook Pro M3',
                'description': 'Latest MacBook Pro with M3 chip at 20% discount',
                'price': 1999.99,
                'discount': 20,
                'retailer': 'Apple',
                'category': 'Electronics',
                'affiliate_links': {
                    'primary': 'https://affilly.com/track/macbook-pro-m3',
                    'backup': 'https://apple.com/macbook-pro'
                },
                'image_url': 'https://apple.com/macbook-pro-m3.jpg',
                'tags': ['tech', 'laptop', 'apple', 'deal']
            },
            {
                'deal_id': 'test_deal_2', 
                'title': 'Fashion Flash Sale - Nike Sneakers',
                'description': 'Limited time offer on popular Nike Air Max sneakers',
                'price': 149.99,
                'discount': 15,
                'retailer': 'Nike',
                'category': 'Fashion',
                'affiliate_links': {
                    'primary': 'https://affilly.com/track/nike-air-max',
                    'backup': 'https://nike.com/air-max-270'
                },
                'image_url': 'https://nike.com/air-max-270.jpg',
                'tags': ['fashion', 'sneakers', 'nike', 'limited']
            },
            {
                'deal_id': 'test_deal_3',
                'title': 'Home & Kitchen Deal - Instant Pot',
                'description': 'Multi-functional pressure cooker for healthy cooking',
                'price': 79.99,
                'discount': 30,
                'retailer': 'Amazon',
                'category': 'Home',
                'affiliate_links': {
                    'primary': 'https://affilly.com/track/instant-pot-duo',
                    'backup': 'https://amazon.com/instant-pot-duo'
                },
                'image_url': 'https://amazon.com/instant-pot-duo.jpg',
                'tags': ['kitchen', 'cooking', 'health', 'appliance']
            }
        ]
        
        logger.info("🧪 PostFlowTester initialized")
    
    def create_test_posts(self, count: int = 5) -> List[Dict[str, Any]]:
        """Create test posts for different platforms."""
        logger.info(f"📝 Creating {count} test posts...")
        
        posts = []
        caption_engine = CaptionEngine()
        
        platforms_to_test = [self.target_platform] if self.target_platform else ['twitter', 'reddit', 'instagram']
        
        for i in range(count):
            deal = self.test_posts[i % len(self.test_posts)]
            
            for platform in platforms_to_test:
                # Generate platform-specific content
                content = caption_engine.generate_caption(
                    deal_data=deal,
                    platform=platform,
                    style='engaging'
                )
                
                post = {
                    'id': f"test_post_{i}_{platform}",
                    'deal_id': deal['deal_id'],
                    'platform': platform,
                    'content': content.get('text', f"Check out this amazing {deal['title']} deal!"),
                    'hashtags': content.get('hashtags', []),
                    'media_urls': [deal['image_url']],
                    'affiliate_links': deal['affiliate_links'],
                    'scheduled_time': datetime.now() + timedelta(minutes=i * 5),
                    'priority': 1 + (i % 3),  # Priority 1-3
                    'created_at': datetime.now(),
                    'status': 'pending',
                    'retry_count': 0,
                    'metadata': {
                        'price': deal['price'],
                        'discount': deal['discount'],
                        'retailer': deal['retailer'],
                        'category': deal['category']
                    }
                }
                
                posts.append(post)
                self.stats['posts_created'] += 1
        
        logger.info(f"✅ Created {len(posts)} posts for {len(platforms_to_test)} platforms")
        return posts
    
    def test_queue_management(self, posts: List[Dict[str, Any]]) -> bool:
        """Test post queue management functionality."""
        logger.info("📬 Testing queue management...")
        
        try:
            queue_manager = QueueManager()
            
            # Test adding posts to queue
            for post in posts:
                queue_name = f"posting_queue_{post['platform']}"
                
                success = queue_manager.add_to_queue(
                    queue_name=queue_name,
                    item=post,
                    priority=post['priority'],
                    scheduled_time=post.get('scheduled_time')
                )
                
                if success:
                    self.stats['posts_queued'] += 1
                    if self.verbose:
                        logger.debug(f"📬 Queued {post['platform']} post: {post['id']}")
                else:
                    logger.error(f"❌ Failed to queue post: {post['id']}")
                    self.stats['errors'].append(f"Queue failed for post {post['id']}")
            
            # Test queue inspection
            for platform in self.platforms.keys():
                queue_name = f"posting_queue_{platform}"
                queue_size = queue_manager.get_queue_size(queue_name)
                pending_posts = queue_manager.get_pending_items(queue_name, limit=10)
                
                logger.info(f"📊 {platform} queue: {queue_size} total, {len(pending_posts)} pending")
                
                if self.verbose and pending_posts:
                    for post in pending_posts[:3]:  # Show first 3
                        logger.debug(f"   📋 {post.get('id', 'unknown')}: {post.get('content', '')[:50]}...")
            
            logger.info(f"✅ Queue management test complete: {self.stats['posts_queued']} posts queued")
            return True
            
        except Exception as e:
            logger.error(f"❌ Queue management test failed: {e}")
            self.stats['errors'].append(f"Queue management error: {str(e)}")
            return False
    
    def mock_platform_apis(self):
        """Set up mock responses for platform APIs."""
        
        def mock_twitter_post(content, media=None, **kwargs):
            """Mock Twitter API response."""
            time.sleep(0.1)  # Simulate API delay
            return {
                'success': True,
                'post_id': f"twitter_post_{int(time.time())}",
                'url': f"https://twitter.com/user/status/{int(time.time())}",
                'engagement': {'likes': 5, 'retweets': 2, 'replies': 1}
            }
        
        def mock_reddit_post(content, subreddit=None, **kwargs):
            """Mock Reddit API response."""
            time.sleep(0.2)  # Simulate API delay
            return {
                'success': True,
                'post_id': f"reddit_post_{int(time.time())}",
                'url': f"https://reddit.com/r/deals/comments/{int(time.time())}/",
                'engagement': {'upvotes': 15, 'comments': 3}
            }
        
        def mock_instagram_post(content, media=None, **kwargs):
            """Mock Instagram API response."""
            time.sleep(0.15)  # Simulate API delay
            return {
                'success': True,
                'post_id': f"ig_post_{int(time.time())}",
                'url': f"https://instagram.com/p/{int(time.time())}/",
                'engagement': {'likes': 25, 'comments': 4}
            }
        
        # Patch platform-specific posting methods
        self.mock_patches = {
            'twitter': patch('app.posting_engine.PostingEngine._post_to_twitter', side_effect=mock_twitter_post),
            'reddit': patch('app.posting_engine.PostingEngine._post_to_reddit', side_effect=mock_reddit_post),  
            'instagram': patch('app.posting_engine.PostingEngine._post_to_instagram', side_effect=mock_instagram_post)
        }
        
        # Start all patches
        for platform, patch_obj in self.mock_patches.items():
            patch_obj.start()
    
    def test_posting_engine(self, posts: List[Dict[str, Any]]) -> bool:
        """Test posting engine with mock API responses."""
        logger.info("📤 Testing posting engine...")
        
        try:
            # Set up mock APIs
            self.mock_platform_apis()
            
            posting_engine = PostingEngine()
            
            # Process posts for each platform
            platforms_to_test = [self.target_platform] if self.target_platform else list(self.platforms.keys())
            
            for platform in platforms_to_test:
                platform_posts = [p for p in posts if p['platform'] == platform]
                
                if not platform_posts:
                    continue
                
                logger.info(f"🔄 Processing {len(platform_posts)} {platform} posts...")
                
                # Process posts with rate limiting
                for post in platform_posts[:3]:  # Limit to 3 posts per platform for testing
                    try:
                        # Simulate rate limiting check
                        rate_limit = self.platforms[platform]['rate_limit']
                        if self.stats['posts_processed'] > 0 and self.stats['posts_processed'] % 10 == 0:
                            logger.warning(f"⚠️ Rate limit simulation for {platform}")
                            self.stats['rate_limits_hit'] += 1
                            time.sleep(1)  # Simulate rate limit delay
                        
                        # Process post (mocked)
                        result = posting_engine.post_content(
                            platform=platform,
                            content=post['content'],
                            media_urls=post.get('media_urls', []),
                            affiliate_links=post.get('affiliate_links', {}),
                            post_id=post['id']
                        )
                        
                        if result.get('success'):
                            self.stats['posts_successful'] += 1
                            post['status'] = 'posted'
                            post['posted_at'] = datetime.now()
                            post['platform_post_id'] = result.get('post_id')
                            post['post_url'] = result.get('url')
                            
                            if self.verbose:
                                logger.debug(f"✅ Posted to {platform}: {post['id']}")
                        else:
                            self.stats['posts_failed'] += 1
                            post['status'] = 'failed'
                            logger.warning(f"⚠️ Post failed: {post['id']}")
                        
                        self.stats['posts_processed'] += 1
                        
                    except Exception as e:
                        logger.error(f"❌ Error processing post {post['id']}: {e}")
                        self.stats['posts_failed'] += 1
                        self.stats['errors'].append(f"Post processing error: {str(e)}")
            
            # Clean up mocks
            for patch_obj in self.mock_patches.values():
                patch_obj.stop()
            
            logger.info(f"✅ Posting engine test complete: {self.stats['posts_successful']} successful, {self.stats['posts_failed']} failed")
            return True
            
        except Exception as e:
            logger.error(f"❌ Posting engine test failed: {e}")
            self.stats['errors'].append(f"Posting engine error: {str(e)}")
            return False
    
    def test_affiliate_tracking(self, posts: List[Dict[str, Any]]) -> bool:
        """Test affiliate link tracking and conversion simulation."""
        logger.info("🔗 Testing affiliate tracking...")
        
        try:
            affiliate_engine = AffiliateLinkEngine()
            
            # Simulate clicks and conversions for successful posts
            successful_posts = [p for p in posts if p.get('status') == 'posted']
            
            for post in successful_posts[:2]:  # Test conversion for 2 posts
                # Simulate click tracking
                click_result = affiliate_engine.track_click(
                    affiliate_link=post['affiliate_links']['primary'],
                    post_id=post['id'],
                    platform=post['platform'],
                    user_data={'test_user': True}
                )
                
                if click_result.get('success'):
                    if self.verbose:
                        logger.debug(f"🖱️ Tracked click for post {post['id']}")
                    
                    # Simulate conversion (30% conversion rate)
                    if len(successful_posts) > 0:
                        commission_amount = post['metadata']['price'] * 0.05  # 5% commission
                        
                        conversion_result = affiliate_engine.track_conversion(
                            click_id=click_result.get('click_id'),
                            deal_id=post['deal_id'],
                            conversion_amount=post['metadata']['price'],
                            commission_amount=commission_amount,
                            conversion_data={
                                'platform': post['platform'],
                                'post_id': post['id'],
                                'retailer': post['metadata']['retailer']
                            }
                        )
                        
                        if conversion_result.get('success'):
                            self.stats['conversions_tracked'] += 1
                            self.stats['revenue_generated'] += commission_amount
                            
                            if self.verbose:
                                logger.debug(f"💰 Tracked conversion: ${commission_amount:.2f} for post {post['id']}")
            
            logger.info(f"✅ Affiliate tracking test complete: {self.stats['conversions_tracked']} conversions, ${self.stats['revenue_generated']:.2f} revenue")
            return True
            
        except Exception as e:
            logger.error(f"❌ Affiliate tracking test failed: {e}")
            self.stats['errors'].append(f"Affiliate tracking error: {str(e)}")
            return False
    
    def test_monetization_integration(self, posts: List[Dict[str, Any]]) -> bool:
        """Test integration with monetization engine."""
        logger.info("💰 Testing monetization integration...")
        
        try:
            monetization_engine = MonetizationEngine()
            
            # Update performance metrics
            for post in posts:
                if post.get('status') == 'posted':
                    # Track post performance
                    performance_data = {
                        'post_id': post['id'],
                        'platform': post['platform'],
                        'content_type': 'deal_post',
                        'engagement_score': 0.75,  # Mock engagement
                        'click_through_rate': 0.05,
                        'conversion_rate': 0.03,
                        'revenue_generated': post['metadata']['price'] * 0.05 * 0.03
                    }
                    
                    monetization_engine.update_post_performance(performance_data)
            
            # Generate analytics report
            report = monetization_engine.generate_analytics_report(
                time_period='hourly',
                include_projections=True
            )
            
            logger.info(f"📊 Generated analytics report: ${report.get('total_revenue', 0):.2f} projected revenue")
            
            # Test dashboard integration
            dashboard_data = monetization_engine.get_dashboard_metrics()
            
            if dashboard_data:
                logger.info("📈 Dashboard metrics updated successfully")
                if self.verbose:
                    logger.debug(f"Dashboard data: {json.dumps(dashboard_data, indent=2, default=str)}")
            
            logger.info("✅ Monetization integration test complete")
            return True
            
        except Exception as e:
            logger.error(f"❌ Monetization integration test failed: {e}")
            self.stats['errors'].append(f"Monetization integration error: {str(e)}")
            return False
    
    def run_full_test(self, post_count: int = 5) -> Dict[str, Any]:
        """Run complete post flow test."""
        logger.info(f"🧪 Starting post flow test with {post_count} posts")
        
        # 1. Create test posts
        posts = self.create_test_posts(post_count)
        
        # 2. Test queue management
        queue_success = self.test_queue_management(posts)
        
        # 3. Test posting engine
        posting_success = self.test_posting_engine(posts)
        
        # 4. Test affiliate tracking
        tracking_success = self.test_affiliate_tracking(posts)
        
        # 5. Test monetization integration
        monetization_success = self.test_monetization_integration(posts)
        
        return self.generate_report({
            'queue_management': queue_success,
            'posting_engine': posting_success,
            'affiliate_tracking': tracking_success,
            'monetization_integration': monetization_success
        }, posts)
    
    def generate_report(self, test_results: Dict[str, bool], posts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate comprehensive test report."""
        end_time = datetime.now()
        duration = end_time - self.stats['start_time']
        
        # Calculate success rate
        all_tests_passed = all(test_results.values())
        success_rate = (self.stats['posts_successful'] / max(self.stats['posts_processed'], 1)) * 100
        
        report = {
            'test_summary': {
                'status': 'PASSED' if all_tests_passed else 'FAILED',
                'duration_seconds': duration.total_seconds(),
                'success_rate_percent': round(success_rate, 1),
                'total_errors': len(self.stats['errors'])
            },
            'component_results': test_results,
            'post_metrics': {
                'posts_created': self.stats['posts_created'],
                'posts_queued': self.stats['posts_queued'],
                'posts_processed': self.stats['posts_processed'],
                'posts_successful': self.stats['posts_successful'],
                'posts_failed': self.stats['posts_failed']
            },
            'monetization_metrics': {
                'conversions_tracked': self.stats['conversions_tracked'],
                'revenue_generated': round(self.stats['revenue_generated'], 2),
                'rate_limits_hit': self.stats['rate_limits_hit']
            },
            'platform_breakdown': {},
            'errors': self.stats['errors'],
            'recommendations': []
        }
        
        # Platform-specific breakdown
        for platform in self.platforms.keys():
            platform_posts = [p for p in posts if p['platform'] == platform]
            successful = len([p for p in platform_posts if p.get('status') == 'posted'])
            
            if platform_posts:
                report['platform_breakdown'][platform] = {
                    'total_posts': len(platform_posts),
                    'successful_posts': successful,
                    'success_rate': round((successful / len(platform_posts)) * 100, 1)
                }
        
        # Generate recommendations
        if all_tests_passed:
            report['recommendations'].append("✅ All post flow tests passed - system is operational")
        
        if success_rate >= 80:
            report['recommendations'].append("🚀 High success rate - posting engine is performing well")
        elif success_rate >= 60:
            report['recommendations'].append("⚠️ Moderate success rate - review error handling")
        else:
            report['recommendations'].append("❌ Low success rate - investigate posting failures")
        
        if self.stats['conversions_tracked'] > 0:
            report['recommendations'].append("💰 Affiliate tracking is working - revenue generation operational")
        
        if len(self.stats['errors']) == 0:
            report['recommendations'].append("🎯 No errors detected - system is stable")
        
        return report

def print_report(report: Dict[str, Any]):
    """Print formatted test report."""
    print("\n" + "="*80)
    print("📤 AUTOAFFILIATEHUB-X2 POST FLOW TEST REPORT")
    print("="*80)
    
    # Test Summary
    status_emoji = "✅" if report['test_summary']['status'] == 'PASSED' else "❌"
    print(f"\n📊 TEST STATUS: {status_emoji} {report['test_summary']['status']}")
    print(f"⏱️  Duration: {report['test_summary']['duration_seconds']:.1f} seconds")
    print(f"📈 Success Rate: {report['test_summary']['success_rate_percent']}%")
    print(f"❌ Errors: {report['test_summary']['total_errors']}")
    
    # Component Results
    print(f"\n🔧 COMPONENT TEST RESULTS:")
    for component, passed in report['component_results'].items():
        emoji = "✅" if passed else "❌"
        print(f"   {emoji} {component.replace('_', ' ').title()}: {'PASSED' if passed else 'FAILED'}")
    
    # Post Metrics
    print(f"\n📝 POST PROCESSING METRICS:")
    metrics = report['post_metrics']
    print(f"   📝 Posts created: {metrics['posts_created']}")
    print(f"   📬 Posts queued: {metrics['posts_queued']}")
    print(f"   🔄 Posts processed: {metrics['posts_processed']}")
    print(f"   ✅ Posts successful: {metrics['posts_successful']}")
    print(f"   ❌ Posts failed: {metrics['posts_failed']}")
    
    # Monetization Metrics
    print(f"\n💰 MONETIZATION METRICS:")
    monetization = report['monetization_metrics']
    print(f"   🎯 Conversions: {monetization['conversions_tracked']}")
    print(f"   💵 Revenue: ${monetization['revenue_generated']}")
    print(f"   🚦 Rate limits: {monetization['rate_limits_hit']}")
    
    # Platform Breakdown
    if report['platform_breakdown']:
        print(f"\n📱 PLATFORM BREAKDOWN:")
        for platform, data in report['platform_breakdown'].items():
            print(f"   {platform.title()}: {data['successful_posts']}/{data['total_posts']} ({data['success_rate']}%)")
    
    # Recommendations
    print(f"\n💡 RECOMMENDATIONS:")
    for rec in report['recommendations']:
        print(f"   {rec}")
    
    # Errors (if any)
    if report['errors']:
        print(f"\n❌ ERRORS ENCOUNTERED:")
        for error in report['errors'][:5]:  # Show first 5 errors
            print(f"   • {error}")
        if len(report['errors']) > 5:
            print(f"   ... and {len(report['errors']) - 5} more errors")
    
    print("\n" + "="*80)
    print("🎉 Post flow test completed!")
    print("💡 Review logs in deployment/logs/post_flow_test.log for detailed information")
    print("="*80 + "\n")

def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description='AutoAffiliateHub-X2 Post Flow Test')
    parser.add_argument('--platform', '-p', choices=['twitter', 'reddit', 'instagram'], 
                       help='Test specific platform only')
    parser.add_argument('--posts', '-n', type=int, default=5, 
                       help='Number of test posts to create')
    parser.add_argument('--verbose', '-v', action='store_true', 
                       help='Enable verbose logging')
    args = parser.parse_args()
    
    # Ensure logs directory exists
    os.makedirs('deployment/logs', exist_ok=True)
    
    try:
        # Run post flow test
        tester = PostFlowTester(
            target_platform=args.platform,
            verbose=args.verbose
        )
        report = tester.run_full_test(post_count=args.posts)
        
        # Print results
        print_report(report)
        
        # Save detailed report
        report_file = f'deployment/logs/post_flow_report_{datetime.now().strftime("%Y%m%d_%H%M%S")}.json'
        with open(report_file, 'w') as f:
            json.dump(report, f, indent=2, default=str)
        
        print(f"📄 Detailed report saved to: {report_file}")
        
        # Exit with appropriate code
        exit_code = 0 if report['test_summary']['status'] == 'PASSED' else 1
        sys.exit(exit_code)
        
    except KeyboardInterrupt:
        print("\n🛑 Test interrupted by user")
        sys.exit(130)
    except Exception as e:
        logger.error(f"❌ Unexpected error during post flow test: {e}")
        print(f"\n❌ Test failed with error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()