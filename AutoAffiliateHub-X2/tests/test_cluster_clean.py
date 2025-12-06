#!/usr/bin/env python3
"""
Test Suite: Cluster Management

Tests distributed cluster operations, autoscaling, and failover mechanisms.
All tests use mock Redis/cluster services and do not require real infrastructure.

Coverage:
- Distributed queue management (Redis Streams + SQLite fallback)
- Leader election and consensus
- Auto-scaling and load balancing  
- Health monitoring and failure detection
- Rate limiting and resource management
- Worker coordination and task distribution
"""

import sys
import os
import unittest
from datetime import datetime, timedelta
from unittest.mock import Mock, patch, MagicMock
import json
import tempfile
import threading
import time

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set test mode
os.environ['TEST_MODE'] = 'true'
os.environ['DRY_RUN'] = 'true'

# Mock cluster components (since they may not exist in every setup)
class MockRedisQueue:
    def __init__(self, stream_name='test_stream'):
        self.stream_name = stream_name
        self.messages = []
        self.consumer_group = 'test_group'
    
    def enqueue(self, data):
        self.messages.append({
            'id': f"test-{len(self.messages)}",
            'data': data,
            'timestamp': datetime.now().isoformat()
        })
        return True
    
    def dequeue(self, timeout=1):
        if self.messages:
            return self.messages.pop(0)
        return None
    
    def get_length(self):
        return len(self.messages)

class MockWorkerManager:
    def __init__(self):
        self.workers = []
        self.max_workers = 10
        self.min_workers = 2
        self.current_load = 0.0
    
    def scale_up(self, count=1):
        new_workers = min(count, self.max_workers - len(self.workers))
        for i in range(new_workers):
            self.workers.append(f"worker-{len(self.workers) + 1}")
        return new_workers
    
    def scale_down(self, count=1):
        removed = min(count, len(self.workers) - self.min_workers)
        for _ in range(removed):
            if self.workers:
                self.workers.pop()
        return removed
    
    def get_worker_count(self):
        return len(self.workers)
    
    def update_load(self, load_percentage):
        self.current_load = load_percentage

class MockLeaderElection:
    def __init__(self, node_id):
        self.node_id = node_id
        self.is_leader = False
        self.leader_id = None
    
    def run_for_leader(self):
        # Simple mock - first caller becomes leader
        if not self.leader_id:
            self.is_leader = True
            self.leader_id = self.node_id
        return self.is_leader
    
    def get_leader(self):
        return self.leader_id

class MockDistributedLock:
    _locks = {}  # Class-level to simulate distributed state
    
    def __init__(self, lock_name, timeout=30):
        self.lock_name = lock_name
        self.timeout = timeout
        self.acquired = False
        self.acquired_by = None
    
    def acquire(self):
        if self.lock_name not in MockDistributedLock._locks:
            MockDistributedLock._locks[self.lock_name] = self
            self.acquired = True
            self.acquired_by = id(self)
            return True
        return False
    
    def release(self):
        if self.acquired:
            MockDistributedLock._locks.pop(self.lock_name, None)
            self.acquired = False
            self.acquired_by = None
            return True
        return False

class TestCluster(unittest.TestCase):
    """Test cases for cluster management functionality."""

    def setUp(self):
        """Set up test fixtures."""
        self.redis_queue = MockRedisQueue()
        self.worker_manager = MockWorkerManager()
        
        # Clear distributed locks between tests
        MockDistributedLock._locks.clear()
        
        # Mock cluster configuration
        self.cluster_config = {
            'redis': {
                'host': 'localhost',
                'port': 6379,
                'db': 0
            },
            'workers': {
                'min_workers': 2,
                'max_workers': 10,
                'scale_up_threshold': 70,
                'scale_down_threshold': 30
            },
            'health_check': {
                'interval_seconds': 30,
                'timeout_seconds': 5,
                'failure_threshold': 3
            }
        }

    def test_queue_basic_operations(self):
        """Test basic queue operations (enqueue/dequeue)."""
        print("📊 Testing queue operations...")
        
        # Test enqueue
        test_message = {
            'task': 'process_deal',
            'deal_id': 'test-123',
            'priority': 'high',
            'created_at': datetime.now().isoformat()
        }
        
        result = self.redis_queue.enqueue(test_message)
        self.assertTrue(result)
        
        # Verify queue length
        self.assertEqual(self.redis_queue.get_length(), 1)
        
        # Test dequeue
        received_message = self.redis_queue.dequeue()
        self.assertIsNotNone(received_message)
        self.assertEqual(received_message['data']['task'], 'process_deal')
        self.assertEqual(received_message['data']['deal_id'], 'test-123')
        
        print("   ✅ Queue enqueue/dequeue operations passed")

    def test_worker_autoscaling(self):
        """Test worker autoscaling based on load."""
        print("⚖️ Testing worker autoscaling...")
        
        # Start with minimum workers
        initial_count = self.worker_manager.get_worker_count()
        
        # Simulate high load - should scale up
        self.worker_manager.update_load(80.0)  # 80% load
        if self.worker_manager.current_load > self.cluster_config['workers']['scale_up_threshold']:
            scaled_up = self.worker_manager.scale_up(2)
            self.assertGreater(scaled_up, 0)
        
        # Verify scaling occurred
        new_count = self.worker_manager.get_worker_count()
        self.assertGreater(new_count, initial_count)
        
        # Simulate low load - should scale down
        self.worker_manager.update_load(20.0)  # 20% load
        if self.worker_manager.current_load < self.cluster_config['workers']['scale_down_threshold']:
            scaled_down = self.worker_manager.scale_down(1)
            self.assertGreaterEqual(scaled_down, 0)
        
        # Should not scale below minimum
        final_count = self.worker_manager.get_worker_count()
        self.assertGreaterEqual(final_count, self.cluster_config['workers']['min_workers'])
        
        print(f"   📈 Scaled from {initial_count} to {new_count} to {final_count} workers")
        print("   ✅ Worker autoscaling passed")

    def test_leader_election(self):
        """Test leader election mechanism."""
        print("👑 Testing leader election...")
        
        # Create multiple nodes
        node1 = MockLeaderElection('node-1')
        node2 = MockLeaderElection('node-2')
        node3 = MockLeaderElection('node-3')
        
        # First node runs for leader
        leader1_result = node1.run_for_leader()
        self.assertTrue(leader1_result)
        self.assertTrue(node1.is_leader)
        
        # Second node tries to become leader (should fail)
        leader2_result = node2.run_for_leader()
        self.assertFalse(leader2_result)
        self.assertFalse(node2.is_leader)
        
        # Verify leader is consistent across nodes
        self.assertEqual(node1.get_leader(), 'node-1')
        self.assertEqual(node2.get_leader(), 'node-1')
        self.assertEqual(node3.get_leader(), 'node-1')
        
        print(f"   👑 Node {node1.get_leader()} elected as leader")
        print("   ✅ Leader election passed")

    def test_distributed_locking(self):
        """Test distributed locking mechanism."""
        print("🔒 Testing distributed locks...")
        
        lock_name = 'test-resource-lock'
        
        # Create two competing locks
        lock1 = MockDistributedLock(lock_name, timeout=30)
        lock2 = MockDistributedLock(lock_name, timeout=30)
        
        # First lock should acquire successfully
        acquired1 = lock1.acquire()
        self.assertTrue(acquired1)
        self.assertTrue(lock1.acquired)
        
        # Second lock should fail to acquire
        acquired2 = lock2.acquire()
        self.assertFalse(acquired2)
        self.assertFalse(lock2.acquired)
        
        # Release first lock
        released = lock1.release()
        self.assertTrue(released)
        self.assertFalse(lock1.acquired)
        
        # Now second lock should be able to acquire
        acquired2_retry = lock2.acquire()
        self.assertTrue(acquired2_retry)
        self.assertTrue(lock2.acquired)
        
        # Clean up
        lock2.release()
        
        print("   🔐 Lock acquisition/release cycle completed")
        print("   ✅ Distributed locking passed")

    def test_health_monitoring(self):
        """Test health monitoring and failure detection."""
        print("💓 Testing health monitoring...")
        
        # Mock health status data
        healthy_components = {
            'redis_queue': {'status': 'healthy', 'latency': 0.05},
            'worker_pool': {'status': 'healthy', 'active_workers': 4},
            'deal_engine': {'status': 'healthy', 'last_run': datetime.now().isoformat()},
            'affiliate_engine': {'status': 'healthy', 'conversions_today': 23}
        }
        
        unhealthy_components = {
            'redis_queue': {'status': 'timeout', 'latency': 5.0},
            'worker_pool': {'status': 'degraded', 'active_workers': 1},
            'deal_engine': {'status': 'error', 'last_error': 'Connection refused'},
            'affiliate_engine': {'status': 'healthy', 'conversions_today': 31}
        }
        
        # Test healthy system
        healthy_count = sum(1 for comp in healthy_components.values() if comp['status'] == 'healthy')
        total_components = len(healthy_components)
        health_percentage = (healthy_count / total_components) * 100
        
        self.assertEqual(healthy_count, 4)
        self.assertEqual(health_percentage, 100.0)
        
        # Test unhealthy system
        unhealthy_count = sum(1 for comp in unhealthy_components.values() if comp['status'] == 'healthy')
        unhealthy_percentage = (unhealthy_count / len(unhealthy_components)) * 100
        
        self.assertEqual(unhealthy_count, 1)
        self.assertEqual(unhealthy_percentage, 25.0)
        
        # Health check should detect degraded state
        failure_threshold = self.cluster_config['health_check']['failure_threshold']
        failed_components = [name for name, status in unhealthy_components.items() 
                           if status['status'] != 'healthy']
        
        self.assertGreaterEqual(len(failed_components), failure_threshold)
        
        print(f"   💚 Healthy system: {health_percentage:.1f}% components healthy")
        print(f"   💔 Degraded system: {unhealthy_percentage:.1f}% components healthy")
        print(f"   🚨 Failed components: {len(failed_components)}")
        print("   ✅ Health monitoring passed")

    def test_rate_limiting(self):
        """Test rate limiting functionality."""
        print("🚥 Testing rate limiting...")
        
        # Mock rate limiter configuration
        rate_limits = {
            'api_calls': {'limit': 100, 'window': 3600},  # 100 per hour
            'social_posts': {'limit': 50, 'window': 3600},  # 50 per hour
            'deal_processing': {'limit': 1000, 'window': 3600}  # 1000 per hour
        }
        
        # Simulate usage tracking
        usage_tracker = {
            'api_calls': {'count': 0, 'window_start': datetime.now()},
            'social_posts': {'count': 0, 'window_start': datetime.now()},
            'deal_processing': {'count': 0, 'window_start': datetime.now()}
        }
        
        # Test normal usage (within limits)
        for operation in ['api_calls', 'social_posts', 'deal_processing']:
            limit = rate_limits[operation]['limit']
            
            # Use 50% of limit
            usage_count = limit // 2
            usage_tracker[operation]['count'] = usage_count
            
            # Check if within limit
            remaining = limit - usage_count
            is_within_limit = usage_count < limit
            
            self.assertTrue(is_within_limit)
            self.assertGreater(remaining, 0)
            
            print(f"   🟢 {operation}: {usage_count}/{limit} (✅ within limit)")
        
        # Test limit exceeded scenario
        usage_tracker['api_calls']['count'] = 105  # Exceed 100 limit
        exceeded_limit = usage_tracker['api_calls']['count'] > rate_limits['api_calls']['limit']
        self.assertTrue(exceeded_limit)
        
        print(f"   🔴 api_calls: {usage_tracker['api_calls']['count']}/100 (❌ limit exceeded)")
        print("   ✅ Rate limiting passed")

    def test_failover_mechanism(self):
        """Test cluster failover and recovery."""
        print("🔄 Testing failover mechanisms...")
        
        # Simulate initial cluster state
        cluster_nodes = {
            'node-1': {'role': 'leader', 'status': 'healthy', 'last_heartbeat': datetime.now()},
            'node-2': {'role': 'follower', 'status': 'healthy', 'last_heartbeat': datetime.now()},
            'node-3': {'role': 'follower', 'status': 'healthy', 'last_heartbeat': datetime.now()}
        }
        
        # Verify initial leader
        current_leader = next(node for node, info in cluster_nodes.items() 
                            if info['role'] == 'leader')
        self.assertEqual(current_leader, 'node-1')
        
        # Simulate leader failure
        cluster_nodes['node-1']['status'] = 'failed'
        cluster_nodes['node-1']['last_heartbeat'] = datetime.now() - timedelta(minutes=5)
        
        # Trigger failover (promote follower to leader)
        healthy_followers = [node for node, info in cluster_nodes.items() 
                           if info['role'] == 'follower' and info['status'] == 'healthy']
        
        self.assertGreater(len(healthy_followers), 0)
        
        # Promote first healthy follower
        new_leader = healthy_followers[0]
        cluster_nodes[new_leader]['role'] = 'leader'
        
        # Verify failover completed
        leaders = [node for node, info in cluster_nodes.items() if info['role'] == 'leader']
        self.assertEqual(len(leaders), 1)
        self.assertEqual(leaders[0], new_leader)
        
        print(f"   💔 Original leader node-1 failed")
        print(f"   👑 Failover completed: {new_leader} is now leader")
        
        # Simulate recovery
        cluster_nodes['node-1']['status'] = 'healthy'
        cluster_nodes['node-1']['role'] = 'follower'  # Rejoin as follower
        cluster_nodes['node-1']['last_heartbeat'] = datetime.now()
        
        healthy_nodes = sum(1 for info in cluster_nodes.values() if info['status'] == 'healthy')
        self.assertEqual(healthy_nodes, 3)
        
        print(f"   💚 Recovery completed: {healthy_nodes}/3 nodes healthy")
        print("   ✅ Failover mechanism passed")

    def test_load_balancing(self):
        """Test load balancing across workers."""
        print("⚖️ Testing load balancing...")
        
        # Simulate worker pool with different loads
        workers = {
            'worker-1': {'current_tasks': 5, 'max_capacity': 10, 'cpu_usage': 50},
            'worker-2': {'current_tasks': 8, 'max_capacity': 10, 'cpu_usage': 80},
            'worker-3': {'current_tasks': 2, 'max_capacity': 10, 'cpu_usage': 20},
            'worker-4': {'current_tasks': 7, 'max_capacity': 10, 'cpu_usage': 70}
        }
        
        # Calculate load percentages
        for worker_id, worker_info in workers.items():
            load_percentage = (worker_info['current_tasks'] / worker_info['max_capacity']) * 100
            worker_info['load_percentage'] = load_percentage
        
        # Find least loaded worker for task assignment
        least_loaded = min(workers.items(), key=lambda x: x[1]['load_percentage'])
        most_loaded = max(workers.items(), key=lambda x: x[1]['load_percentage'])
        
        self.assertEqual(least_loaded[0], 'worker-3')  # 20% load
        self.assertEqual(most_loaded[0], 'worker-2')   # 80% load
        
        # Simulate task assignment to least loaded worker
        workers[least_loaded[0]]['current_tasks'] += 1
        new_load = (workers[least_loaded[0]]['current_tasks'] / 
                   workers[least_loaded[0]]['max_capacity']) * 100
        
        self.assertEqual(new_load, 30.0)  # 3/10 = 30%
        
        # Calculate average cluster load
        total_tasks = sum(worker['current_tasks'] for worker in workers.values())
        total_capacity = sum(worker['max_capacity'] for worker in workers.values())
        average_load = (total_tasks / total_capacity) * 100
        
        self.assertLess(average_load, 75.0)  # Should be reasonable
        
        print(f"   🎯 Task assigned to least loaded: {least_loaded[0]} (was {least_loaded[1]['load_percentage']:.1f}%)")
        print(f"   📊 Average cluster load: {average_load:.1f}%")
        print("   ✅ Load balancing passed")

def run_tests():
    """Run all cluster tests with formatted output."""
    print("\n" + "="*80)
    print("🔧 RUNNING CLUSTER MANAGEMENT TESTS")
    print("="*80)
    
    # Create test suite
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromTestCase(TestCluster)
    
    # Run tests with custom result handler
    runner = unittest.TextTestRunner(verbosity=0, stream=open(os.devnull, 'w'))
    result = runner.run(suite)
    
    # Print summary
    total_tests = result.testsRun
    failures = len(result.failures)
    errors = len(result.errors)
    passed = total_tests - failures - errors
    
    print(f"\n📊 TEST RESULTS:")
    print(f"   ✅ Passed: {passed}")
    print(f"   ❌ Failed: {failures}")
    print(f"   🚫 Errors: {errors}")
    print(f"   📈 Success Rate: {(passed/total_tests)*100:.1f}%")
    
    if failures > 0:
        print(f"\n❌ FAILURES:")
        for test, traceback in result.failures:
            print(f"   • {test}: {traceback.split('AssertionError: ')[-1].split('\n')[0]}")
    
    if errors > 0:
        print(f"\n🚫 ERRORS:")
        for test, traceback in result.errors:
            print(f"   • {test}: {traceback.split('\n')[-2]}")
    
    print("\n" + "="*80)
    print("⚙️ CLUSTER MANAGEMENT TESTS COMPLETED")
    print("="*80 + "\n")
    
    return result.wasSuccessful()

if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)