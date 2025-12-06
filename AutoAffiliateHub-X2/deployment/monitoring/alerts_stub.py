#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Alert System Stub

This script provides a placeholder alert system for notifications and monitoring.
In test mode, it prints alerts to console. In production, it can be extended to
send notifications via Slack, Discord, email, or other services.

Alert Types:
- System resource warnings (CPU, memory, disk)
- Queue depth alerts
- Rate limit violations
- Revenue/conversion anomalies
- Component health failures
- Security events

Usage:
    python deployment/monitoring/alerts_stub.py --test
    python deployment/monitoring/alerts_stub.py --incident "System overload detected"
    python deployment/monitoring/alerts_stub.py --config alerts_config.json
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional
import argparse
import requests
from enum import Enum

# Add project root to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class AlertLevel(Enum):
    """Alert severity levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"

class AlertChannel(Enum):
    """Alert delivery channels."""
    CONSOLE = "console"
    SLACK = "slack"
    DISCORD = "discord"
    EMAIL = "email"
    WEBHOOK = "webhook"
    SMS = "sms"

class AlertsSystem:
    """Centralized alerting system for AutoAffiliateHub-X2."""
    
    def __init__(self, config_file: Optional[str] = None, test_mode: bool = True):
        """Initialize alerts system."""
        self.test_mode = test_mode
        
        # Default configuration
        self.config = {
            'enabled': True,
            'test_mode': test_mode,
            'default_channel': 'console',
            'rate_limiting': {
                'max_alerts_per_hour': 50,
                'duplicate_suppression_minutes': 15
            },
            'channels': {
                'console': {'enabled': True},
                'slack': {
                    'enabled': False,
                    'webhook_url': '',
                    'channel': '#alerts',
                    'username': 'AutoAffiliateHub-Bot'
                },
                'discord': {
                    'enabled': False,
                    'webhook_url': '',
                    'username': 'AutoAffiliateHub-Bot'
                },
                'email': {
                    'enabled': False,
                    'smtp_server': '',
                    'smtp_port': 587,
                    'username': '',
                    'password': '',
                    'from_address': '',
                    'to_addresses': []
                },
                'webhook': {
                    'enabled': False,
                    'url': '',
                    'headers': {},
                    'timeout': 30
                }
            },
            'alert_rules': {
                'cpu_usage': {
                    'warning_threshold': 80,
                    'critical_threshold': 95,
                    'enabled': True
                },
                'memory_usage': {
                    'warning_threshold': 85,
                    'critical_threshold': 95,
                    'enabled': True
                },
                'queue_depth': {
                    'warning_threshold': 100,
                    'critical_threshold': 500,
                    'enabled': True
                },
                'error_rate': {
                    'warning_threshold': 5,  # 5% error rate
                    'critical_threshold': 10,  # 10% error rate
                    'enabled': True
                },
                'revenue_anomaly': {
                    'drop_threshold': 50,  # 50% drop in revenue
                    'enabled': True
                }
            }
        }
        
        # Load configuration from file if provided
        if config_file and os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    user_config = json.load(f)
                self._merge_config(user_config)
                logger.info(f"📄 Loaded alerts configuration from {config_file}")
            except Exception as e:
                logger.error(f"❌ Failed to load config file {config_file}: {e}")
        
        # Alert history for rate limiting and deduplication
        self.alert_history = []
        self.max_history = 1000
        
        # Alert counters
        self.stats = {
            'alerts_sent': 0,
            'alerts_suppressed': 0,
            'alerts_failed': 0,
            'start_time': datetime.now()
        }
        
        logger.info(f"🚨 AlertsSystem initialized (test_mode={test_mode})")
    
    def _merge_config(self, user_config: Dict[str, Any]):
        """Merge user configuration with defaults."""
        def merge_dict(base: Dict, update: Dict):
            for key, value in update.items():
                if key in base and isinstance(base[key], dict) and isinstance(value, dict):
                    merge_dict(base[key], value)
                else:
                    base[key] = value
        
        merge_dict(self.config, user_config)
    
    def send_alert(self, 
                   message: str, 
                   level: AlertLevel = AlertLevel.WARNING,
                   component: str = 'system',
                   channels: Optional[List[str]] = None,
                   metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Send alert through configured channels."""
        
        if not self.config['enabled']:
            logger.debug("🔇 Alerts disabled, skipping")
            return False
        
        # Create alert object
        alert = {
            'id': self._generate_alert_id(),
            'timestamp': datetime.now().isoformat(),
            'level': level.value,
            'component': component,
            'message': message,
            'metadata': metadata or {},
            'channels_attempted': [],
            'channels_successful': []
        }
        
        # Check rate limiting and deduplication
        if self._should_suppress_alert(alert):
            self.stats['alerts_suppressed'] += 1
            logger.debug(f"🔇 Alert suppressed due to rate limiting: {message}")
            return False
        
        # Determine channels to use
        if not channels:
            channels = [self.config['default_channel']]
        
        # Send to each channel
        success = False
        for channel in channels:
            try:
                if self._send_to_channel(alert, channel):
                    alert['channels_successful'].append(channel)
                    success = True
                else:
                    alert['channels_attempted'].append(channel)
            except Exception as e:
                logger.error(f"❌ Failed to send alert to {channel}: {e}")
                alert['channels_attempted'].append(channel)
                self.stats['alerts_failed'] += 1
        
        # Store in history
        self.alert_history.append(alert)
        if len(self.alert_history) > self.max_history:
            self.alert_history.pop(0)
        
        if success:
            self.stats['alerts_sent'] += 1
            logger.info(f"✅ Alert sent: {message} (level: {level.value})")
        else:
            logger.error(f"❌ Failed to send alert to any channel: {message}")
        
        return success
    
    def _generate_alert_id(self) -> str:
        """Generate unique alert ID."""
        timestamp = int(time.time() * 1000)
        return f"alert_{timestamp}_{len(self.alert_history)}"
    
    def _should_suppress_alert(self, alert: Dict[str, Any]) -> bool:
        """Check if alert should be suppressed due to rate limiting or deduplication."""
        now = datetime.now()
        
        # Check hourly rate limit
        hour_ago = now - timedelta(hours=1)
        recent_alerts = [
            a for a in self.alert_history 
            if datetime.fromisoformat(a['timestamp']) > hour_ago
        ]
        
        if len(recent_alerts) >= self.config['rate_limiting']['max_alerts_per_hour']:
            return True
        
        # Check duplicate suppression
        suppression_window = timedelta(
            minutes=self.config['rate_limiting']['duplicate_suppression_minutes']
        )
        
        for historical_alert in reversed(self.alert_history[-10:]):  # Check last 10 alerts
            alert_time = datetime.fromisoformat(historical_alert['timestamp'])
            
            if now - alert_time > suppression_window:
                break
            
            # Check for similar alert
            if (historical_alert['component'] == alert['component'] and
                historical_alert['level'] == alert['level'] and
                self._messages_similar(historical_alert['message'], alert['message'])):
                return True
        
        return False
    
    def _messages_similar(self, msg1: str, msg2: str, threshold: float = 0.8) -> bool:
        """Check if two alert messages are similar enough to be considered duplicates."""
        # Simple similarity check based on common words
        words1 = set(msg1.lower().split())
        words2 = set(msg2.lower().split())
        
        if not words1 or not words2:
            return False
        
        intersection = words1.intersection(words2)
        union = words1.union(words2)
        
        similarity = len(intersection) / len(union)
        return similarity >= threshold
    
    def _send_to_channel(self, alert: Dict[str, Any], channel: str) -> bool:
        """Send alert to specific channel."""
        
        if channel not in self.config['channels']:
            logger.error(f"❌ Unknown alert channel: {channel}")
            return False
        
        channel_config = self.config['channels'][channel]
        
        if not channel_config.get('enabled', False):
            logger.debug(f"🔇 Channel {channel} disabled, skipping")
            return False
        
        # Route to appropriate sender
        if channel == 'console':
            return self._send_console(alert)
        elif channel == 'slack':
            return self._send_slack(alert, channel_config)
        elif channel == 'discord':
            return self._send_discord(alert, channel_config)
        elif channel == 'email':
            return self._send_email(alert, channel_config)
        elif channel == 'webhook':
            return self._send_webhook(alert, channel_config)
        else:
            logger.error(f"❌ Unsupported channel type: {channel}")
            return False
    
    def _send_console(self, alert: Dict[str, Any]) -> bool:
        """Send alert to console output."""
        try:
            # Format alert for console
            level_emoji = {
                'info': '💡',
                'warning': '⚠️',
                'critical': '🔴',
                'emergency': '🚨'
            }
            
            emoji = level_emoji.get(alert['level'], '📢')
            timestamp = alert['timestamp']
            component = alert['component']
            message = alert['message']
            level = alert['level'].upper()
            
            console_message = f"{emoji} [{timestamp}] {level} [{component}] {message}"
            
            # Print to console (could also log to file)
            print(console_message)
            
            # Also write to alerts log file
            log_file = 'deployment/logs/alerts.log'
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            
            with open(log_file, 'a') as f:
                f.write(f"{console_message}\n")
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Console alert failed: {e}")
            return False
    
    def _send_slack(self, alert: Dict[str, Any], config: Dict[str, Any]) -> bool:
        """Send alert to Slack channel."""
        if self.test_mode:
            print(f"📱 [TEST] Slack alert: {alert['message']}")
            return True
        
        try:
            webhook_url = config.get('webhook_url')
            if not webhook_url:
                logger.error("❌ Slack webhook URL not configured")
                return False
            
            # Format Slack message
            color_map = {
                'info': '#36a64f',      # Green
                'warning': '#ff9900',   # Orange  
                'critical': '#ff0000',  # Red
                'emergency': '#8B0000'  # Dark red
            }
            
            payload = {
                'username': config.get('username', 'AutoAffiliateHub-Bot'),
                'channel': config.get('channel', '#alerts'),
                'attachments': [{
                    'color': color_map.get(alert['level'], '#36a64f'),
                    'title': f"AutoAffiliateHub Alert - {alert['level'].upper()}",
                    'text': alert['message'],
                    'fields': [
                        {'title': 'Component', 'value': alert['component'], 'short': True},
                        {'title': 'Time', 'value': alert['timestamp'], 'short': True}
                    ],
                    'footer': 'AutoAffiliateHub-X2',
                    'ts': int(time.time())
                }]
            }
            
            # Add metadata fields
            if alert['metadata']:
                for key, value in alert['metadata'].items():
                    payload['attachments'][0]['fields'].append({
                        'title': key.title(),
                        'value': str(value),
                        'short': True
                    })
            
            response = requests.post(webhook_url, json=payload, timeout=30)
            response.raise_for_status()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Slack alert failed: {e}")
            return False
    
    def _send_discord(self, alert: Dict[str, Any], config: Dict[str, Any]) -> bool:
        """Send alert to Discord channel."""
        if self.test_mode:
            print(f"🎮 [TEST] Discord alert: {alert['message']}")
            return True
        
        try:
            webhook_url = config.get('webhook_url')
            if not webhook_url:
                logger.error("❌ Discord webhook URL not configured")
                return False
            
            # Format Discord message
            color_map = {
                'info': 0x36a64f,      # Green
                'warning': 0xff9900,   # Orange
                'critical': 0xff0000,  # Red
                'emergency': 0x8B0000  # Dark red
            }
            
            payload = {
                'username': config.get('username', 'AutoAffiliateHub-Bot'),
                'embeds': [{
                    'title': f'AutoAffiliateHub Alert - {alert["level"].upper()}',
                    'description': alert['message'],
                    'color': color_map.get(alert['level'], 0x36a64f),
                    'fields': [
                        {'name': 'Component', 'value': alert['component'], 'inline': True},
                        {'name': 'Time', 'value': alert['timestamp'], 'inline': True}
                    ],
                    'footer': {'text': 'AutoAffiliateHub-X2'},
                    'timestamp': alert['timestamp']
                }]
            }
            
            # Add metadata fields
            if alert['metadata']:
                for key, value in alert['metadata'].items():
                    payload['embeds'][0]['fields'].append({
                        'name': key.title(),
                        'value': str(value),
                        'inline': True
                    })
            
            response = requests.post(webhook_url, json=payload, timeout=30)
            response.raise_for_status()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Discord alert failed: {e}")
            return False
    
    def _send_email(self, alert: Dict[str, Any], config: Dict[str, Any]) -> bool:
        """Send alert via email."""
        if self.test_mode:
            print(f"📧 [TEST] Email alert: {alert['message']}")
            return True
        
        try:
            import smtplib
            from email.mime.text import MIMEText
            from email.mime.multipart import MIMEMultipart
            
            # Email configuration
            smtp_server = config.get('smtp_server')
            smtp_port = config.get('smtp_port', 587)
            username = config.get('username')
            password = config.get('password')
            from_address = config.get('from_address')
            to_addresses = config.get('to_addresses', [])
            
            if not all([smtp_server, username, password, from_address, to_addresses]):
                logger.error("❌ Email configuration incomplete")
                return False
            
            # Create message
            msg = MIMEMultipart()
            msg['From'] = from_address
            msg['To'] = ', '.join(to_addresses)
            msg['Subject'] = f"AutoAffiliateHub Alert - {alert['level'].upper()}"
            
            # Email body
            body = f"""
AutoAffiliateHub-X2 Alert

Level: {alert['level'].upper()}
Component: {alert['component']}
Time: {alert['timestamp']}

Message:
{alert['message']}

Metadata:
{json.dumps(alert['metadata'], indent=2) if alert['metadata'] else 'None'}

---
AutoAffiliateHub-X2 Alert System
"""
            
            msg.attach(MIMEText(body, 'plain'))
            
            # Send email
            server = smtplib.SMTP(smtp_server, smtp_port)
            server.starttls()
            server.login(username, password)
            server.sendmail(from_address, to_addresses, msg.as_string())
            server.quit()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Email alert failed: {e}")
            return False
    
    def _send_webhook(self, alert: Dict[str, Any], config: Dict[str, Any]) -> bool:
        """Send alert via webhook."""
        if self.test_mode:
            print(f"🔗 [TEST] Webhook alert: {alert['message']}")
            return True
        
        try:
            webhook_url = config.get('url')
            if not webhook_url:
                logger.error("❌ Webhook URL not configured")
                return False
            
            headers = config.get('headers', {})
            timeout = config.get('timeout', 30)
            
            # Send alert as JSON payload
            response = requests.post(
                webhook_url,
                json=alert,
                headers=headers,
                timeout=timeout
            )
            response.raise_for_status()
            
            return True
            
        except Exception as e:
            logger.error(f"❌ Webhook alert failed: {e}")
            return False
    
    def send_test_alerts(self):
        """Send test alerts to verify configuration."""
        logger.info("🧪 Sending test alerts...")
        
        test_alerts = [
            {
                'message': 'Test info alert - system is operational',
                'level': AlertLevel.INFO,
                'component': 'test_system'
            },
            {
                'message': 'Test warning alert - minor issue detected',
                'level': AlertLevel.WARNING,
                'component': 'test_system',
                'metadata': {'cpu_usage': 85, 'threshold': 80}
            },
            {
                'message': 'Test critical alert - immediate attention required',
                'level': AlertLevel.CRITICAL,
                'component': 'test_system',
                'metadata': {'error_rate': 15, 'threshold': 10}
            }
        ]
        
        for i, test_alert in enumerate(test_alerts, 1):
            success = self.send_alert(**test_alert)
            logger.info(f"Test alert {i}/3: {'✅ SUCCESS' if success else '❌ FAILED'}")
            time.sleep(1)  # Brief pause between test alerts
        
        logger.info("🧪 Test alerts complete")
    
    def get_stats(self) -> Dict[str, Any]:
        """Get alerting system statistics."""
        uptime = datetime.now() - self.stats['start_time']
        
        return {
            'uptime_seconds': uptime.total_seconds(),
            'alerts_sent': self.stats['alerts_sent'],
            'alerts_suppressed': self.stats['alerts_suppressed'],
            'alerts_failed': self.stats['alerts_failed'],
            'recent_alerts': len([
                a for a in self.alert_history
                if datetime.now() - datetime.fromisoformat(a['timestamp']) < timedelta(hours=1)
            ]),
            'config': {
                'enabled': self.config['enabled'],
                'test_mode': self.test_mode,
                'channels_enabled': [
                    channel for channel, config in self.config['channels'].items()
                    if config.get('enabled', False)
                ]
            }
        }

def main():
    """Main execution function."""
    parser = argparse.ArgumentParser(description='AutoAffiliateHub-X2 Alert System')
    parser.add_argument('--test', '-t', action='store_true',
                       help='Send test alerts to verify configuration')
    parser.add_argument('--incident', '-i', type=str,
                       help='Send immediate incident alert')
    parser.add_argument('--level', '-l', choices=['info', 'warning', 'critical', 'emergency'],
                       default='warning', help='Alert level for incident')
    parser.add_argument('--component', '-c', type=str, default='manual',
                       help='Component that triggered the alert')
    parser.add_argument('--config', type=str,
                       help='Configuration file path')
    parser.add_argument('--stats', '-s', action='store_true',
                       help='Show alerting system statistics')
    args = parser.parse_args()
    
    try:
        # Initialize alerts system
        alerts = AlertsSystem(
            config_file=args.config,
            test_mode=True  # Always test mode for safety
        )
        
        # Handle different operations
        if args.test:
            alerts.send_test_alerts()
        
        elif args.incident:
            level = AlertLevel(args.level)
            success = alerts.send_alert(
                message=args.incident,
                level=level,
                component=args.component
            )
            
            if success:
                print(f"✅ Alert sent successfully")
            else:
                print(f"❌ Failed to send alert")
                sys.exit(1)
        
        elif args.stats:
            stats = alerts.get_stats()
            print("\n📊 Alert System Statistics:")
            print(json.dumps(stats, indent=2, default=str))
        
        else:
            print("🚨 AutoAffiliateHub-X2 Alert System")
            print("Use --test to send test alerts or --incident 'message' to send an alert")
            print("Use --help for more options")
        
    except KeyboardInterrupt:
        print("\n🛑 Alert system interrupted by user")
    except Exception as e:
        logger.error(f"❌ Alert system error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()