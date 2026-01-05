# StockSpot Autonomous Deal Bot

🤖 **An autonomous deal-hunting bot that monitors Amazon for collectibles and gaming products, automatically posting the best deals to your Telegram channel with affiliate links.**

## What It Does

- 🔍 **Autonomous Monitoring**: Continuously monitors product pages for price drops and restocks
- 🎯 **Smart Categories**: Automatically detects Pokemon TCG, One Piece TCG, Sports Cards, Gaming, and Electronics
- 💰 **Affiliate Integration**: Automatically generates Amazon affiliate links for monetization
- 📱 **Telegram Notifications**: Posts deal alerts with rich formatting and emojis
- 🚀 **Zero Maintenance**: Runs completely autonomous - no user management, no dashboard, no complexity

## Features

### 🎯 Category Detection
- **Pokemon TCG**: Booster boxes, ETBs, singles, promos, tournament products
- **One Piece TCG**: Booster boxes, starter decks, promos, tournament supplies
- **Sports Cards**: Baseball, football, basketball, soccer cards and boxes
- **Gaming**: Video games, gaming accessories, collectibles
- **Electronics**: Gaming hardware, phones, accessories

### 📱 Smart Notifications
- **Rich Formatting**: Product titles, prices, savings calculations
- **Visual Appeal**: Category-specific emojis and formatting
- **Call-to-Action**: Direct links to products with affiliate tracking
- **Deal Intelligence**: Only notifies for significant deals (>$5 or >10% savings)

### 💰 Monetization
- **Amazon Affiliate Links**: Automatic affiliate link generation
- **Revenue Tracking**: Built-in tracking of clicks and conversions
- **Multiple Retailers**: Extensible to other affiliate programs

## Quick Start

### 1. Prerequisites
- Node.js 14+
- MongoDB (local or Atlas)
- Telegram Bot Token
- Amazon Associate Account

### 2. Configuration
```bash
# Copy the configuration template
cp .env.autonomous .env

# Edit with your credentials
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id  
AMAZON_ASSOCIATE_ID=your_associate_id
MONGODB_URI=mongodb://localhost:27017/stockspot
```

### 3. Installation & Launch
```bash
# Install dependencies
npm install

# Start the autonomous bot
node start_autonomous.js
```

That's it! The bot will:
- ✅ Start monitoring immediately
- ✅ Send a startup notification to Telegram
- ✅ Check for deals every 5 minutes
- ✅ Send daily summaries at 9 AM

## API Endpoints

### Core Operations
- `GET /health` - System health check
- `GET /api/stats` - Current statistics
- `POST /api/monitoring/start` - Start monitoring
- `POST /api/monitoring/stop` - Stop monitoring
- `POST /api/monitoring/check` - Force check cycle

### Product Management
- `GET /api/products` - List monitored products
- `POST /api/products` - Add product to monitor
- `PUT /api/products/:id` - Update product settings
- `DELETE /api/products/:id` - Remove product

### Utilities
- `GET /api/retailers` - Supported retailers
- `GET /api/categories` - Supported categories
- `POST /api/analyze` - Analyze URL for category/retailer

## Environment Variables

### Required
```env
TELEGRAM_BOT_TOKEN=     # Your Telegram bot token
TELEGRAM_CHAT_ID=       # Target channel/chat ID
AMAZON_ASSOCIATE_ID=    # Your Amazon Associate tag
MONGODB_URI=            # MongoDB connection string
```

### Optional
```env
PORT=3000                    # Server port
CHECK_INTERVAL_MINUTES=5     # Monitoring frequency
DAILY_SUMMARY_HOUR=9         # Daily summary time
MAX_ERROR_COUNT=10           # Error threshold before deactivation
BATCH_SIZE=5                 # Products per batch
REQUEST_DELAY_MIN=1000       # Min delay between requests
REQUEST_DELAY_MAX=3000       # Max delay between requests
```

## Telegram Setup

### 1. Create Bot
1. Message @BotFather on Telegram
2. Send `/newbot`
3. Choose name and username
4. Save the token

### 2. Get Chat ID
For channel posting:
```bash
# Add bot to channel as admin
# Send a message to the channel
# Visit: https://api.telegram.org/bot<TOKEN>/getUpdates
# Look for "chat":{"id":-100xxxxxxxxx}
```

### 3. Test Connection
```bash
curl "https://api.telegram.org/bot<TOKEN>/sendMessage?chat_id=<CHAT_ID>&text=Test"
```

## Amazon Associates Setup

1. **Apply**: Visit [Amazon Associates](https://affiliate-program.amazon.com/)
2. **Get Approved**: Usually requires existing website/content
3. **Get Tag**: Your tracking ID (e.g., `yoursite-20`)
4. **Configure**: Add to `AMAZON_ASSOCIATE_ID` environment variable

## Architecture

### 🏗️ Autonomous Design
- **No User Management**: No signup, login, or user accounts
- **No Dashboard**: Operates via API and Telegram notifications  
- **No Authentication**: Simple API without complex auth layers
- **Single Purpose**: Focus solely on deal detection and notification

### 🔧 Core Components
- **ProductMonitor**: Scrapes and monitors product pages
- **CategoryDetector**: AI-powered category classification  
- **AffiliateEngine**: Generates affiliate links
- **TelegramNotifier**: Rich notification formatting
- **AutonomousWorker**: Orchestrates monitoring cycles

### 📊 Data Flow
1. **Discovery**: Add products via API or URL analysis
2. **Monitoring**: Regular scraping cycles (every 5 minutes)
3. **Detection**: Price drop/restock detection
4. **Classification**: Automatic category detection
5. **Monetization**: Affiliate link generation
6. **Notification**: Telegram posting with rich formatting

## Scaling & Performance

### 🚀 Built for Scale
- **Batch Processing**: Handles 100s of products efficiently
- **Rate Limiting**: Respectful scraping with delays
- **Error Handling**: Automatic retry with exponential backoff
- **Resource Efficient**: Minimal memory and CPU usage

### 📈 Growth Ready
- **Database Sharding**: Ready for MongoDB sharding
- **Horizontal Scaling**: Stateless worker design
- **Multi-Channel**: Easy to add Discord, Twitter, etc.
- **Multi-Retailer**: Extensible to any retailer

## Monitoring & Maintenance

### 📊 Built-in Analytics
- Daily deal counts and savings calculations
- Error tracking and health monitoring
- Performance metrics and uptime tracking
- Affiliate conversion tracking

### 🔧 Maintenance-Free
- **Self-Healing**: Automatic error recovery
- **Health Checks**: Built-in system diagnostics
- **Graceful Degradation**: Continues on partial failures
- **Zero Downtime**: Hot restart capabilities

## Troubleshooting

### Common Issues

**Bot not posting to Telegram**
- Verify bot token and chat ID
- Check bot has admin permissions in channel
- Test connection with `/health` endpoint

**No deals detected**
- Check product URLs are accessible
- Verify retailer selectors are up-to-date
- Monitor logs for scraping errors

**High error rates**
- Check network connectivity
- Verify retailer hasn't changed page structure
- Adjust rate limiting settings

### Debug Tools
```bash
# Check system health
curl http://localhost:3000/health

# View current stats  
curl http://localhost:3000/api/stats

# Force monitoring cycle
curl -X POST http://localhost:3000/api/monitoring/check

# Test URL analysis
curl -X POST http://localhost:3000/api/analyze \
  -H "Content-Type: application/json" \
  -d '{"url":"https://amazon.com/dp/B123456789"}'
```

## Legal & Compliance

- **Amazon Associates**: Complies with Amazon Associate terms
- **Rate Limiting**: Respectful scraping practices
- **Data Privacy**: No personal data collection
- **Terms of Service**: Respects retailer ToS

---

## Support

For issues or questions:
1. Check the health endpoint: `/health`
2. Review application logs
3. Test individual components via API
4. Monitor Telegram for error notifications

**Happy deal hunting! 🎯💰**