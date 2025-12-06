#!/usr/bin/env python3
"""
StockSpot Job Queue System
Simple, autonomous queue for background processing
"""

import json
import time
import uuid
import logging
from datetime import datetime, timedelta
from threading import Lock
from typing import Dict, List, Optional, Any

logger = logging.getLogger(__name__)

class JobQueue:
    """Simple file-based job queue for autonomous operation"""
    
    def __init__(self, queue_file: str = 'job_queue.json'):
        self.queue_file = queue_file
        self.lock = Lock()
        self._load_queue()
    
    def _load_queue(self):
        """Load queue from file"""
        try:
            with open(self.queue_file, 'r') as f:
                self.jobs = json.load(f)
        except FileNotFoundError:
            self.jobs = []
        except Exception as e:
            logger.error(f"Error loading queue: {e}")
            self.jobs = []
    
    def _save_queue(self):
        """Save queue to file"""
        try:
            with open(self.queue_file, 'w') as f:
                json.dump(self.jobs, f, indent=2, default=str)
        except Exception as e:
            logger.error(f"Error saving queue: {e}")
    
    def add_job(self, job_type: str, data: Dict[str, Any], priority: int = 0, delay_seconds: int = 0) -> str:
        """Add a new job to the queue"""
        with self.lock:
            job_id = str(uuid.uuid4())
            
            execute_at = datetime.now()
            if delay_seconds > 0:
                execute_at += timedelta(seconds=delay_seconds)
            
            job = {
                'id': job_id,
                'type': job_type,
                'data': data,
                'priority': priority,
                'status': 'pending',
                'created_at': datetime.now().isoformat(),
                'execute_at': execute_at.isoformat(),
                'attempts': 0,
                'max_attempts': 3,
                'last_error': None,
                'completed_at': None
            }
            
            self.jobs.append(job)
            self._save_queue()
            logger.info(f"Added job {job_id} of type {job_type}")
            return job_id
    
    def get_next_job(self) -> Optional[Dict[str, Any]]:
        """Get the next job to process"""
        with self.lock:
            now = datetime.now()
            
            # Filter pending jobs that are ready to execute
            ready_jobs = [
                job for job in self.jobs 
                if job['status'] == 'pending' 
                and datetime.fromisoformat(job['execute_at']) <= now
                and job['attempts'] < job['max_attempts']
            ]
            
            if not ready_jobs:
                return None
            
            # Sort by priority (higher first), then by created_at
            ready_jobs.sort(key=lambda x: (-x['priority'], x['created_at']))
            
            job = ready_jobs[0]
            job['status'] = 'processing'
            job['started_at'] = now.isoformat()
            self._save_queue()
            
            return job
    
    def complete_job(self, job_id: str, result: Dict[str, Any] = None):
        """Mark a job as completed"""
        with self.lock:
            for job in self.jobs:
                if job['id'] == job_id:
                    job['status'] = 'completed'
                    job['completed_at'] = datetime.now().isoformat()
                    if result:
                        job['result'] = result
                    self._save_queue()
                    logger.info(f"Job {job_id} completed successfully")
                    break
    
    def fail_job(self, job_id: str, error: str):
        """Mark a job as failed or retry"""
        with self.lock:
            for job in self.jobs:
                if job['id'] == job_id:
                    job['attempts'] += 1
                    job['last_error'] = error
                    job['last_attempt'] = datetime.now().isoformat()
                    
                    if job['attempts'] >= job['max_attempts']:
                        job['status'] = 'failed'
                        logger.error(f"Job {job_id} failed permanently: {error}")
                    else:
                        # Retry with exponential backoff
                        retry_delay = min(300, 30 * (2 ** (job['attempts'] - 1)))  # Max 5 minutes
                        job['status'] = 'pending'
                        job['execute_at'] = (datetime.now() + timedelta(seconds=retry_delay)).isoformat()
                        logger.warning(f"Job {job_id} failed, retrying in {retry_delay}s: {error}")
                    
                    self._save_queue()
                    break
    
    def get_stats(self) -> Dict[str, int]:
        """Get queue statistics"""
        with self.lock:
            stats = {
                'total': len(self.jobs),
                'pending': len([j for j in self.jobs if j['status'] == 'pending']),
                'processing': len([j for j in self.jobs if j['status'] == 'processing']),
                'completed': len([j for j in self.jobs if j['status'] == 'completed']),
                'failed': len([j for j in self.jobs if j['status'] == 'failed'])
            }
            return stats
    
    def cleanup_old_jobs(self, days: int = 7):
        """Remove old completed/failed jobs"""
        with self.lock:
            cutoff = datetime.now() - timedelta(days=days)
            original_count = len(self.jobs)
            
            self.jobs = [
                job for job in self.jobs
                if job['status'] in ['pending', 'processing'] or
                datetime.fromisoformat(job.get('completed_at', job.get('created_at', '1970-01-01'))) > cutoff
            ]
            
            removed = original_count - len(self.jobs)
            if removed > 0:
                self._save_queue()
                logger.info(f"Cleaned up {removed} old jobs")

# Global queue instance
job_queue = JobQueue()

def add_twitter_post_job(item_name: str, product_url: str, affiliate_url: str, delay: int = 0) -> str:
    """Add a Twitter posting job"""
    return job_queue.add_job(
        job_type='twitter_post',
        data={
            'item_name': item_name,
            'product_url': product_url,
            'affiliate_url': affiliate_url
        },
        priority=1,
        delay_seconds=delay
    )

def add_amazon_link_job(product_url: str, delay: int = 0) -> str:
    """Add an Amazon link generation job"""
    return job_queue.add_job(
        job_type='amazon_link',
        data={
            'product_url': product_url
        },
        priority=2,
        delay_seconds=delay
    )

def add_metrics_update_job(delay: int = 0) -> str:
    """Add a metrics update job"""
    return job_queue.add_job(
        job_type='metrics_update',
        data={},
        priority=0,
        delay_seconds=delay
    )

if __name__ == "__main__":
    # Test the queue
    print("Testing StockSpot Job Queue...")
    
    # Add test jobs
    job1 = add_twitter_post_job("Test Product", "https://amazon.com/dp/test", "https://amazon.com/dp/test?tag=test")
    job2 = add_amazon_link_job("https://amazon.com/dp/test2")
    job3 = add_metrics_update_job(delay=60)
    
    print(f"Added jobs: {job1}, {job2}, {job3}")
    print(f"Queue stats: {job_queue.get_stats()}")
    
    # Process a job
    next_job = job_queue.get_next_job()
    if next_job:
        print(f"Next job: {next_job}")
        job_queue.complete_job(next_job['id'], {'status': 'success'})
    
    print(f"Final stats: {job_queue.get_stats()}")
    print("Job queue test complete!")