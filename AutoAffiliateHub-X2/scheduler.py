#!/usr/bin/env python3
"""
StockSpot Autonomous Scheduler
Handles periodic tasks and maintenance for autonomous operation
"""

import os
import sys
import time
import signal
import logging
from datetime import datetime, timedelta
from typing import Dict, List

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Safe imports
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    logger.warning("python-dotenv not available")

try:
    from queue_manager import job_queue, add_metrics_update_job
    QUEUE_AVAILABLE = True
except ImportError as e:
    logger.error(f"Queue manager not available: {e}")
    QUEUE_AVAILABLE = False

class StockSpotScheduler:
    """Autonomous scheduler for StockSpot maintenance tasks"""
    
    def __init__(self):
        self.running = True
        self.last_cleanup = datetime.now()
        self.last_metrics_update = datetime.now()
        self.last_health_check = datetime.now()
        self.start_time = datetime.now()
        
        # Register signal handlers
        signal.signal(signal.SIGTERM, self._signal_handler)
        signal.signal(signal.SIGINT, self._signal_handler)
        
        logger.info("🕒 StockSpot Scheduler starting up...")
        logger.info(f"Queue available: {QUEUE_AVAILABLE}")
    
    def _signal_handler(self, signum, frame):
        """Handle shutdown signals gracefully"""
        logger.info(f"Received signal {signum}, shutting down scheduler...")
        self.running = False
    
    def cleanup_old_jobs(self):
        """Clean up old completed/failed jobs"""
        try:
            if not QUEUE_AVAILABLE:
                return
            
            logger.info("Running job queue cleanup...")
            job_queue.cleanup_old_jobs(days=7)
            self.last_cleanup = datetime.now()
            logger.info("✅ Job cleanup completed")
            
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
    
    def update_metrics(self):
        """Schedule metrics update"""
        try:
            if not QUEUE_AVAILABLE:
                return
            
            logger.info("Scheduling metrics update...")
            add_metrics_update_job(delay=0)
            self.last_metrics_update = datetime.now()
            logger.info("✅ Metrics update scheduled")
            
        except Exception as e:
            logger.error(f"Error scheduling metrics update: {e}")
    
    def health_check(self):
        """Perform system health check"""
        try:
            logger.info("Performing health check...")
            
            if QUEUE_AVAILABLE:
                stats = job_queue.get_stats()
                logger.info(f"Queue stats: {stats}")
                
                # Alert if too many failed jobs
                if stats.get('failed', 0) > 10:
                    logger.warning(f"High number of failed jobs: {stats['failed']}")
                
                # Alert if queue is backing up
                if stats.get('pending', 0) > 50:
                    logger.warning(f"Queue backing up: {stats['pending']} pending jobs")
            
            self.last_health_check = datetime.now()
            logger.info("✅ Health check completed")
            
        except Exception as e:
            logger.error(f"Error during health check: {e}")
    
    def should_run_cleanup(self) -> bool:
        """Check if cleanup should run (every 6 hours)"""
        return datetime.now() - self.last_cleanup > timedelta(hours=6)
    
    def should_update_metrics(self) -> bool:
        """Check if metrics should update (every 30 minutes)"""
        return datetime.now() - self.last_metrics_update > timedelta(minutes=30)
    
    def should_health_check(self) -> bool:
        """Check if health check should run (every 15 minutes)"""
        return datetime.now() - self.last_health_check > timedelta(minutes=15)
    
    def run_scheduled_tasks(self):
        """Run tasks that are due"""
        tasks_run = 0
        
        if self.should_run_cleanup():
            self.cleanup_old_jobs()
            tasks_run += 1
        
        if self.should_update_metrics():
            self.update_metrics()
            tasks_run += 1
        
        if self.should_health_check():
            self.health_check()
            tasks_run += 1
        
        return tasks_run
    
    def run(self):
        """Main scheduler loop"""
        logger.info("✅ Scheduler is running and monitoring system...")
        
        # Run initial health check
        self.health_check()
        
        while self.running:
            try:
                # Run scheduled tasks
                tasks_run = self.run_scheduled_tasks()
                
                if tasks_run > 0:
                    logger.info(f"Executed {tasks_run} scheduled tasks")
                
                # Wait 60 seconds before next check
                time.sleep(60)
                
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                time.sleep(60)  # Wait before retrying
        
        logger.info("🛑 Scheduler shutting down...")
        
        # Final stats
        uptime = datetime.now() - self.start_time
        logger.info(f"Scheduler uptime: {uptime}")

def run_once():
    """Run scheduler tasks once (for cron execution)"""
    logger.info("🕒 Running StockSpot scheduled tasks (one-time execution)...")
    
    if not QUEUE_AVAILABLE:
        logger.error("❌ Queue not available - cannot run scheduled tasks")
        return
    
    scheduler = StockSpotScheduler()
    
    try:
        # Force run all tasks
        scheduler.cleanup_old_jobs()
        scheduler.update_metrics() 
        scheduler.health_check()
        
        logger.info("✅ All scheduled tasks completed")
        
    except Exception as e:
        logger.error(f"Error running scheduled tasks: {e}")
        sys.exit(1)

def main():
    """Main entry point"""
    # Check if this is a one-time cron execution
    if os.getenv('SCHEDULER_MODE') == 'cron':
        run_once()
        return
    
    if not QUEUE_AVAILABLE:
        logger.error("❌ Job queue not available - cannot start scheduler")
        sys.exit(1)
    
    # Initialize scheduler for continuous operation
    scheduler = StockSpotScheduler()
    
    try:
        # Start scheduling
        scheduler.run()
    except KeyboardInterrupt:
        logger.info("Scheduler interrupted by user")
    except Exception as e:
        logger.error(f"Scheduler crashed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()