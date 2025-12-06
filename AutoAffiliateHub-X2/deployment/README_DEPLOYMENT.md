# AutoAffiliateHub-X2 Deployment Guide 🚀

**Complete deployment instructions for local, phone, and cloud environments**

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local PC Deployment](#local-pc-deployment)
3. [Phone/LAN Access Setup](#phoneLan-access-setup)
4. [Cloud Deployment](#cloud-deployment)
5. [Security Configuration](#security-configuration)
6. [Monitoring & Health Checks](#monitoring--health-checks)
7. [Troubleshooting](#troubleshooting)

## Prerequisites

### Required Software
- **Python 3.11+** with pip
- **Node.js 18+** with npm (if using frontend components)
- **Git** for version control
- **Redis** (optional, SQLite fallback available)
- **Docker & Docker Compose** (for containerized deployment)

### Required Python Packages
```bash
pip install -r requirements.txt
pip install redis pyyaml psutil flask aiohttp prometheus-client
```

### Environment Setup
```bash
# Clone and navigate to project
git clone <repository-url>
cd AutoAffiliateHub-X2

# Create virtual environment (recommended)
python -m venv .venv
# Windows
.venv\Scripts\activate
# Linux/Mac
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

## 🖥️ Local PC Deployment

### Step 1: Quick Start (Test Mode)
```bash
# Navigate to project directory
cd AutoAffiliateHub-X2

# Run pilot script for immediate testing
python deployment/pilot_scripts/dry_run_local.py

# Start dashboard (accessible at http://127.0.0.1:5000)
python app/dashboard.py
```

### Step 2: Full Local Setup

#### 1. Configure Environment
```bash
# Copy example configuration
cp config.example.yaml config.yaml
cp .env.example .env

# Edit configuration files with your settings
# Note: Default configuration works in test mode
```

#### 2. Start Redis (Optional)
```bash
# Install Redis
# Windows: Download from https://github.com/microsoftarchive/redis/releases
# Linux: sudo apt-get install redis-server
# Mac: brew install redis

# Start Redis server
redis-server

# Verify Redis is running
redis-cli ping
# Should return: PONG
```

#### 3. Initialize Database
```bash
# Create database tables
python -c "from app.dashboard import init_db; init_db()"
```

#### 4. Start Core Services

**Option A: Simple Single Process**
```bash
# Start scheduler + dashboard in one process
python app/auto_scheduler_simple.py
```

**Option B: Cluster Mode (Recommended)**
```bash
# Terminal 1: Start cluster coordinator
python cluster_manager.py start --max-workers 2

# Terminal 2: Start dashboard
python app/dashboard.py

# Terminal 3: Monitor cluster status
python cluster_manager.py status
```

#### 5. Verify Installation
```bash
# Run comprehensive test
python deployment/pilot_scripts/test_post_flow.py

# Check health endpoints
curl http://127.0.0.1:5000/health
```

### Access Points
- **Dashboard**: http://127.0.0.1:5000
- **Health Check**: http://127.0.0.1:5000/health
- **Metrics**: http://127.0.0.1:5000/metrics
- **API**: http://127.0.0.1:5000/api/*

## 📱 Phone/LAN Access Setup

### Step 1: Configure Network Binding
```bash
# Edit config.yaml or set environment variable
export FLASK_HOST=0.0.0.0
export FLASK_PORT=5000

# Or modify app/dashboard.py
# app.run(host='0.0.0.0', port=5000, debug=False)
```

### Step 2: Firewall Configuration

**Windows Firewall**
```powershell
# Allow inbound connections on port 5000
netsh advfirewall firewall add rule name="AutoAffiliateHub" dir=in action=allow protocol=TCP localport=5000
```

**Linux/Mac Firewall**
```bash
# Ubuntu/Debian
sudo ufw allow 5000

# CentOS/RHEL
sudo firewall-cmd --permanent --add-port=5000/tcp
sudo firewall-cmd --reload
```

### Step 3: Find Your Local IP
```bash
# Windows
ipconfig | findstr IPv4

# Linux/Mac
ip addr show | grep inet
# or
ifconfig | grep inet
```

### Step 4: Access from Phone
- Connect phone to same WiFi network
- Open browser to `http://YOUR_LOCAL_IP:5000`
- Example: `http://192.168.1.100:5000`

### Step 5: Temporary Public Access (Using Ngrok)

```bash
# Install Ngrok
# Download from https://ngrok.com/download

# Start local server first
python app/dashboard.py

# In another terminal, expose to internet
ngrok http 5000

# Ngrok will provide public URL like:
# https://abc123.ngrok.io -> http://localhost:5000
```

**Security Warning**: Only use ngrok for temporary testing. Never expose production systems.

## ☁️ Cloud Deployment

### Render.com Deployment

#### Step 1: Prepare Repository
```bash
# Ensure all files are committed
git add .
git commit -m "Prepare for Render deployment"
git push origin main
```

#### Step 2: Create render.yaml
```yaml
# render.yaml (create in project root)
services:
  - type: web
    name: affilly-dashboard
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: python app/dashboard.py
    envVars:
      - key: FLASK_HOST
        value: 0.0.0.0
      - key: FLASK_PORT
        value: 10000
      - key: TEST_MODE
        value: true
      - key: CLUSTER_FORCE_SQLITE
        value: true

  - type: worker
    name: affilly-scheduler
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: python app/auto_scheduler_simple.py
    envVars:
      - key: TEST_MODE
        value: true

  - type: redis
    name: affilly-redis
    plan: starter
    maxmemoryPolicy: allkeys-lru
```

#### Step 3: Deploy to Render
1. Connect GitHub repository to Render
2. Create new Web Service from repository
3. Configure environment variables in Render dashboard
4. Deploy and monitor logs

### Railway.app Deployment

#### Step 1: Install Railway CLI
```bash
npm install -g @railway/cli
railway login
```

#### Step 2: Initialize Project
```bash
railway init
railway add
```

#### Step 3: Configure Environment
```bash
# Set environment variables
railway variables set TEST_MODE=true
railway variables set CLUSTER_FORCE_SQLITE=true
railway variables set FLASK_HOST=0.0.0.0
```

#### Step 4: Deploy
```bash
railway up
railway open
```

### Docker Compose Deployment

#### Step 1: Build and Start Services
```bash
# Development mode
docker-compose up -d

# Production mode with monitoring
docker-compose -f docker-compose.cluster.yml up -d

# Scale workers
docker-compose -f docker-compose.cluster.yml up -d --scale worker-1=3
```

#### Step 2: Access Services
- **Dashboard**: http://localhost:8080
- **Redis Insight**: http://localhost:8001
- **Prometheus**: http://localhost:9090 (if enabled)
- **Grafana**: http://localhost:3000 (if enabled)

### Kubernetes Deployment

#### Step 1: Deploy Cluster
```bash
# Navigate to k8s directory
cd k8s

# Deploy with monitoring
chmod +x deploy.sh
./deploy.sh --with-monitoring

# Or manual deployment
kubectl apply -f cluster-deployment.yaml
kubectl apply -f monitoring.yaml
```

#### Step 2: Access Services
```bash
# Port forward dashboard
kubectl port-forward -n affilly-cluster service/dashboard-service 8080:80

# Port forward Grafana
kubectl port-forward -n affilly-monitoring service/grafana-service 3000:3000

# Get external IP (if LoadBalancer)
kubectl get services -n affilly-cluster
```

## 🔒 Security Configuration

### Environment Variables
```bash
# Create .env file (never commit to git)
cat > .env << EOF
# Dashboard Security
DASHBOARD_SECRET_KEY=your-secret-key-here-change-this
DASHBOARD_PASSWORD=your-admin-password

# API Keys (set to test values initially)
TWITTER_API_KEY=test-key
TWITTER_API_SECRET=test-secret
REDDIT_CLIENT_ID=test-client-id
REDDIT_CLIENT_SECRET=test-secret
SHOPIFY_API_KEY=test-key

# Database
DATABASE_URL=sqlite:///affilly.db

# Redis (optional)
REDIS_URL=redis://localhost:6379/0

# Monitoring
ENABLE_METRICS=true
METRICS_AUTH=false
EOF
```

### HTTPS Configuration (Production)
```bash
# Generate self-signed certificate (development only)
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# For production, use Let's Encrypt or cloud provider certificates
```

### Security Checklist
```bash
# Run security validation
python deployment/pilot_scripts/security_check.py

# Check for sensitive data in logs
grep -r "password\|secret\|key" logs/ || echo "No secrets found in logs"
```

## 📊 Monitoring & Health Checks

### Health Check Endpoints
```bash
# Basic health check
curl http://localhost:5000/health

# Detailed system status
curl http://localhost:5000/health/detailed

# Cluster status
python cluster_manager.py health
```

### Log Monitoring
```bash
# Start log monitoring
python deployment/monitoring/monitor_metrics.py

# Rotate logs (Linux/Mac)
chmod +x deployment/logs/log_rotation.sh
./deployment/logs/log_rotation.sh

# View real-time logs
tail -f deployment/logs/affilly.log
```

### Metrics Collection
```bash
# Start metrics collector
python deployment/monitoring/metrics_collector.py

# Export metrics to Prometheus format
curl http://localhost:5000/metrics
```

## 🐛 Troubleshooting

### Common Issues

#### "Module not found" Error
```bash
# Ensure PYTHONPATH is set
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# Or install in development mode
pip install -e .
```

#### Port Already in Use
```bash
# Find process using port 5000
# Windows
netstat -ano | findstr :5000

# Linux/Mac
lsof -i :5000

# Kill process and restart
```

#### Redis Connection Failed
```bash
# Check Redis status
redis-cli ping

# If Redis unavailable, force SQLite mode
export CLUSTER_FORCE_SQLITE=true
```

#### Permission Denied (Linux/Mac)
```bash
# Make scripts executable
chmod +x deployment/logs/log_rotation.sh
chmod +x k8s/deploy.sh

# Fix file permissions
sudo chown -R $USER:$USER .
```

### Debug Mode
```bash
# Enable verbose logging
export LOG_LEVEL=DEBUG

# Run with debug output
python app/dashboard.py --debug

# Test with verbose cluster output
python cluster_manager.py start --verbose
```

### Performance Issues
```bash
# Check system resources
python deployment/monitoring/health_check.py

# Monitor queue depths
python deployment/pilot_scripts/monitor_metrics.py

# Scale workers if needed
python cluster_manager.py scale 5
```

## 📞 Support & Next Steps

### Validation Checklist
- [ ] Local deployment successful
- [ ] Dashboard accessible at http://localhost:5000
- [ ] Health checks passing
- [ ] Test mode running without errors
- [ ] Logs rotating properly
- [ ] Security configuration complete

### Production Readiness
1. Replace all test credentials with real API keys
2. Enable HTTPS with valid certificates
3. Set up proper database (PostgreSQL recommended)
4. Configure monitoring alerts
5. Set up automated backups
6. Document incident response procedures

### Scaling Considerations
- **CPU**: Monitor worker CPU usage, scale workers accordingly
- **Memory**: Watch Redis memory usage, configure maxmemory policy
- **Network**: Monitor API rate limits, implement proper backoff
- **Storage**: Set up log rotation, database maintenance

### Monitoring Endpoints Summary
- **Health**: `/health` - Basic system status
- **Metrics**: `/metrics` - Prometheus-format metrics  
- **Status**: `/api/status` - Detailed component status
- **Queue**: `/api/queue/status` - Queue depths and worker counts

---

**🎉 Your AutoAffiliateHub-X2 deployment is now ready!**

Access your dashboard at the configured URL and begin configuring your affiliate marketing automation system.

For production deployment, refer to the security checklist and replace test credentials with real API keys.