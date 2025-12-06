# 🚀 StockSpot Autonomous Cloud Deployment Guide

## 🎯 Overview

Deploy StockSpot as a **fully autonomous** system that runs independently in the cloud with no dependency on your local machine. The system includes:

- **Web UI**: Dashboard and item management interface
- **Background Worker**: Autonomous job processing for Twitter/X posting
- **Scheduler**: Maintenance tasks and queue management
- **Job Queue**: Persistent task management with retry logic

## 📋 Prerequisites

1. **Cloud Platform Account**: Render, Railway, or similar
2. **Twitter/X Developer Account**: API keys for posting
3. **Amazon Associates Account**: Associate ID and optional PA API keys

## 🔧 Environment Variables

Set these environment variables in your deployment platform:

### Required Variables
```bash
# Flask Configuration
FLASK_ENV=production
FLASK_SECRET_KEY=your-super-secret-key-change-this-in-production
PORT=5000

# Twitter/X Integration (Get from https://developer.twitter.com/)
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret
TWITTER_ACCESS_TOKEN=your_twitter_access_token
TWITTER_ACCESS_SECRET=your_twitter_access_secret
TWITTER_BEARER_TOKEN=your_twitter_bearer_token

# Amazon Associates (Get from Amazon Associates Program)
AMAZON_ASSOCIATE_ID=your-associate-id

# Optional: Amazon Product Advertising API (for enhanced features)
AMAZON_ACCESS_KEY=your_pa_api_access_key
AMAZON_SECRET_KEY=your_pa_api_secret_key
```

### Optional Variables
```bash
# Scheduler Configuration
SCHEDULER_MODE=continuous  # or 'cron' for cron job execution

# Host Configuration
HOST=0.0.0.0

# Worker Configuration (advanced)
WORKER_POLL_INTERVAL=10
QUEUE_CLEANUP_DAYS=7
```

## 🏗️ Platform-Specific Deployment

### 1. Render Deployment

**Step 1**: Create a new Web Service
- Repository: Connect your StockSpot repository
- Build Command: `pip install -r requirements.txt`
- Start Command: `python api.py`

**Step 2**: Create Background Worker
- Service Type: Background Worker
- Build Command: `pip install -r requirements.txt`
- Start Command: `python worker.py`

**Step 3**: Create Cron Job (Optional)
- Service Type: Cron Job
- Schedule: `0 */6 * * *` (every 6 hours)
- Build Command: `pip install -r requirements.txt`
- Start Command: `SCHEDULER_MODE=cron python scheduler.py`

**Step 4**: Set Environment Variables
- Go to Environment tab in each service
- Add all required environment variables listed above

### 2. Railway Deployment

**Step 1**: Deploy from GitHub
```bash
# Connect repository
railway login
railway link
railway up
```

**Step 2**: Configure Services
Railway will automatically detect the `railway.toml` file and create:
- Web service (API)
- Worker service (background jobs)
- Scheduler service (maintenance)

**Step 3**: Set Environment Variables
```bash
# Set environment variables
railway variables set FLASK_ENV=production
railway variables set TWITTER_API_KEY=your_key
railway variables set AMAZON_ASSOCIATE_ID=your_id
# ... add all other variables
```

### 3. Heroku Deployment (Alternative)

**Step 1**: Create Heroku App
```bash
heroku create stockspot-app
```

**Step 2**: Add Worker and Scheduler
The `Procfile` defines three processes:
- `web`: Flask web interface
- `worker`: Background job processor  
- `scheduler`: Maintenance tasks

**Step 3**: Configure Environment
```bash
heroku config:set FLASK_ENV=production
heroku config:set TWITTER_API_KEY=your_key
heroku config:set AMAZON_ASSOCIATE_ID=your_id
# ... add all variables
```

**Step 4**: Deploy
```bash
git push heroku main
heroku ps:scale web=1 worker=1 scheduler=1
```

## 🧪 Testing Your Deployment

### 1. Health Check
Visit your deployed URL + `/health` to check system status:
```json
{
  "status": "healthy",
  "services": {
    "twitter": "available",
    "amazon": "available",
    "queue": "available"
  },
  "queue_stats": {
    "total": 5,
    "pending": 2,
    "completed": 3
  }
}
```

### 2. Dashboard Test
Visit your main URL to access the StockSpot dashboard:
- Should show metrics and status indicators
- All integrations should show "Online"
- Queue statistics should be visible

### 3. Add Item Test
1. Click "Add New Item"
2. Enter a product name and Amazon URL
3. Submit the form
4. Item should be queued for processing
5. Check back in a few minutes to see Twitter status update

### 4. API Test
Test the API endpoints:
```bash
# Health check
curl https://your-app-url.com/health

# Queue stats
curl https://your-app-url.com/queue/stats

# Basic status
curl https://your-app-url.com/status
```

## 🔄 How Autonomous Operation Works

### 1. User Interaction
- User adds items via web interface
- Items are queued for processing
- User receives immediate feedback

### 2. Background Processing
- **Worker** continuously polls for new jobs
- **Amazon links** are generated with affiliate IDs
- **Tweets** are posted to Twitter/X automatically
- **Retry logic** handles temporary failures
- **Results** are saved and displayed in dashboard

### 3. Maintenance Tasks
- **Scheduler** runs periodic cleanup
- **Old jobs** are automatically removed
- **System health** is monitored
- **Queue statistics** are updated

### 4. Error Handling
- **Automatic retries** with exponential backoff
- **Failed jobs** are marked and logged
- **System continues** operating despite individual failures
- **Health checks** ensure services are running

## 📊 Monitoring & Maintenance

### Logs and Monitoring
- Check application logs in your platform dashboard
- Monitor `/health` endpoint for system status
- Watch queue statistics for performance

### Common Issues and Solutions

**Issue**: Twitter posts not being sent
```bash
# Check Twitter credentials
curl https://your-app-url.com/twitter/status

# Check worker logs for errors
# Verify Twitter API keys are correctly set
```

**Issue**: Amazon links not generating
```bash
# Check Amazon integration
curl https://your-app-url.com/amazon/test

# Verify AMAZON_ASSOCIATE_ID is set
# Check if amazon_links.py is working
```

**Issue**: Jobs stuck in queue
```bash
# Check worker status in platform logs
# Restart worker service if needed
# Check queue stats: /queue/stats
```

### Scaling Considerations

**Light Usage** (< 100 posts/day):
- 1 Web instance
- 1 Worker instance
- Cron scheduler (every 6 hours)

**Medium Usage** (100-1000 posts/day):
- 1 Web instance
- 2 Worker instances
- Continuous scheduler

**Heavy Usage** (1000+ posts/day):
- 2 Web instances (load balanced)
- 3+ Worker instances
- Continuous scheduler + cron backup

## 🎉 Success Validation

Your StockSpot system is **fully autonomous** when:

✅ **Dashboard accessible** and showing metrics  
✅ **Items can be added** via web form  
✅ **Background worker** processing jobs automatically  
✅ **Twitter posts** being sent without manual intervention  
✅ **Amazon links** generating affiliate URLs correctly  
✅ **Scheduler** running maintenance tasks  
✅ **System self-healing** with retry logic  
✅ **No local computer** needed for operation  

## 🔒 Security Checklist

- [ ] All API keys stored as environment variables
- [ ] FLASK_SECRET_KEY is unique and complex
- [ ] FLASK_ENV set to 'production'
- [ ] No sensitive data in code or logs
- [ ] Platform security settings enabled
- [ ] Regular monitoring of access logs

## 🆘 Support Resources

### Platform Documentation
- **Render**: https://render.com/docs
- **Railway**: https://docs.railway.app
- **Heroku**: https://devcenter.heroku.com

### API Documentation
- **Twitter API**: https://developer.twitter.com/en/docs
- **Amazon PA API**: https://webservices.amazon.com/paapi5/documentation

### Troubleshooting
1. Check platform logs for error messages
2. Verify all environment variables are set
3. Test individual components with health endpoints
4. Check queue stats for job processing issues
5. Monitor system performance metrics

---

## 🎯 Deployment Completed!

Your **StockSpot system is now fully autonomous** and running in the cloud. The system will:

- Accept new items through the web interface
- Generate Amazon affiliate links automatically  
- Post to Twitter/X in the background
- Handle errors and retry failures
- Clean up old data automatically
- Operate 24/7 without your involvement

**Dashboard URL**: https://your-app-url.com  
**Health Check**: https://your-app-url.com/health  
**API Status**: https://your-app-url.com/status  

**🎉 Enjoy your autonomous affiliate posting system!**