# Deployment Guide - StockSpot v2.0

## 🚀 Deployment Options

### 1. Render.com (Recommended for Beginners)

**Easiest deployment option with automatic GitHub integration.**

#### Step 1: Push to GitHub
```bash
git add .
git commit -m "StockSpot v2.0 - Ready for deployment"
git push origin main
```

#### Step 2: Connect to Render
1. Go to [render.com](https://render.com)
2. Sign in with GitHub
3. Click "New +" → "Web Service"
4. Connect your StockSpot repository
5. Configure:
   - **Name:** `stockspot`
   - **Environment:** `Node`
   - **Region:** Choose nearest region
   - **Branch:** `main`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

#### Step 3: Add Environment Variables
In Render dashboard:
```
NODE_ENV=production
PORT=3000
DRY_RUN=false
AMAZON_ASSOCIATE_ID=your-associate-id
AMAZON_API_KEY=your-amazon-api-key
EMAIL_ENABLED=false
JWT_SECRET=your-production-secret-here
```

#### Step 4: Deploy
- Click "Deploy"
- Wait for build to complete (~2 minutes)
- App runs at `https://stockspot-[id].onrender.com`

---

### 2. Docker + Render Container

**For more control over the environment.**

#### Step 1: Build Docker Image
```bash
docker build -f Dockerfile.production -t stockspot:v2 .
```

#### Step 2: Test Locally
```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e DRY_RUN=false \
  stockspot:v2
```

#### Step 3: Push to Docker Hub
```bash
docker login
docker tag stockspot:v2 your-username/stockspot:v2
docker push your-username/stockspot:v2
```

#### Step 4: Deploy on Render
1. Create new "Web Service"
2. Connect Docker Hub
3. Set same environment variables as above

---

### 3. Heroku Deployment

**Classic hosting with free tier option.**

#### Step 1: Install Heroku CLI
```bash
npm install -g heroku
heroku login
```

#### Step 2: Create App
```bash
heroku create stockspot
```

#### Step 3: Set Environment Variables
```bash
heroku config:set NODE_ENV=production
heroku config:set DRY_RUN=false
heroku config:set AMAZON_ASSOCIATE_ID=your-id
heroku config:set JWT_SECRET=your-secret
```

#### Step 4: Deploy
```bash
git push heroku main
```

---

### 4. AWS (EC2 + Load Balancer)

**For production scale with high traffic.**

#### Step 1: Launch EC2 Instance
- Ubuntu 22.04 LTS
- t3.small or larger
- Open ports 80, 443, 3000

#### Step 2: Setup Server
```bash
ssh -i your-key.pem ubuntu@your-instance

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install app
git clone <repo>
cd StockSpot
npm install
```

#### Step 3: Run with PM2
```bash
npm install -g pm2
pm2 start backend/server-dry-run.js --name stockspot
pm2 save
pm2 startup
```

#### Step 4: Setup Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name stockspot.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
}
```

---

### 5. DigitalOcean App Platform

**Simple, affordable, and reliable.**

#### Step 1: Connect GitHub
1. Go to DigitalOcean
2. Apps → Create App
3. Connect GitHub repository

#### Step 2: Configure
```yaml
name: stockspot
services:
  - name: api
    github:
      repo: your-user/StockSpot
      branch: main
    build_command: npm install
    run_command: npm start
    envs:
      - key: NODE_ENV
        value: "production"
      - key: PORT
        value: "3000"
```

#### Step 3: Add Domain
- Connect your domain
- Enable HTTPS
- Deploy

---

## 🔐 Production Checklist

Before deploying to production:

- [ ] Change `JWT_SECRET` to strong random value
- [ ] Set `NODE_ENV=production`
- [ ] Add real `AMAZON_ASSOCIATE_ID`
- [ ] Configure email service (SendGrid, AWS SES, etc.)
- [ ] Enable HTTPS/SSL
- [ ] Setup database (MongoDB Atlas recommended)
- [ ] Configure database backups
- [ ] Enable request logging
- [ ] Setup monitoring & alerts
- [ ] Add rate limiting
- [ ] Configure CORS whitelist
- [ ] Test all API endpoints
- [ ] Load test the application
- [ ] Setup CI/CD pipeline
- [ ] Document deployment process

---

## 📊 Environment Variables for Production

```env
# Core
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-domain.com
DRY_RUN=false
DRY_RUN_MOCK_DATA=false

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/stockspot
DATABASE_TYPE=mongodb

# Amazon Affiliate
AMAZON_ASSOCIATE_ID=your-real-associate-id
AMAZON_API_KEY=your-real-api-key
AMAZON_PARTNER_TAG=your-partner-tag

# Email
EMAIL_ENABLED=true
EMAIL_SERVICE=sendgrid
EMAIL_API_KEY=your-sendgrid-api-key
EMAIL_FROM=noreply@your-domain.com

# Security
JWT_SECRET=your-production-secret-key-here
JWT_EXPIRY=7d
BCRYPT_ROUNDS=12

# Monitoring
LOG_LEVEL=info
DEBUG=false
MONITOR_INTERVAL_MINUTES=5

# Retailers
WALMART_MONITORING_ENABLED=true
TARGET_MONITORING_ENABLED=true
BESTBUY_MONITORING_ENABLED=true
GAMESTOP_MONITORING_ENABLED=true

# Feed
FEED_MAX_ITEMS=500
FEED_RETENTION_DAYS=30
AFFILIATE_LINK_AUTO_CONVERT=true
```

---

## 🔍 Monitoring & Logs

### Render.com
- View logs in dashboard
- Setup email alerts for crashes
- Monitor performance metrics

### Docker
```bash
# View logs
docker logs <container-id> -f

# Check stats
docker stats <container-id>
```

### PM2 (Self-hosted)
```bash
# View logs
pm2 logs stockspot

# Monitor
pm2 monit

# Restart
pm2 restart stockspot
```

---

## 🆘 Troubleshooting Deployment

### App crashes on startup
```bash
# Check logs for errors
pm2 logs stockspot

# Verify dependencies installed
npm install

# Check Node version
node --version  # Should be 18+
```

### Port already in use
```bash
# Find process
lsof -i :3000

# Kill process
kill -9 <PID>
```

### Database connection error
```bash
# Test connection
node -e "require('mongodb').connect('<URI>', (err) => console.log(err || 'Connected'))"

# Verify credentials and whitelist IP
```

### High memory usage
```bash
# Check for memory leaks
pm2 start backend/server-dry-run.js --max-memory-restart 1G

# Monitor
pm2 describe stockspot
```

---

## 📈 Scaling Tips

### Horizontal Scaling
1. Use load balancer (AWS ELB, Nginx)
2. Run multiple instances
3. Use Redis for shared session storage

### Vertical Scaling
1. Increase server resources
2. Enable clustering in Node.js
3. Optimize database queries

### Performance Optimization
- Enable gzip compression
- Add caching headers
- Use CDN for static assets
- Implement database indexing
- Monitor query performance

---

## 🔄 Continuous Deployment

### GitHub Actions Example
```yaml
name: Deploy to Render

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Run tests
        run: npm test
      - name: Deploy
        run: |
          curl -X POST ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## 📞 Support

- **Documentation:** See `README-V2.md`
- **Local Testing:** `npm run dry-run`
- **Scripts:** See `scripts/README.md`
- **Issues:** Check GitHub issues

---

## ✅ Deployment Checklist

- [ ] Local tests pass (`npm run test`)
- [ ] Dry-run works (`npm run dry-run`)
- [ ] Environment variables configured
- [ ] Database (if needed) setup
- [ ] Domain/SSL configured
- [ ] Monitoring setup
- [ ] Backup strategy in place
- [ ] Documentation updated
- [ ] Team notified
- [ ] Rollback plan ready

---

**Happy deploying!** 🚀

