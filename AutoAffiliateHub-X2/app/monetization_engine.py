#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Monetization Engine
AI-powered revenue optimization and performance intelligence module.

This module tracks affiliate marketing performance metrics and uses machine learning
to optimize deal prioritization and revenue generation strategies.
"""

import json
import csv
import os
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Tuple, Optional, Any
import statistics
from collections import defaultdict

# Try to import optional ML libraries
try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

try:
    from sklearn.linear_model import LinearRegression
    from sklearn.preprocessing import StandardScaler
    import numpy as np
    HAS_SKLEARN = True
except ImportError:
    HAS_SKLEARN = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class MonetizationEngine:
    """
    Core monetization optimization engine that tracks performance metrics
    and uses AI/ML to improve affiliate revenue generation.
    """
    
    def __init__(self, data_dir: str = "analytics/monetization"):
        """
        Initialize the monetization engine.
        
        Args:
            data_dir: Directory to store analytics data files
        """
        self.data_dir = data_dir
        self.data_file = os.path.join(data_dir, "data.csv")
        self.config_file = os.path.join(data_dir, "config.json")
        
        # Ensure data directory exists
        os.makedirs(data_dir, exist_ok=True)
        
        # Performance tracking storage
        self.metrics = {}  # post_id -> metrics dict
        self.platform_stats = defaultdict(lambda: {
            'total_clicks': 0,
            'total_conversions': 0, 
            'total_revenue': 0.0,
            'post_count': 0
        })
        
        # ML models (if sklearn available)
        self.performance_model = None
        self.scaler = None
        
        # Load existing data
        self.load_from_csv()
        self.load_config()
        
        logger.info("MonetizationEngine initialized successfully")
    
    def update_metrics(self, post_id: str, clicks: int = 0, conversions: int = 0, 
                      revenue: float = 0.0, engagement: Dict[str, int] = None,
                      platform: str = "unknown", deal_title: str = "",
                      post_url: str = "", timestamp: datetime = None) -> None:
        """
        Update performance metrics for a specific post/deal.
        
        Args:
            post_id: Unique identifier for the post
            clicks: Number of affiliate link clicks
            conversions: Number of successful purchases/conversions
            revenue: Revenue generated from this post
            engagement: Dict with likes, shares, comments, etc.
            platform: Source platform (amazon, walmart, target, bestbuy)
            deal_title: Human readable deal title
            post_url: URL to the original post
            timestamp: When this update occurred
        """
        if engagement is None:
            engagement = {}
        
        if timestamp is None:
            timestamp = datetime.now()
        
        # Initialize metrics if new post
        if post_id not in self.metrics:
            self.metrics[post_id] = {
                'post_id': post_id,
                'deal_title': deal_title,
                'platform': platform.lower(),
                'post_url': post_url,
                'total_clicks': 0,
                'total_conversions': 0,
                'total_revenue': 0.0,
                'total_likes': 0,
                'total_shares': 0,
                'total_comments': 0,
                'first_seen': timestamp.isoformat(),
                'last_updated': timestamp.isoformat(),
                'update_count': 0
            }
        
        # Update metrics
        metrics = self.metrics[post_id]
        metrics['total_clicks'] += clicks
        metrics['total_conversions'] += conversions
        metrics['total_revenue'] += revenue
        metrics['total_likes'] += engagement.get('likes', 0)
        metrics['total_shares'] += engagement.get('shares', 0)
        metrics['total_comments'] += engagement.get('comments', 0)
        metrics['last_updated'] = timestamp.isoformat()
        metrics['update_count'] += 1
        
        # Update platform aggregates
        platform_key = platform.lower()
        self.platform_stats[platform_key]['total_clicks'] += clicks
        self.platform_stats[platform_key]['total_conversions'] += conversions
        self.platform_stats[platform_key]['total_revenue'] += revenue
        
        if clicks > 0 or conversions > 0 or revenue > 0:
            self.platform_stats[platform_key]['post_count'] += 1
        
        logger.info(f"Updated metrics for post {post_id}: "
                   f"clicks={clicks}, conversions={conversions}, revenue=${revenue:.2f}")
        
        # Auto-save after updates
        self.save_to_csv()
    
    def calculate_performance_score(self, post_id: str) -> float:
        """
        Calculate AI-driven performance score for a post.
        
        Score formula:
        performance_score = (CTR * 0.4) + (EPC * 0.3) + (engagement * 0.2) + (freshness * 0.1)
        
        Args:
            post_id: Post to calculate score for
            
        Returns:
            Performance score between 0-100
        """
        if post_id not in self.metrics:
            return 0.0
        
        metrics = self.metrics[post_id]
        
        # Calculate CTR (Click Through Rate)
        total_impressions = max(metrics['total_clicks'] + 100, 100)  # Assume base impressions
        ctr = (metrics['total_clicks'] / total_impressions) * 100
        
        # Calculate EPC (Earnings Per Click)
        epc = 0.0
        if metrics['total_clicks'] > 0:
            epc = metrics['total_revenue'] / metrics['total_clicks']
        
        # Calculate engagement score
        total_engagement = metrics['total_likes'] + metrics['total_shares'] + metrics['total_comments']
        engagement_score = min(total_engagement / 10.0, 100)  # Cap at 100
        
        # Calculate freshness (newer posts get higher scores)
        try:
            last_updated = datetime.fromisoformat(metrics['last_updated'])
            days_old = (datetime.now() - last_updated).days
            freshness = max(100 - (days_old * 5), 0)  # 5 points per day decay
        except:
            freshness = 50  # Default freshness
        
        # Weighted performance score
        performance_score = (ctr * 0.4) + (epc * 30 * 0.3) + (engagement_score * 0.2) + (freshness * 0.1)
        
        return round(performance_score, 2)
    
    def get_top_performers(self, limit: int = 10) -> List[Dict[str, Any]]:
        """
        Get top performing posts ranked by AI performance score.
        
        Args:
            limit: Maximum number of results to return
            
        Returns:
            List of post metrics sorted by performance score
        """
        scored_posts = []
        
        for post_id, metrics in self.metrics.items():
            score = self.calculate_performance_score(post_id)
            
            # Calculate derived metrics
            ctr = 0.0
            epc = 0.0
            conversion_rate = 0.0
            
            if metrics['total_clicks'] > 0:
                # Assume 100 base impressions for CTR calculation
                total_impressions = max(metrics['total_clicks'] + 100, 100)
                ctr = (metrics['total_clicks'] / total_impressions) * 100
                epc = metrics['total_revenue'] / metrics['total_clicks']
                
            if metrics['total_clicks'] > 0:
                conversion_rate = (metrics['total_conversions'] / metrics['total_clicks']) * 100
            
            post_data = {
                'post_id': post_id,
                'deal_title': metrics.get('deal_title', 'Unknown Deal'),
                'platform': metrics.get('platform', 'unknown').title(),
                'ctr': round(ctr, 2),
                'epc': round(epc, 2),
                'conversion_rate': round(conversion_rate, 2),
                'total_clicks': metrics['total_clicks'],
                'total_conversions': metrics['total_conversions'],
                'total_revenue': round(metrics['total_revenue'], 2),
                'engagement_score': metrics['total_likes'] + metrics['total_shares'] + metrics['total_comments'],
                'performance_score': score,
                'last_updated': metrics.get('last_updated', '')
            }
            
            scored_posts.append(post_data)
        
        # Sort by performance score descending
        scored_posts.sort(key=lambda x: x['performance_score'], reverse=True)
        
        return scored_posts[:limit]
    
    def get_platform_analytics(self) -> Dict[str, Any]:
        """
        Get aggregated analytics by platform.
        
        Returns:
            Dictionary with platform performance data
        """
        analytics = {}
        
        for platform, stats in self.platform_stats.items():
            platform_name = platform.title()
            
            # Calculate platform metrics
            avg_epc = 0.0
            avg_conversion_rate = 0.0
            
            if stats['total_clicks'] > 0:
                avg_epc = stats['total_revenue'] / stats['total_clicks']
                avg_conversion_rate = (stats['total_conversions'] / stats['total_clicks']) * 100
            
            analytics[platform_name] = {
                'total_revenue': round(stats['total_revenue'], 2),
                'total_clicks': stats['total_clicks'],
                'total_conversions': stats['total_conversions'],
                'post_count': stats['post_count'],
                'avg_epc': round(avg_epc, 2),
                'avg_conversion_rate': round(avg_conversion_rate, 2)
            }
        
        return analytics
    
    def recommend_post_priority(self) -> List[str]:
        """
        AI-powered recommendation for post priority ordering.
        
        Returns:
            List of post_ids ordered by recommended priority
        """
        top_performers = self.get_top_performers(limit=50)
        
        # If we have sklearn, use ML predictions
        if HAS_SKLEARN and len(top_performers) >= 5:
            try:
                return self._ml_recommend_priority(top_performers)
            except Exception as e:
                logger.warning(f"ML recommendation failed, using rule-based: {e}")
        
        # Fallback to rule-based priority
        return [post['post_id'] for post in top_performers]
    
    def _ml_recommend_priority(self, posts: List[Dict]) -> List[str]:
        """
        Use machine learning to recommend post priorities.
        
        Args:
            posts: List of post performance data
            
        Returns:
            List of post_ids ordered by ML predicted performance
        """
        if not HAS_SKLEARN:
            return [post['post_id'] for post in posts]
        
        try:
            # Prepare feature matrix
            features = []
            post_ids = []
            
            for post in posts:
                feature_vector = [
                    post['ctr'],
                    post['epc'],
                    post['conversion_rate'],
                    post['total_clicks'],
                    post['engagement_score'],
                    len(post['deal_title']),  # Title length as feature
                ]
                
                features.append(feature_vector)
                post_ids.append(post['post_id'])
            
            if len(features) < 3:
                return post_ids
            
            features_array = np.array(features)
            targets = np.array([post['performance_score'] for post in posts])
            
            # Train simple linear regression model
            model = LinearRegression()
            scaler = StandardScaler()
            
            features_scaled = scaler.fit_transform(features_array)
            model.fit(features_scaled, targets)
            
            # Predict scores and sort
            predictions = model.predict(features_scaled)
            
            # Sort by predicted performance
            sorted_indices = np.argsort(predictions)[::-1]  # Descending order
            
            return [post_ids[i] for i in sorted_indices]
            
        except Exception as e:
            logger.error(f"ML prediction error: {e}")
            return [post['post_id'] for post in posts]
    
    def save_to_csv(self) -> None:
        """Save metrics data to CSV file for persistence."""
        try:
            with open(self.data_file, 'w', newline='', encoding='utf-8') as csvfile:
                if not self.metrics:
                    # Create empty file with headers
                    fieldnames = ['post_id', 'deal_title', 'platform', 'post_url',
                                 'total_clicks', 'total_conversions', 'total_revenue',
                                 'total_likes', 'total_shares', 'total_comments',
                                 'first_seen', 'last_updated', 'update_count']
                    writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                    writer.writeheader()
                    return
                
                # Get fieldnames from first record
                first_record = next(iter(self.metrics.values()))
                fieldnames = list(first_record.keys())
                
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                
                for metrics in self.metrics.values():
                    writer.writerow(metrics)
                    
            logger.info(f"Saved {len(self.metrics)} metrics to {self.data_file}")
            
        except Exception as e:
            logger.error(f"Failed to save CSV: {e}")
    
    def load_from_csv(self) -> None:
        """Load metrics data from CSV file."""
        if not os.path.exists(self.data_file):
            logger.info("No existing data file found, generating sample data")
            self._generate_sample_data()
            return
            
        try:
            with open(self.data_file, 'r', encoding='utf-8') as csvfile:
                reader = csv.DictReader(csvfile)
                rows_loaded = 0
                
                for row in reader:
                    post_id = row.get('post_id')
                    if not post_id:  # Skip empty rows
                        continue
                        
                    # Convert numeric fields
                    try:
                        row['total_clicks'] = int(row.get('total_clicks', 0))
                        row['total_conversions'] = int(row.get('total_conversions', 0))
                        row['total_revenue'] = float(row.get('total_revenue', 0.0))
                        row['total_likes'] = int(row.get('total_likes', 0))
                        row['total_shares'] = int(row.get('total_shares', 0))
                        row['total_comments'] = int(row.get('total_comments', 0))
                        row['update_count'] = int(row.get('update_count', 0))
                    except (ValueError, TypeError):
                        logger.warning(f"Invalid numeric data in row for {post_id}")
                        continue
                    
                    self.metrics[post_id] = row
                    rows_loaded += 1
                    
                    # Rebuild platform stats
                    platform = row.get('platform', 'unknown').lower()
                    self.platform_stats[platform]['total_clicks'] += row['total_clicks']
                    self.platform_stats[platform]['total_conversions'] += row['total_conversions']
                    self.platform_stats[platform]['total_revenue'] += row['total_revenue']
                    self.platform_stats[platform]['post_count'] += 1
                
                if rows_loaded == 0:
                    logger.info("CSV file exists but has no data, generating sample data")
                    self._generate_sample_data()
                else:
                    logger.info(f"Loaded {rows_loaded} metrics from {self.data_file}")
            
        except Exception as e:
            logger.error(f"Failed to load CSV: {e}")
            logger.info("Generating sample data due to load error")
            self._generate_sample_data()
    
    def load_config(self) -> None:
        """Load configuration settings."""
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r') as f:
                    config = json.load(f)
                    logger.info("Configuration loaded successfully")
            except Exception as e:
                logger.error(f"Failed to load config: {e}")
    
    def _generate_sample_data(self) -> None:
        """Generate sample data for demonstration purposes."""
        logger.info("Generating sample monetization data...")
        
        import random
        
        sample_deals = [
            {"title": "Apple AirPods Pro 2nd Gen - 25% Off", "platform": "amazon"},
            {"title": "Samsung 4K Smart TV 55\" - $200 Off", "platform": "walmart"},
            {"title": "Nike Air Force 1 - Limited Edition", "platform": "target"},
            {"title": "PlayStation 5 Console Bundle", "platform": "bestbuy"},
            {"title": "MacBook Air M2 - Student Discount", "platform": "amazon"},
            {"title": "Instant Pot Duo 7-in-1 - 40% Off", "platform": "walmart"},
            {"title": "Levi's Jeans - Buy 2 Get 1 Free", "platform": "target"},
            {"title": "Xbox Series X with Game Pass", "platform": "bestbuy"},
            {"title": "Dyson V15 Vacuum - Flash Sale", "platform": "amazon"},
            {"title": "KitchenAid Stand Mixer - Prime Day", "platform": "amazon"}
        ]
        
        base_time = datetime.now() - timedelta(days=30)
        
        for i, deal in enumerate(sample_deals):
            post_id = f"post_{i+1:03d}"
            
            # Generate realistic metrics
            clicks = random.randint(50, 500)
            conversions = random.randint(1, max(1, clicks // 10))
            revenue = conversions * random.uniform(5.0, 50.0)
            
            engagement = {
                'likes': random.randint(10, 100),
                'shares': random.randint(1, 20),
                'comments': random.randint(0, 15)
            }
            
            timestamp = base_time + timedelta(days=random.randint(0, 30))
            
            self.update_metrics(
                post_id=post_id,
                clicks=clicks,
                conversions=conversions,
                revenue=revenue,
                engagement=engagement,
                platform=deal['platform'],
                deal_title=deal['title'],
                post_url=f"https://example.com/posts/{post_id}",
                timestamp=timestamp
            )
        
        logger.info(f"Generated sample data for {len(sample_deals)} deals")
    
    def get_summary_stats(self) -> Dict[str, Any]:
        """
        Get overall summary statistics.
        
        Returns:
            Dictionary with key performance indicators
        """
        if not self.metrics:
            return {
                'total_posts': 0,
                'total_revenue': 0.0,
                'total_clicks': 0,
                'total_conversions': 0,
                'avg_epc': 0.0,
                'avg_conversion_rate': 0.0
            }
        
        total_revenue = sum(m['total_revenue'] for m in self.metrics.values())
        total_clicks = sum(m['total_clicks'] for m in self.metrics.values())
        total_conversions = sum(m['total_conversions'] for m in self.metrics.values())
        
        avg_epc = total_revenue / total_clicks if total_clicks > 0 else 0.0
        avg_conversion_rate = (total_conversions / total_clicks * 100) if total_clicks > 0 else 0.0
        
        return {
            'total_posts': len(self.metrics),
            'total_revenue': round(total_revenue, 2),
            'total_clicks': total_clicks,
            'total_conversions': total_conversions,
            'avg_epc': round(avg_epc, 2),
            'avg_conversion_rate': round(avg_conversion_rate, 2),
            'has_ml_support': HAS_SKLEARN,
            'has_pandas_support': HAS_PANDAS
        }


# Global monetization engine instance
monetization_engine = MonetizationEngine()


if __name__ == "__main__":
    # Demo the monetization engine
    print("AutoAffiliateHub-X2 Monetization Engine Demo")
    print("=" * 50)
    
    engine = MonetizationEngine()
    
    # Display summary stats
    stats = engine.get_summary_stats()
    print(f"\nSummary Statistics:")
    print(f"Total Posts: {stats['total_posts']}")
    print(f"Total Revenue: ${stats['total_revenue']}")
    print(f"Total Clicks: {stats['total_clicks']}")
    print(f"Average EPC: ${stats['avg_epc']}")
    print(f"Average Conversion Rate: {stats['avg_conversion_rate']:.2f}%")
    
    # Show top performers
    print(f"\nTop 5 Performing Deals:")
    top_performers = engine.get_top_performers(5)
    
    for i, post in enumerate(top_performers, 1):
        print(f"{i}. {post['deal_title'][:40]}...")
        print(f"   Platform: {post['platform']} | Score: {post['performance_score']}")
        print(f"   Revenue: ${post['total_revenue']} | CTR: {post['ctr']:.2f}% | EPC: ${post['epc']:.2f}")
        print()
    
    # Platform analytics
    print(f"\nPlatform Performance:")
    platform_analytics = engine.get_platform_analytics()
    
    for platform, data in platform_analytics.items():
        print(f"{platform}: ${data['total_revenue']} revenue, {data['post_count']} posts")
    
    print(f"\nML Support: {'Yes' if HAS_SKLEARN else 'No'}")
    print(f"Pandas Support: {'Yes' if HAS_PANDAS else 'No'}")