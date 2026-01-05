# AutoAffiliateHub-X2 Cluster Layer 🚀

**Enterprise-grade distributed cluster system with Redis Streams and SQLite fallback for horizontal scaling of AutoAffiliateHub-X2**

## 📋 Overview

The AutoAffiliateHub-X2 Cluster Layer transforms the original single-instance application into a horizontally scalable, fault-tolerant distributed system. It provides:

- **🌐 Distributed Queuing**: Redis Streams with SQLite fallback
- **👑 Leader Election**: Redis TTL-based with file lock fallback  
- **🔒 Distributed Locking**: Coordinate workers across instances
- **⚡ Auto-Scaling Workers**: Dynamic worker management based on queue depth
- **🚦 Rate Limiting**: Shared rate limits across all workers per platform
- **🏥 Health Monitoring**: Comprehensive system health checks
- **🐳 Container Support**: Docker Compose and Kubernetes deployment
- **📊 Monitoring**: Prometheus/Grafana integration

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AutoAffiliateHub-X2 Cluster                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │ Coordinator │    │   Worker 1  │    │   Worker N  │        │
│  │ (Leader)    │    │             │    │             │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│         │                   │                   │              │
│         └───────────────────┼───────────────────┘              │
│                             │                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Redis Streams / SQLite Queue              │    │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │    │
│  │  │ posting_    │ │ scraping_   │ │ analytics_  │      │    │
│  │  │ tasks       │ │ tasks       │ │ tasks       │      │    │
│  │  └─────────────┘ └─────────────┘ └─────────────┘      │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                Shared Services                          │    │
│  │  • Leader Election    • Rate Limiting                   │    │
│  │  • Distributed Locks  • Health Monitoring              │    │
│  │  • Configuration      • Logging                        │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Redis Server (optional, SQLite fallback available)
- Docker & Docker Compose (for container deployment)
- Kubernetes (for production deployment)

### 1. Local Development Setup

```bash
# Install dependencies
pip install -r requirements.txt
pip install redis pyyaml psutil

# Start Redis (optional, will fallback to SQLite)
redis-server

# Start cluster coordinator
python cluster_manager.py start --max-workers 4

# Or start with CLI for monitoring
python cluster_manager.py status
```

### 2. Docker Compose Deployment

```bash
# Start full cluster with Redis + workers
docker-compose -f docker-compose.cluster.yml up -d

# Scale workers dynamically
docker-compose -f docker-compose.cluster.yml up -d --scale worker-1=5

# View logs
docker-compose -f docker-compose.cluster.yml logs -f coordinator

# Stop cluster
docker-compose -f docker-compose.cluster.yml down
```

### 3. Kubernetes Deployment

```bash
# Build and deploy to Kubernetes
cd k8s
chmod +x deploy.sh
./deploy.sh --with-monitoring

# Access dashboard
kubectl port-forward -n affilly-cluster service/dashboard-service 8080:80
# Open http://localhost:8080

# Scale workers
kubectl scale deployment worker --replicas=10 -n affilly-cluster

# Monitor with Grafana
kubectl port-forward -n affilly-monitoring service/grafana-service 3000:3000
# Open http://localhost:3000 (admin/affilly123)
```

## 🔧 Configuration

### YAML Configuration (`config_cluster.yaml`)

```yaml
# Redis configuration
redis:
  host: "localhost"
  port: 6379
  db: 0
  password: null

# Worker auto-scaling
worker:
  min_workers: 2
  max_workers: 20
  auto_scaling_enabled: true
  scale_up_threshold: 15    # Scale up when queue > 15
  scale_down_threshold: 3   # Scale down when queue < 3

# Platform rate limits
rate_limiting:
  platform_limits:
    twitter:
      requests_per_hour: 300
    reddit:
      requests_per_hour: 600
    shopify:
      requests_per_hour: 200

# Leader election
leader:
  election_key: "affilly:leader"
  ttl_seconds: 30
  renewal_interval: 10.0
```

### Environment Variable Overrides

```bash
export REDIS_HOST=redis.cluster.local
export REDIS_PORT=6379
export CLUSTER_MAX_WORKERS=10
export LOG_LEVEL=DEBUG
```

## 📊 Core Components

### 1. Queue System
**Files**: `app/cluster/redis_queue.py`, `app/cluster/sqlite_queue.py`

- **Redis Streams**: Primary distributed queue with consumer groups
- **SQLite Fallback**: Automatic fallback when Redis unavailable
- **Consumer Groups**: Multiple workers share queue processing
- **Message Acknowledgments**: Ensure reliable processing
- **Stale Message Claiming**: Handle worker failures gracefully

```python
from app.cluster.redis_queue import create_redis_queue

# Push task to queue
queue = create_redis_queue()
message_id = queue.push('posting_tasks', {
    'platform': 'twitter',
    'content': 'Check out this deal!',
    'affiliate_links': ['https://...']
})

# Worker reads and processes
messages = queue.read('worker-1', ['posting_tasks'], count=10)
for msg in messages:
    process_posting_task(msg['data'])
    queue.acknowledge('worker-1', msg['id'])
```

### 2. Leader Election
**File**: `app/cluster/leader_election.py`

Only one scheduler instance runs across the cluster using Redis TTL-based election with file lock fallback.

```python
from app.cluster.leader_election import create_leader_election

election = create_leader_election('scheduler-node-1')

with election.leadership() as is_leader:
    if is_leader:
        # Only this instance runs the scheduler
        run_autonomous_scheduler()
```

### 3. Distributed Locking
**File**: `app/cluster/distributed_lock.py`

Coordinate access to shared resources across worker instances.

```python
from app.cluster.distributed_lock import create_distributed_lock

# Ensure only one worker processes critical section
with create_distributed_lock('monetization-update', timeout=300) as lock:
    if lock.is_acquired():
        update_monetization_analytics()
```

### 4. Rate Limiting
**File**: `app/cluster/rate_limiter.py`

Token bucket rate limiting shared across all workers per platform.

```python
from app.cluster.rate_limiter import get_rate_limiter

limiter = get_rate_limiter()

# Check Twitter rate limit before posting
result = limiter.check_platform_limit('twitter', cost=1)
if result.allowed:
    post_to_twitter()
else:
    print(f"Rate limited, retry after {result.retry_after}s")
```

### 5. Worker Management
**File**: `app/cluster/worker_manager.py`

Multi-process worker management with automatic scaling based on queue depth.

```python
from app.cluster.worker_manager import create_worker_manager

def affilly_worker_function(monitoring_context=None, **kwargs):
    # Your worker logic here
    scheduler = AutoScheduler()
    scheduler.process_cycle()

manager = create_worker_manager(affilly_worker_function, max_workers=10)
manager.start()

# Scale workers based on load
manager.scale_workers(5)
```

### 6. Health Monitoring
**File**: `app/cluster/health.py`

Comprehensive health monitoring for all cluster components.

```python
from app.cluster.health import get_health_checker

checker = get_health_checker()
health = checker.get_health(['redis', 'sqlite', 'system_resources'])

if health.status.value == 'healthy':
    print("✅ All systems operational")
else:
    print(f"⚠️ Health issues detected: {health.status.value}")
```

## 🎯 Integration with Existing AutoAffiliateHub

The cluster layer seamlessly integrates with existing components:

### AutoScheduler Integration
```python
# In worker function
from app.auto_scheduler import AutoScheduler

def cluster_worker_function(monitoring_context=None, **kwargs):
    logger = monitoring_context['logger']
    shutdown_event = monitoring_context['shutdown_event']
    
    scheduler = AutoScheduler()
    
    while not shutdown_event.is_set():
        try:
            # Process one cycle of tasks
            processed = scheduler.process_cycle()
            if processed:
                logger.info(f'Processed {processed} tasks')
                
            # Check for shutdown every 10 seconds
            if shutdown_event.wait(10.0):
                break
                
        except Exception as e:
            logger.error(f'Processing error: {e}')
```

### Monetization Engine Integration
```python
# Distributed monetization tracking
from app.cluster.distributed_lock import distributed_lock

with distributed_lock('monetization-update'):
    # Only one worker updates monetization data at a time
    monetization_engine.update_performance_metrics()
    monetization_engine.generate_analytics_report()
```

### Rate-Limited Platform Operations
```python
# Rate-limited posting across all workers
from app.cluster.rate_limiter import get_rate_limiter

limiter = get_rate_limiter()

def post_to_platform(platform, content):
    # Check rate limit before posting
    result = limiter.check_platform_limit(platform)
    
    if result.allowed:
        # Proceed with posting
        posting_engine.post_content(platform, content)
        return True
    else:
        # Queue for later or skip
        logger.warning(f'Rate limited for {platform}, retry after {result.retry_after}s')
        return False
```

## 📈 Monitoring & Observability

### Health Endpoints
- **Coordinator**: `http://localhost:8080/health`
- **Dashboard**: `http://localhost:5000/health`

### CLI Management
```bash
# Check cluster status
python cluster_manager.py status

# Monitor health
python cluster_manager.py health

# Scale workers
python cluster_manager.py scale 8

# Push test tasks
python cluster_manager.py push posting_tasks '{"test": "data"}'

# Check rate limits
python cluster_manager.py ratelimit --key twitter --limit 300 --window 3600

# Acquire leadership
python cluster_manager.py leadership

# Run tests
python cluster_manager.py test
```

### Prometheus Metrics
```
# Queue depth
affilly_queue_depth{stream="posting_tasks"} 15

# Worker count
affilly_workers_running{node="coordinator-1"} 5

# Rate limit status
affilly_rate_limit_remaining{platform="twitter"} 250

# Health status
affilly_component_health{component="redis"} 1
```

### Grafana Dashboards
- **Cluster Overview**: Worker counts, queue depths, health status
- **Performance Metrics**: CPU, memory, response times
- **Business Metrics**: Revenue tracking, posting rates, platform performance

## 🐳 Container Deployment

### Docker Compose Services
- **`redis`**: Redis server for queuing and coordination
- **`coordinator`**: Cluster coordination and leader election
- **`worker-1`, `worker-2`**: Distributed processing instances
- **`scheduler`**: Autonomous scheduling (leader-elected)
- **`dashboard`**: Web interface and monitoring
- **`redis-insight`**: Redis monitoring dashboard
- **`prometheus`**: Metrics collection (optional)
- **`grafana`**: Metrics visualization (optional)

### Kubernetes Resources
- **Namespace**: `affilly-cluster`
- **Deployments**: Redis, Coordinator, Workers, Scheduler, Dashboard
- **Services**: ClusterIP services for internal communication
- **HPA**: Horizontal Pod Autoscaler for workers
- **KEDA**: Queue-depth based autoscaling
- **Ingress**: External access to dashboard and monitoring
- **ConfigMaps**: Configuration management
- **PVCs**: Persistent storage for Redis and monitoring

## ⚡ Auto-Scaling

### Queue-Depth Based Scaling
```yaml
# KEDA ScaledObject
triggers:
- type: redis-streams
  metadata:
    address: redis-service:6379
    stream: posting_tasks
    consumerGroup: affilly_workers
    pendingEntriesCount: "5"  # Scale up when >5 pending
    streamLength: "10"        # Scale up when length >10
```

### HPA Resource-Based Scaling
```yaml
# HorizontalPodAutoscaler
metrics:
- type: Resource
  resource:
    name: cpu
    target:
      type: Utilization
      averageUtilization: 70
- type: Resource
  resource:
    name: memory
    target:
      type: Utilization
      averageUtilization: 80
```

## 🔒 Security

### Network Policies
- Pod-to-pod communication within namespace
- Egress restrictions for external services
- Ingress controls for external access

### RBAC
- Service accounts with minimal required permissions
- Role-based access for Kubernetes resources
- Secrets management for sensitive configuration

### Configuration Security
```yaml
# Secrets for sensitive data
apiVersion: v1
kind: Secret
metadata:
  name: affilly-secrets
type: Opaque
data:
  redis-password: <base64-encoded>
  api-keys: <base64-encoded>
```

## 🧪 Testing

### Comprehensive Test Suite
```bash
# Run all cluster tests
python tests/test_cluster.py

# Run specific test categories
pytest tests/test_cluster.py::TestQueueSystems -v
pytest tests/test_cluster.py::TestLeaderElection -v
pytest tests/test_cluster.py::TestWorkerManagement -v
```

### Test Categories
- **Configuration**: YAML loading, environment overrides, validation
- **Queue Systems**: Redis/SQLite operations, consumer groups, fallback
- **Leader Election**: File/Redis election, concurrent attempts, renewal
- **Distributed Locking**: SQLite/Redis locks, timeouts, context managers
- **Rate Limiting**: Token bucket algorithm, platform limits, resets
- **Health Monitoring**: Component checks, status calculation, response times
- **Worker Management**: Lifecycle, scaling, process management
- **Integration**: End-to-end workflows, coordinator operations

## 🚧 Troubleshooting

### Common Issues

#### Redis Connection Failed
```bash
# Check Redis status
redis-cli ping

# Verify configuration
python cluster_manager.py config

# Force SQLite mode
export CLUSTER_FORCE_SQLITE=true
```

#### Workers Not Starting
```bash
# Check coordinator logs
python cluster_manager.py logs -f

# Verify health status
python cluster_manager.py health

# Check resource constraints
kubectl describe pods -n affilly-cluster
```

#### Leadership Issues
```bash
# Check current leader
python cluster_manager.py leadership

# Force leadership release (if stuck)
rm logs/leader.lock  # For file-based election
```

#### Rate Limiting Problems
```bash
# Check rate limit status
python cluster_manager.py ratelimit --key twitter --limit 300 --window 3600

# Reset rate limits
# (Implementation specific - may require Redis FLUSHDB or SQLite DELETE)
```

### Debug Mode
```bash
# Enable verbose logging
export LOG_LEVEL=DEBUG

# Start coordinator with debug output
python cluster_manager.py start --verbose
```

### Performance Tuning
- **Redis**: Adjust maxmemory settings based on queue size
- **Workers**: Tune worker count based on CPU/memory resources  
- **Queue**: Adjust batch sizes and block times for throughput
- **Rate Limits**: Configure platform-specific limits based on API quotas

## 📚 API Reference

### Cluster Coordinator
```python
coordinator = create_cluster_coordinator(worker_function)
coordinator.start()                              # Start cluster
coordinator.stop()                               # Stop cluster
coordinator.get_status()                         # Get cluster status
coordinator.scale_workers(count)                 # Scale workers
coordinator.push_task(stream, data)              # Push task to queue
coordinator.check_rate_limit(key, limit, window) # Check rate limit
coordinator.with_distributed_lock(name)          # Get distributed lock
```

### Queue Operations
```python
queue = create_redis_queue()  # or create_sqlite_queue()
queue.push(stream, data)                         # Push message
queue.read(consumer, streams, count, block)      # Read messages
queue.acknowledge(consumer, message_id)          # Acknowledge message
queue.claim_stale_messages(consumer, stream)     # Claim stale messages
```

### Leader Election
```python
election = create_leader_election(node_id)
election.acquire_leadership()                    # Acquire leadership
election.release_leadership()                    # Release leadership  
election.is_leader()                            # Check if leader
election.get_current_leader()                   # Get current leader
```

### Rate Limiting
```python
limiter = get_rate_limiter()
limiter.check_rate_limit(key, limit, window, cost)    # Check limit
limiter.check_platform_limit(platform, cost)          # Platform limit
limiter.reset_rate_limit(key)                         # Reset limit
```

## 📝 License

This cluster layer is part of AutoAffiliateHub-X2 and follows the same licensing terms.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/cluster-enhancement`
3. Run tests: `python tests/test_cluster.py`
4. Submit pull request with detailed description

## 📞 Support

- **Issues**: GitHub Issues for bug reports and feature requests
- **Documentation**: This README and inline code documentation
- **Examples**: See `tests/test_cluster.py` for usage examples

---

## 🎉 Summary

The AutoAffiliateHub-X2 Cluster Layer provides:

✅ **Horizontal Scalability**: Scale from 1 to N workers based on load  
✅ **High Availability**: Redis with SQLite fallback, leader election  
✅ **Rate Limiting**: Shared limits across cluster per platform  
✅ **Auto-Scaling**: Queue-depth and resource-based worker scaling  
✅ **Health Monitoring**: Comprehensive system health checks  
✅ **Container Ready**: Docker Compose and Kubernetes deployment  
✅ **Production Ready**: Logging, monitoring, error handling  
✅ **Easy Integration**: Drop-in replacement for single-instance setup  

**Transform AutoAffiliateHub-X2 into a production-ready distributed system! 🚀**