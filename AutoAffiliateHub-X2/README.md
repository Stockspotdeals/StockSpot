# StockSpot 🔥

**StockSpot** is a streamlined affiliate marketing automation system that monitors Amazon deals and shares them automatically on Twitter/X. Built for simplicity and effectiveness.

## ✨ What StockSpot Does

StockSpot automates the entire deal-sharing workflow:

1. **🔍 Deal Discovery** - Monitors Amazon for trending deals and price drops
2. **🔗 Link Processing** - Adds your Amazon Associates ID to product links  
3. **📱 Smart Posting** - Formats and shares deals on Twitter/X with optimal timing
4. **📊 Analytics** - Tracks performance and earnings

## 🚀 Quick Start

### Prerequisites
- Python 3.8+
- Amazon Associates Account 
- Twitter/X Developer Account

### Installation

1. **Clone & Setup**
   ```bash
   git clone https://github.com/yourusername/StockSpot.git
   cd StockSpot
   pip install -r requirements.txt
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials (see setup guide below)
   ```

3. **Run StockSpot**
   ```bash
   python app/dashboard.py
   ```

4. **Access Dashboard**
   Open http://localhost:5000 and login with your dashboard password

## ⚙️ Configuration

### Required API Credentials

#### Amazon Associates API
- **Associate ID**: Your Amazon Associates tracking ID
- **Access Key & Secret**: From Amazon Associates API
- **Setup Guide**: [Amazon Associates API Documentation](https://webservices.amazon.com/paapi5/documentation/)

#### Twitter/X API  
- **API Key & Secret**: From Twitter Developer Portal
- **Access Token & Secret**: OAuth 1.0a credentials
- **Bearer Token**: For Twitter API v2 access
- **Setup Guide**: [Twitter Developer Documentation](https://developer.twitter.com/en/docs/twitter-api)

### Environment Variables
```bash
# Amazon Associates
AMAZON_ASSOCIATE_ID=your-associate-id
AMAZON_ACCESS_KEY=your-access-key
AMAZON_SECRET_KEY=your-secret-key

# Twitter/X API
TWITTER_API_KEY=your-api-key
TWITTER_API_SECRET=your-api-secret
TWITTER_BEARER_TOKEN=your-bearer-token
TWITTER_ACCESS_TOKEN=your-access-token
TWITTER_ACCESS_SECRET=your-access-secret

# Dashboard Access
OWNER_DASHBOARD_PASSWORD=your-secure-password
```

## 📊 Features

### Core Functionality
- **Amazon Deal Detection** - Smart monitoring of price drops and trending products
- **Automated Link Processing** - Adds affiliate tracking to all Amazon URLs
- **Twitter Integration** - Posts formatted deals with optimal hashtags and timing
- **Queue Management** - Schedule posts and manage posting flow
- **Analytics Dashboard** - Track clicks, conversions, and earnings

### Dashboard Pages
- **Overview** - System status, recent performance, revenue tracking
- **Queue** - Manage scheduled posts and posting queue
- **History** - View posting history and performance metrics  
- **Settings** - Update credentials and system configuration
- **Analytics** - Detailed performance analysis and export

## 🛠 Technical Architecture

### Core Components
- **Deal Engine** (`deal_engine.py`) - Product discovery and deal detection
- **Affiliate Engine** (`affiliate_link_engine.py`) - Amazon Associates link processing
- **Posting Engine** (`posting_engine.py`) - Twitter/X posting automation
- **Dashboard** (`dashboard.py`) - Web interface and management

### Data Flow
```
Amazon Products → Deal Detection → Link Processing → Queue → Twitter Posting → Analytics
```

## 📈 Performance Optimization

### Best Practices
- **Posting Schedule** - Optimal timing for maximum engagement
- **Content Quality** - Smart formatting with relevant hashtags
- **Rate Limiting** - Respects Twitter API limits
- **Deal Quality** - Filters for high-value, trending products

### Monitoring
- Real-time system health checks
- Performance metrics and analytics
- Error tracking and notifications
- Revenue and conversion tracking

## 🔒 Security & Compliance

- Secure credential management via environment variables
- Twitter API rate limiting and best practices
- Amazon Associates Terms of Service compliance
- Dashboard password protection

## 📝 API Reference

### Dashboard Routes
- `GET /` - Overview dashboard
- `GET /queue` - Queue management
- `GET /history` - Posting history  
- `GET /settings` - Configuration
- `GET /analytics` - Performance analytics
- `POST /queue/add` - Add deal to queue
- `POST /queue/process` - Process queue

### Key Classes
- `AffiliateLinkEngine` - Amazon Associates link processing
- `PostingEngine` - Twitter/X automation
- `DealEngine` - Product discovery
- `CaptionEngine` - Content generation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if needed
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

- **Documentation**: Check `.env.example` for detailed setup instructions
- **Issues**: Use GitHub Issues for bug reports
- **Questions**: Open a Discussion for general questions

---

**StockSpot** - Simple, effective Amazon affiliate marketing automation. 🎯