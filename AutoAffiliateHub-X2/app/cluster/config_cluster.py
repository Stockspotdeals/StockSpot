#!/usr/bin/env python3
"""
AutoAffiliateHub-X2 Cluster Configuration Module

Manages cluster-specific settings including Redis configuration, worker scaling,
rate limiting, and fallback options. Reads from config.yaml and environment variables.
"""

import os
import yaml
import logging
from dataclasses import dataclass, field
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class RedisConfig:
    """Redis connection and stream configuration."""
    url: str = "redis://localhost:6379/0"
    host: str = "localhost"
    port: int = 6379
    db: int = 0
    password: Optional[str] = None
    socket_timeout: float = 5.0
    socket_connect_timeout: float = 5.0
    retry_on_timeout: bool = True
    max_connections: int = 50


@dataclass
class WorkerConfig:
    """Worker management and autoscaling configuration."""
    max_workers: int = 4
    min_workers: int = 1
    scale_up_threshold: int = 10  # Messages in queue to trigger scale up
    scale_down_threshold: int = 2  # Messages in queue to trigger scale down
    scale_down_hold_time: int = 60  # Seconds to wait before scaling down
    health_check_interval: int = 10  # Seconds between health checks
    worker_timeout: int = 300  # Seconds before considering worker stale
    memory_limit_mb: int = 512  # Max memory per worker
    cpu_limit_percent: float = 80.0  # Max CPU usage before pausing scale up


@dataclass
class LeaderConfig:
    """Leader election configuration."""
    ttl_seconds: int = 30  # How long leader lock lasts
    renewal_interval: int = 10  # How often to renew leadership
    election_key: str = "stockspot:leader"
    fallback_lock_file: str = "/tmp/stockspot_leader.lock"


@dataclass
class RateLimitConfig:
    """Rate limiting configuration per platform."""
    platforms: Dict[str, Dict[str, Any]] = field(default_factory=lambda: {
        "twitter": {"capacity": 300, "refill_rate": 5.0},  # 5 tokens per second
        "facebook": {"capacity": 200, "refill_rate": 3.3},  # 3.3 tokens per second
        "instagram": {"capacity": 200, "refill_rate": 3.3},
        "pinterest": {"capacity": 150, "refill_rate": 2.5},
        "tiktok": {"capacity": 100, "refill_rate": 1.7},
        "default": {"capacity": 100, "refill_rate": 1.0}
    })
    redis_key_prefix: str = "rate_limit"


@dataclass
class QueueConfig:
    """Queue and stream configuration."""
    default_stream: str = "stockspot:jobs"
    consumer_group: str = "stockspot_workers"
    consumer_timeout_ms: int = 5000  # 5 seconds
    max_pending_messages: int = 100
    message_ttl_seconds: int = 3600  # 1 hour
    batch_size: int = 10  # Messages to read at once
    sqlite_fallback_db: str = "data/cluster_queue.db"


@dataclass
class HealthConfig:
    """Health and metrics configuration."""
    port: int = 8080
    host: str = "0.0.0.0"
    metrics_enabled: bool = True
    health_check_timeout: float = 2.0


@dataclass
class ClusterConfig:
    """Main cluster configuration container."""
    redis: RedisConfig = field(default_factory=RedisConfig)
    workers: WorkerConfig = field(default_factory=WorkerConfig)
    leader: LeaderConfig = field(default_factory=LeaderConfig)
    rate_limit: RateLimitConfig = field(default_factory=RateLimitConfig)
    queue: QueueConfig = field(default_factory=QueueConfig)
    health: HealthConfig = field(default_factory=HealthConfig)
    
    # Global settings
    test_mode: bool = True  # Default to test mode for safety
    force_sqlite: bool = False  # Force SQLite mode
    log_level: str = "INFO"
    environment: str = "development"  # development, staging, production


def load_cluster_config(config_file: str = "config.yaml") -> ClusterConfig:
    """
    Load cluster configuration from YAML file and environment variables.
    
    Environment variables override YAML settings using dot notation:
    AFFILLY_REDIS_HOST overrides redis.host
    AFFILLY_WORKERS_MAX_WORKERS overrides workers.max_workers
    
    Args:
        config_file: Path to YAML configuration file
        
    Returns:
        ClusterConfig: Loaded configuration
    """
    config = ClusterConfig()
    
    # Load from YAML file if it exists
    if os.path.exists(config_file):
        try:
            with open(config_file, 'r') as f:
                yaml_data = yaml.safe_load(f) or {}
                
            cluster_data = yaml_data.get('cluster', {})
            
            # Update Redis config
            if 'redis' in cluster_data:
                redis_data = cluster_data['redis']
                config.redis = RedisConfig(**{
                    k: v for k, v in redis_data.items() 
                    if hasattr(config.redis, k)
                })
            
            # Update Worker config
            if 'workers' in cluster_data:
                worker_data = cluster_data['workers']
                config.workers = WorkerConfig(**{
                    k: v for k, v in worker_data.items()
                    if hasattr(config.workers, k)
                })
            
            # Update other configs similarly
            for section_name in ['leader', 'rate_limit', 'queue', 'health']:
                if section_name in cluster_data:
                    section_data = cluster_data[section_name]
                    current_section = getattr(config, section_name.replace('_', ''))
                    
                    # Update fields that exist
                    for key, value in section_data.items():
                        if hasattr(current_section, key):
                            setattr(current_section, key, value)
            
            # Global settings
            for key in ['test_mode', 'force_sqlite', 'log_level', 'environment']:
                if key in cluster_data:
                    setattr(config, key, cluster_data[key])
                    
            logger.info(f"Loaded cluster configuration from {config_file}")
            
        except Exception as e:
            logger.warning(f"Error loading config file {config_file}: {e}")
            logger.info("Using default configuration")
    
    # Override with environment variables
    _apply_env_overrides(config)
    
    # Validate and adjust configuration
    _validate_config(config)
    
    return config


def _apply_env_overrides(config: ClusterConfig) -> None:
    """Apply environment variable overrides to configuration."""
    
    # Simple environment variable mappings
    env_mappings = {
        'STOCKSPOT_REDIS_URL': ('redis', 'url'),
        'STOCKSPOT_REDIS_HOST': ('redis', 'host'),
        'STOCKSPOT_REDIS_PORT': ('redis', 'port'),
        'STOCKSPOT_REDIS_PASSWORD': ('redis', 'password'),
        'STOCKSPOT_MAX_WORKERS': ('workers', 'max_workers'),
        'STOCKSPOT_MIN_WORKERS': ('workers', 'min_workers'),
        'STOCKSPOT_SCALE_UP_THRESHOLD': ('workers', 'scale_up_threshold'),
        'STOCKSPOT_SCALE_DOWN_THRESHOLD': ('workers', 'scale_down_threshold'),
        'STOCKSPOT_TEST_MODE': ('', 'test_mode'),
        'STOCKSPOT_FORCE_SQLITE': ('', 'force_sqlite'),
        'STOCKSPOT_LOG_LEVEL': ('', 'log_level'),
        'STOCKSPOT_ENVIRONMENT': ('', 'environment'),
        'STOCKSPOT_HEALTH_PORT': ('health', 'port'),
    }
    
    for env_var, (section, field) in env_mappings.items():
        value = os.getenv(env_var)
        if value is not None:
            try:
                # Convert string values to appropriate types
                if section:
                    target_obj = getattr(config, section)
                    current_value = getattr(target_obj, field)
                else:
                    target_obj = config
                    current_value = getattr(config, field)
                
                # Type conversion based on current value type
                if isinstance(current_value, bool):
                    converted_value = value.lower() in ('true', '1', 'yes', 'on')
                elif isinstance(current_value, int):
                    converted_value = int(value)
                elif isinstance(current_value, float):
                    converted_value = float(value)
                else:
                    converted_value = value
                
                setattr(target_obj, field, converted_value)
                logger.debug(f"Applied env override {env_var}={converted_value}")
                
            except (ValueError, TypeError) as e:
                logger.warning(f"Invalid env var {env_var}={value}: {e}")


def _validate_config(config: ClusterConfig) -> None:
    """Validate and adjust configuration values."""
    
    # Ensure sensible worker limits
    if config.workers.max_workers < config.workers.min_workers:
        config.workers.max_workers = config.workers.min_workers
        
    if config.workers.min_workers < 1:
        config.workers.min_workers = 1
        
    if config.workers.max_workers > 50:  # Reasonable upper bound
        logger.warning("max_workers > 50 may cause resource issues")
    
    # Ensure positive thresholds
    if config.workers.scale_up_threshold < 1:
        config.workers.scale_up_threshold = 1
        
    if config.workers.scale_down_threshold < 0:
        config.workers.scale_down_threshold = 0
    
    # Validate Redis settings
    if config.redis.port < 1 or config.redis.port > 65535:
        config.redis.port = 6379
        logger.warning("Invalid Redis port, using default 6379")
    
    # Ensure data directory exists for SQLite fallback
    sqlite_dir = os.path.dirname(config.queue.sqlite_fallback_db)
    if sqlite_dir and not os.path.exists(sqlite_dir):
        os.makedirs(sqlite_dir, exist_ok=True)
    
    # Set force_sqlite from environment if needed
    if os.getenv('STOCKSPOT_FORCE_SQLITE', '').lower() in ('true', '1', 'yes'):
        config.force_sqlite = True
        logger.info("Forcing SQLite mode from environment variable")


def get_redis_url(config: ClusterConfig) -> str:
    """
    Build Redis URL from configuration.
    
    Args:
        config: Cluster configuration
        
    Returns:
        str: Redis connection URL
    """
    if config.redis.url and "://" in config.redis.url:
        return config.redis.url
    
    # Build URL from components
    auth_part = f":{config.redis.password}@" if config.redis.password else ""
    return f"redis://{auth_part}{config.redis.host}:{config.redis.port}/{config.redis.db}"


# Global configuration instance
_cluster_config = None

def get_cluster_config(reload: bool = False) -> ClusterConfig:
    """
    Get global cluster configuration instance.
    
    Args:
        reload: Force reload from file
        
    Returns:
        ClusterConfig: Global configuration instance
    """
    global _cluster_config
    
    if _cluster_config is None or reload:
        _cluster_config = load_cluster_config()
    
    return _cluster_config


if __name__ == "__main__":
    # Demo the configuration system
    print("AutoAffiliateHub-X2 Cluster Configuration Demo")
    print("=" * 50)
    
    config = load_cluster_config()
    
    print(f"Environment: {config.environment}")
    print(f"Test Mode: {config.test_mode}")
    print(f"Force SQLite: {config.force_sqlite}")
    print()
    
    print(f"Redis URL: {get_redis_url(config)}")
    print(f"Max Workers: {config.workers.max_workers}")
    print(f"Scale Up Threshold: {config.workers.scale_up_threshold}")
    print(f"Health Port: {config.health.port}")
    print()
    
    print("Rate Limits:")
    for platform, limits in config.rate_limit.platforms.items():
        print(f"  {platform}: {limits['capacity']} tokens, {limits['refill_rate']}/sec")
    
    print("\nConfiguration loaded successfully! ✅")