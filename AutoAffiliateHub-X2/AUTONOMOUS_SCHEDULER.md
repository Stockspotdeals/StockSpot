## 🤖 Autonomous Scheduler Quick Start

The AutoAffiliateHub-X2 Autonomous Scheduler is a fully automated system that runs 24/7 to discover deals, generate affiliate links, create social media captions, and schedule posts.

### ⚡ Quick Start

```bash
# Navigate to project directory
cd AutoAffiliateHub-X2

# Run in test mode (safe, uses mock data)
python app/auto_scheduler.py

# The scheduler will start with this message:
# 🚀 AutoAffiliateHub-X2 Autonomous Scheduler started (mock mode: True)
```

### 🔧 How It Works

The scheduler runs every **2 hours** and performs this automated pipeline:

1. **🔍 Deal Discovery**: Finds trending products from affiliate programs
2. **🔗 Link Generation**: Creates trackable affiliate links  
3. **✍️ Caption Creation**: Generates optimized social media content
4. **📱 Post Scheduling**: Distributes to Twitter, Facebook, Instagram
5. **🌐 Website Updates**: Updates your affiliate website feed
6. **📊 Performance Logging**: Tracks all actions in `/logs` directory

### ⚙️ Configuration

Edit `config.json` or `config.yaml` to customize:

```json
{
  "test_mode": true,           // Set false for production
  "system_paused": false,      // Pause/resume automation  
  "scheduler": {
    "cycle_interval_hours": 2,  // Run every 2 hours
    "max_deals_per_cycle": 5    // Process up to 5 deals per cycle
  }
}
```

### 🛑 Control Commands

```bash
# Pause automation (edit config file)
# Set "system_paused": true

# Resume automation  
# Set "system_paused": false

# Stop scheduler gracefully
# Press Ctrl+C
```

### 📋 Log Files

Monitor activity in the `/logs` directory:
- `auto_scheduler.log` - Main operations
- `errors.log` - Error tracking
- `system.log` - System health

### 🧪 Test vs Production Mode

**Test Mode (Default)**:
- Uses mock data instead of real APIs
- Simulates posting without sending
- Safe to run without API credentials

**Production Mode**:
- Connects to real affiliate programs  
- Posts to actual social media accounts
- Requires valid API credentials in `.env`

### ✅ Requirements Met

✅ **Fully automates** deal discovery, link generation, caption creation, and post scheduling  
✅ **Continuously checks** system status and queue length (every 2 hours)  
✅ **Respects pause toggle** from dashboard settings  
✅ **Logs actions safely** to `/logs` directory  
✅ **Mock/testing mode** toggle (`test_mode: true/false`)  
✅ **Graceful shutdown** on KeyboardInterrupt  
✅ **Startup banner** with mock mode status  
✅ **Standard libraries** only (time, logging, json)  
✅ **2-hour cycles** using `time.sleep(7200)`  
✅ **10-minute pause** intervals when system paused  

🚀 **Ready for 24/7 autonomous operation!**