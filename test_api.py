#!/usr/bin/env python3
"""
StockSpot Flask API Test
Simple test to verify core functionality works
"""

import os
import sys
from flask import Flask, jsonify, request

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

app = Flask(__name__)

@app.route('/status', methods=['GET'])
def status():
    """Health check endpoint"""
    return jsonify({"status": "OK", "service": "StockSpot", "version": "1.0.0"})

@app.route('/test-imports', methods=['GET'])
def test_imports():
    """Test if our modules can be imported"""
    results = {}
    
    try:
        import tweepy
        results['tweepy'] = "✅ Available"
    except ImportError as e:
        results['tweepy'] = f"❌ Failed: {e}"
    
    try:
        from app.twitter_client import TwitterClient
        results['twitter_client'] = "✅ Available"
    except ImportError as e:
        results['twitter_client'] = f"❌ Failed: {e}"
    
    try:
        from app.affiliate_link_engine import AffiliateLinkEngine
        results['affiliate_link_engine'] = "✅ Available"
    except ImportError as e:
        results['affiliate_link_engine'] = f"❌ Failed: {e}"
    
    return jsonify(results)

if __name__ == '__main__':
    print("🔥 Starting StockSpot API Test Server...")
    app.run(host='0.0.0.0', port=5000, debug=True)