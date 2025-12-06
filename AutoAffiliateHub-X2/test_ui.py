#!/usr/bin/env python3
"""
StockSpot UI Test Script
Tests the new dashboard and add item functionality
"""

import requests
import json
import time

BASE_URL = "http://127.0.0.1:5000"

def test_endpoints():
    """Test all API endpoints"""
    print("🧪 Testing StockSpot UI Endpoints")
    print("=" * 50)
    
    # Test status endpoint
    print("\n1. Testing /status endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/status", timeout=5)
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test dashboard page (HTML)
    print("\n2. Testing /dashboard page...")
    try:
        response = requests.get(f"{BASE_URL}/dashboard", timeout=5)
        print(f"   Status: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type')}")
        if response.status_code == 200:
            print("   ✅ Dashboard page loads successfully")
        else:
            print(f"   ❌ Dashboard failed: {response.status_code}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test add item page (HTML)
    print("\n3. Testing /add-item page...")
    try:
        response = requests.get(f"{BASE_URL}/add-item", timeout=5)
        print(f"   Status: {response.status_code}")
        print(f"   Content-Type: {response.headers.get('Content-Type')}")
        if response.status_code == 200:
            print("   ✅ Add item page loads successfully")
        else:
            print(f"   ❌ Add item page failed: {response.status_code}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test form submission (POST to add-item)
    print("\n4. Testing form submission...")
    try:
        test_data = {
            'item_name': 'Test Product for StockSpot',
            'product_url': 'https://www.amazon.com/dp/B08N5WRWNW'
        }
        
        response = requests.post(f"{BASE_URL}/add-item", data=test_data, timeout=10, allow_redirects=False)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 302:  # Redirect after successful POST
            print("   ✅ Form submission successful (redirected)")
        elif response.status_code == 200:
            print("   ⚠️  Form returned with validation errors")
        else:
            print(f"   ❌ Form submission failed: {response.status_code}")
    except Exception as e:
        print(f"   Error: {e}")
    
    # Test Amazon link generation
    print("\n5. Testing Amazon link generation...")
    try:
        test_payload = {
            'product_url': 'https://www.amazon.com/dp/B08N5WRWNW'
        }
        
        response = requests.post(f"{BASE_URL}/amazon/link", 
                               json=test_payload, 
                               headers={'Content-Type': 'application/json'},
                               timeout=5)
        print(f"   Status: {response.status_code}")
        result = response.json()
        print(f"   Amazon Link Result: {result.get('affiliate_url', 'No URL')}")
        
        if response.status_code == 200 and result.get('affiliate_url'):
            print("   ✅ Amazon link generation working")
        else:
            print("   ⚠️  Amazon link generation has issues")
    except Exception as e:
        print(f"   Error: {e}")

def test_ui_components():
    """Test UI component loading"""
    print("\n🎨 Testing UI Components")
    print("=" * 50)
    
    # Test CSS loading
    print("\n1. Testing CSS file...")
    try:
        response = requests.get(f"{BASE_URL}/static/stockspot_ui.css", timeout=5)
        print(f"   Status: {response.status_code}")
        if response.status_code == 200:
            print(f"   Size: {len(response.content)} bytes")
            print("   ✅ CSS loads successfully")
        else:
            print(f"   ❌ CSS failed: {response.status_code}")
    except Exception as e:
        print(f"   Error: {e}")

def main():
    print("🚀 StockSpot UI Test Suite")
    print("Testing the new minimal UI implementation")
    print(f"Server: {BASE_URL}")
    
    # Wait a moment for server to be ready
    time.sleep(2)
    
    test_endpoints()
    test_ui_components()
    
    print("\n🎉 Test Suite Complete!")
    print("\nNext Steps:")
    print("1. Visit http://127.0.0.1:5000 to see the dashboard")
    print("2. Click 'Add Item' to test the form")
    print("3. Add your Twitter/Amazon credentials to .env for full functionality")

if __name__ == "__main__":
    main()