#!/usr/bin/env python3
"""
Health check script for AutoAffiliateHub-X2 Coordinator
"""

import sys
import os

# Add the app directory to the path
sys.path.append('/app')

try:
    from app.cluster.health import get_health_checker
    
    # Get health status
    checker = get_health_checker()
    health = checker.get_health(['redis', 'sqlite', 'system_resources'])
    
    # Check if healthy
    if health.status.value == 'healthy':
        print("✅ Coordinator is healthy")
        sys.exit(0)
    elif health.status.value == 'warning':
        print("⚠️ Coordinator has warnings")
        sys.exit(1)  # Exit with warning code
    else:
        print(f"❌ Coordinator is {health.status.value}")
        sys.exit(2)  # Exit with critical code
        
except Exception as e:
    print(f"❌ Health check failed: {e}")
    sys.exit(1)