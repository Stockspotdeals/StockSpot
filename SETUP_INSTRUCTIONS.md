# StockSpot Installation & Setup Guide

## 🚀 Dependencies Installation

### Quick Installation
```powershell
# Install all dependencies at once
pip install -r requirements.txt
```

### Individual Installation
```powershell
# Core dependencies
pip install flask tweepy python-dotenv requests apscheduler sqlalchemy jinja2 beautifulsoup4

# Optional dependencies for advanced features
pip install redis boto3 pytest gunicorn
```

### Required Dependencies
- **flask**: Web framework for the API
- **tweepy**: Twitter API client
- **python-dotenv**: Environment variable management
- **requests**: HTTP client for API calls
- **beautifulsoup4**: HTML parsing (required by some modules)
- **apscheduler**: Task scheduling
- **sqlalchemy**: Database ORM
- **jinja2**: Template engine

## ⚙️ Configuration

### 1. Twitter API Credentials
1. Go to [Twitter Developer Portal](https://developer.twitter.com/)
2. Create a new app or use existing one
3. Generate API keys and tokens
4. Add them to `.env` file:

```env
# Twitter/X API Credentials
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_BEARER_TOKEN=your_bearer_token_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_secret_here
```

### 2. Flask Configuration
```env
# Flask Configuration
FLASK_SECRET_KEY=your-secret-key-change-in-production
FLASK_ENV=development
PORT=5000
```

### 3. Feature Toggles
```env
# Features (ON/OFF)
ENABLE_TWITTER=ON
ENABLE_AMAZON=ON
AUTO_POST=OFF
```

## 🧪 Testing & Validation

### Run System Validation
```powershell
python validate_stockspot.py
```

This will test:
- ✅ Import safety (all modules load correctly)
- ✅ Posting engine availability
- ✅ Twitter credentials configuration
- ✅ Flask API endpoints
- ✅ Twitter posting functionality (if credentials set)

### Expected Validation Results
```
🚀 StockSpot Validation Starting...
==================================================
🔍 Testing Import Safety
----------------------------------------
✅ Basic Python modules: OK
✅ Tweepy module: AVAILABLE
✅ Flask module: AVAILABLE
✅ Python-dotenv module: AVAILABLE
✅ Requests module: AVAILABLE

🔧 Testing Posting Engine
----------------------------------------
✅ Posting engine imported successfully
✅ send_tweet function: AVAILABLE

🔑 Testing Twitter Credentials
----------------------------------------
❌ TWITTER_API_KEY: NOT SET (until you add credentials)
❌ TWITTER_API_SECRET: NOT SET
❌ TWITTER_ACCESS_TOKEN: NOT SET
❌ TWITTER_ACCESS_TOKEN_SECRET: NOT SET

🌐 Testing API Endpoints
----------------------------------------
✅ Flask available for API testing
✅ API module imported successfully
✅ Flask app: DEFINED
✅ /status endpoint: OK
✅ / endpoint: OK

🐦 Testing Twitter Posting
----------------------------------------
❌ Twitter posting: FAILED (until credentials added)
```

## 🌐 API Usage

### Start the API Server
```powershell
python api.py
```

The server will start on `http://localhost:5000`

### Available Endpoints

#### 1. Health Check
```
GET /status
Response: {"status": "OK", "service": "StockSpot", "version": "1.0.0"}
```

#### 2. Post Tweet
```
POST /tweet
Content-Type: application/json
{
    "message": "Your tweet content here",
    "image": null  // optional
}
```

#### 3. Test Tweet
```
GET /test_tweet
Posts "StockSpot Test Post" to Twitter
```

#### 4. Twitter Status
```
GET /twitter/status
Response: {"connected": true, "posting_engine": "available"}
```

#### 5. API Info
```
GET /
Response: API documentation and endpoints
```

## 🔧 Core Functions

### send_tweet(message, image_path=None)
```python
from app.posting_engine import send_tweet

# Simple tweet
success = send_tweet("Hello, Twitter!")

# Tweet with image
success = send_tweet("Check out this image!", "/path/to/image.jpg")

# Returns True if successful, False if failed
```

### Safe Import Patterns
The system uses safe imports that won't crash VS Code:
```python
# Safe tweepy import with fallbacks
try:
    import tweepy
    TWEEPY_AVAILABLE = True
except ImportError:
    tweepy = None
    TWEEPY_AVAILABLE = False
```

## 📝 Example Usage

### Basic Tweet Posting
```python
from app.posting_engine import send_tweet

# Post a simple tweet
if send_tweet("StockSpot is working! 🚀"):
    print("Tweet posted successfully")
else:
    print("Failed to post tweet")
```

### Using the Flask API
```python
import requests

# Test the API
response = requests.get('http://localhost:5000/status')
print(response.json())

# Post a tweet via API
tweet_data = {"message": "Hello from StockSpot API!"}
response = requests.post('http://localhost:5000/tweet', json=tweet_data)
print(response.json())
```

### Testing API Endpoints
```bash
# Test status
curl http://localhost:5000/status

# Test tweet endpoint (requires credentials)
curl -X POST http://localhost:5000/tweet \\
  -H "Content-Type: application/json" \\
  -d '{"message": "Test tweet from StockSpot!"}'

# Quick test tweet
curl http://localhost:5000/test_tweet
```

## 🛡️ Error Handling

The system includes comprehensive error handling:

1. **Import Safety**: Won't crash if dependencies are missing
2. **Credential Validation**: Checks Twitter credentials before posting
3. **Input Validation**: Validates tweet length and content
4. **Graceful Fallbacks**: Works even with missing optional modules
5. **Detailed Logging**: Provides clear error messages

## 🎯 Success Criteria

After setup, you should see:
- ✅ All dependencies installed without errors
- ✅ Validation script passes (except credentials if not set)
- ✅ API server starts successfully on port 5000
- ✅ `/status` and `/` endpoints respond correctly
- ✅ Twitter posting works when credentials are configured

## 📞 Troubleshooting

### Common Issues

1. **Import errors**: Run `pip install -r requirements.txt`
2. **BS4 module missing**: Run `pip install beautifulsoup4`
3. **Twitter posting fails**: Check credentials in `.env`
4. **Flask won't start**: Check if port 5000 is available
5. **VS Code freezing**: Use the safe import patterns

### Debug Commands
```powershell
# Check Python version
python --version

# Check installed packages
pip list

# Run validation with verbose output
python validate_stockspot.py

# Test API locally
python api.py
```

## 🎉 Success!

Once everything is set up:
1. Dependencies are installed ✅
2. Posting engine imports safely ✅
3. Flask integration is stable ✅
4. Twitter posting validation works ✅

Your StockSpot system is ready for Amazon affiliate + Twitter automation! 🚀