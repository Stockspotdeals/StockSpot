#!/bin/bash

# StockSpot Autonomous Deal Bot Deployment Script
# This script sets up and deploys the autonomous deal bot

set -e  # Exit on any error

echo "🚀 StockSpot Autonomous Deal Bot Deployment"
echo "=========================================="

# Check Node.js version
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 14+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version $NODE_VERSION detected. Please upgrade to Node.js 14+."
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check MongoDB connection
if [ -z "$MONGODB_URI" ]; then
    echo "⚠️  MONGODB_URI not set. Using default local MongoDB."
    export MONGODB_URI="mongodb://localhost:27017/stockspot"
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Copy configuration template if .env doesn't exist
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.autonomous" ]; then
        echo "📋 Copying configuration template..."
        cp backend/.env.autonomous backend/.env
        echo "⚠️  Please edit backend/.env with your credentials before starting."
    else
        echo "❌ No configuration template found. Please create backend/.env manually."
        exit 1
    fi
fi

# Verify required environment variables
echo "🔍 Checking configuration..."
if ! grep -q "TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here" backend/.env; then
    echo "✅ Telegram bot token configured"
else
    echo "❌ Please configure TELEGRAM_BOT_TOKEN in backend/.env"
    exit 1
fi

if ! grep -q "TELEGRAM_CHAT_ID=your_telegram_chat_id_here" backend/.env; then
    echo "✅ Telegram chat ID configured"
else
    echo "❌ Please configure TELEGRAM_CHAT_ID in backend/.env"
    exit 1
fi

if ! grep -q "AMAZON_ASSOCIATE_ID=your_amazon_associate_id_here" backend/.env; then
    echo "✅ Amazon Associate ID configured"
else
    echo "❌ Please configure AMAZON_ASSOCIATE_ID in backend/.env"
    exit 1
fi

# Create systemd service (Linux)
if command -v systemctl &> /dev/null; then
    echo "🔧 Setting up systemd service..."
    
    sudo tee /etc/systemd/system/stockspot-bot.service > /dev/null <<EOF
[Unit]
Description=StockSpot Autonomous Deal Bot
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PWD
ExecStart=/usr/bin/node backend/start_autonomous.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable stockspot-bot
    
    echo "✅ Systemd service created and enabled"
    echo "💡 Use 'sudo systemctl start stockspot-bot' to start the bot"
    echo "💡 Use 'sudo systemctl status stockspot-bot' to check status"
    echo "💡 Use 'sudo systemctl logs -f stockspot-bot' to view logs"
fi

# Create PM2 configuration
echo "📝 Creating PM2 configuration..."
cat > ecosystem.config.js <<EOF
module.exports = {
  apps: [{
    name: 'stockspot-autonomous-bot',
    script: 'backend/start_autonomous.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Create logs directory
mkdir -p logs

echo "✅ PM2 configuration created"
echo "💡 Use 'pm2 start ecosystem.config.js' to start with PM2"
echo "💡 Use 'pm2 save && pm2 startup' to auto-start on boot"

# Create simple start script
cat > start.sh <<EOF
#!/bin/bash
# Simple start script for StockSpot Autonomous Bot

echo "🚀 Starting StockSpot Autonomous Deal Bot..."
node backend/start_autonomous.js
EOF

chmod +x start.sh

echo "✅ Simple start script created (./start.sh)"

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "1. Configure backend/.env with your credentials"
echo "2. Start the bot using one of these methods:"
echo "   • Simple: ./start.sh"
echo "   • PM2: pm2 start ecosystem.config.js"
echo "   • Systemd: sudo systemctl start stockspot-bot"
echo ""
echo "🔍 Monitor the bot:"
echo "   • Health: curl http://localhost:3000/health"
echo "   • Stats: curl http://localhost:3000/api/stats"
echo ""
echo "Happy deal hunting! 🎯💰"