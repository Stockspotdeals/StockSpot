#!/usr/bin/env python3
"""
Simple StockSpot Test
"""

print("Testing StockSpot Components...")

# Test 1: Twitter Engine
print("\n1. Testing Twitter Engine:")
try:
    from twitter_engine import send_tweet
    print("✅ Twitter engine imported")
except Exception as e:
    print(f"❌ Twitter engine failed: {e}")

# Test 2: Amazon Links
print("\n2. Testing Amazon Engine:")
try:
    from amazon_links import generate_amazon_link
    result = generate_amazon_link("B08N5WRWNW")
    print(f"✅ Amazon engine working: {result['status']}")
except Exception as e:
    print(f"❌ Amazon engine failed: {e}")

# Test 3: API
print("\n3. Testing API:")
try:
    import api
    print("✅ API module imported")
except Exception as e:
    print(f"❌ API failed: {e}")

print("\n✅ StockSpot basic test complete!")