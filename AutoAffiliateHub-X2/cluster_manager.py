#!/usr/bin/env python3
"""
StockSpot Cluster Management CLI

Command-line interface for managing the StockSpot cluster.
Provides tools for deployment, scaling, monitoring, and troubleshooting.
"""

import os
import sys
import json
import time
import click
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime

# Add the app directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'app'))

try:
    from app.cluster import create_cluster_coordinator
    from app.cluster.config_cluster import get_cluster_config
    from app.cluster.health import get_health_checker
    from app.cluster.redis_queue import create_redis_queue, RedisQueueError
    from app.cluster.sqlite_queue import create_sqlite_queue
    from app.cluster.leader_election import create_leader_election
    from app.cluster.rate_limiter import get_rate_limiter
    CLUSTER_AVAILABLE = True
except ImportError as e:
    CLUSTER_AVAILABLE = False
    IMPORT_ERROR = str(e)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@click.group()
@click.option('--verbose', '-v', is_flag=True, help='Enable verbose output')
@click.option('--config', '-c', help='Path to cluster configuration file')
def cli(verbose, config):
    """StockSpot Cluster Management CLI"""
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    if not CLUSTER_AVAILABLE:
        click.echo(f"❌ Error: Cluster components not available: {IMPORT_ERROR}", err=True)
        sys.exit(1)
    
    if config:
        os.environ['CLUSTER_CONFIG_PATH'] = config


@cli.command()
@click.option('--max-workers', default=None, type=int, help='Maximum number of workers')
@click.option('--worker-function', default='default', help='Worker function to use')
def start(max_workers, worker_function):
    """Start the cluster coordinator"""
    click.echo("🚀 Starting StockSpot cluster coordinator...")
    
    try:
        # Define worker function
        def default_worker_function(monitoring_context=None, **kwargs):
            """Default worker function that processes AutoAffiliateHub tasks"""
            if monitoring_context:
                logger = monitoring_context['logger']
                worker_id = monitoring_context['worker_id']
                shutdown_event = monitoring_context['shutdown_event']
                
                logger.info(f'AutoAffiliateHub worker {worker_id} starting')
                
                try:
                    from app.auto_scheduler import AutoScheduler
                    scheduler = AutoScheduler()
                    
                    task_count = 0
                    while not shutdown_event.is_set():
                        try:
                            processed = scheduler.process_cycle()
                            if processed:
                                task_count += processed
                                logger.info(f'Worker {worker_id} processed {processed} tasks')
                            
                            if shutdown_event.wait(10.0):  # 10 second intervals
                                break
                                
                        except Exception as e:
                            logger.error(f'Worker {worker_id} processing error: {e}')
                            if shutdown_event.wait(30.0):
                                break
                                
                except Exception as e:
                    logger.error(f'Worker {worker_id} setup error: {e}')
                finally:
                    logger.info(f'Worker {worker_id} shutting down')
        
        # Create coordinator
        coordinator = create_cluster_coordinator(default_worker_function)
        
        # Override max workers if specified
        if max_workers:
            coordinator.config.worker.max_workers = max_workers
        
        # Start coordinator
        if coordinator.start():
            click.echo("✅ Cluster coordinator started successfully")
            
            try:
                # Run forever
                coordinator.run_forever(check_interval=30.0)
            except KeyboardInterrupt:
                click.echo("\n⚠️ Received interrupt signal")
        else:
            click.echo("❌ Failed to start cluster coordinator", err=True)
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"❌ Error starting coordinator: {e}", err=True)
        sys.exit(1)
    finally:
        if 'coordinator' in locals():
            coordinator.stop()
        click.echo("🛑 Cluster coordinator stopped")


@cli.command()
def status():
    """Show cluster status"""
    click.echo("📊 StockSpot Cluster Status")
    click.echo("=" * 37)
    
    try:
        coordinator = create_cluster_coordinator()
        status = coordinator.get_status()
        
        # Coordinator status
        coord_status = status['coordinator']
        click.echo(f"\n🎯 Coordinator:")
        click.echo(f"  Node ID: {coord_status['node_id']}")
        click.echo(f"  Status: {'🟢 Running' if coord_status['is_running'] else '🔴 Stopped'}")
        click.echo(f"  Uptime: {coord_status['uptime_seconds']:.1f}s")
        click.echo(f"  Queue: {coord_status['queue_type'].title()}")
        
        # Leadership status
        leadership = status['leadership']
        click.echo(f"\n👑 Leadership:")
        click.echo(f"  Is Leader: {'🎖️  Yes' if leadership['is_leader'] else '❌ No'}")
        if leadership['current_leader']:
            click.echo(f"  Current Leader: {leadership['current_leader']}")
        
        # Worker status
        workers = status.get('workers', {})
        if workers:
            click.echo(f"\n👷 Workers:")
            click.echo(f"  Total: {workers['total_workers']}")
            click.echo(f"  Running: {workers['running_workers']}")
            click.echo(f"  Errors: {workers.get('error_workers', 0)}")
            click.echo(f"  Max: {workers['max_workers']}")
            click.echo(f"  Started: {workers.get('total_started', 0)}")
            click.echo(f"  Stopped: {workers.get('total_stopped', 0)}")
        
        # Health status
        health = status.get('health', {})
        if health and 'overall_status' in health:
            click.echo(f"\n🏥 Health:")
            status_emoji = {
                'healthy': '🟢',
                'warning': '🟡', 
                'critical': '🔴',
                'unknown': '❓'
            }
            overall = health['overall_status']
            click.echo(f"  Overall: {status_emoji.get(overall, '❓')} {overall.title()}")
            
            for component in health.get('components', []):
                status_emoji_comp = status_emoji.get(component['status'], '❓')
                click.echo(f"  {component['name']}: {status_emoji_comp} {component['message']}")
        
        # Queue stats
        queue_stats = status.get('queue_stats', {})
        if queue_stats and 'error' not in queue_stats:
            click.echo(f"\n📊 Queue Status:")
            for queue_name, stats in queue_stats.items():
                if isinstance(stats, dict) and 'length' in stats:
                    click.echo(f"  {queue_name}: {stats['length']} messages")
        
    except Exception as e:
        click.echo(f"❌ Error getting status: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--components', '-c', multiple=True, help='Specific components to check')
@click.option('--json-output', is_flag=True, help='Output in JSON format')
def health(components, json_output):
    """Check cluster health"""
    try:
        checker = get_health_checker()
        health_report = checker.get_health(list(components) if components else None)
        
        if json_output:
            # Convert to JSON-serializable format
            import dataclasses
            health_dict = dataclasses.asdict(health_report)
            health_dict['status'] = health_report.status.value
            for comp in health_dict['components']:
                comp['status'] = comp['status'].value if hasattr(comp['status'], 'value') else comp['status']
                if isinstance(comp['last_check'], datetime):
                    comp['last_check'] = comp['last_check'].isoformat()
            if isinstance(health_dict['timestamp'], datetime):
                health_dict['timestamp'] = health_dict['timestamp'].isoformat()
            
            click.echo(json.dumps(health_dict, indent=2))
        else:
            click.echo("🏥 StockSpot Health Report")
            click.echo("=" * 36)
            
            status_emoji = {
                'healthy': '🟢',
                'warning': '🟡',
                'critical': '🔴', 
                'unknown': '❓'
            }
            
            overall = health_report.status.value
            click.echo(f"\n📈 Overall Status: {status_emoji.get(overall, '❓')} {overall.upper()}")
            click.echo(f"⏱️  Timestamp: {health_report.timestamp}")
            click.echo(f"🕐 Uptime: {health_report.uptime_seconds:.1f}s")
            
            click.echo(f"\n🔍 Component Health:")
            for component in health_report.components:
                status = component.status.value
                emoji = status_emoji.get(status, '❓')
                response_time = f" ({component.response_time_ms:.1f}ms)" if component.response_time_ms else ""
                click.echo(f"  {emoji} {component.name}: {component.message}{response_time}")
            
            # Summary
            summary = health_report.summary
            click.echo(f"\n📊 Summary:")
            click.echo(f"  Total Components: {summary['total_components']}")
            click.echo(f"  Healthy: {summary['healthy_components']}")
            click.echo(f"  Warning: {summary['warning_components']}")
            click.echo(f"  Critical: {summary['critical_components']}")
            click.echo(f"  Health %: {summary['health_percentage']:.1f}%")
            
            if summary['average_response_time_ms']:
                click.echo(f"  Avg Response: {summary['average_response_time_ms']:.1f}ms")
        
    except Exception as e:
        click.echo(f"❌ Error checking health: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.argument('count', type=int)
@click.option('--timeout', default=60, help='Timeout in seconds')
def scale(count, timeout):
    """Scale workers to specified count"""
    click.echo(f"🔄 Scaling workers to {count}...")
    
    try:
        coordinator = create_cluster_coordinator()
        
        if coordinator.scale_workers(count):
            click.echo(f"✅ Workers scaled to {count}")
            
            # Wait a moment and show new status
            time.sleep(2)
            status = coordinator.get_status()
            workers = status.get('workers', {})
            click.echo(f"Current workers: {workers.get('running_workers', 0)}/{workers.get('total_workers', 0)}")
        else:
            click.echo("❌ Failed to scale workers", err=True)
            sys.exit(1)
            
    except Exception as e:
        click.echo(f"❌ Error scaling workers: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.argument('stream_name')
@click.argument('task_data')
@click.option('--count', default=1, help='Number of tasks to push')
def push(stream_name, task_data, count):
    """Push task(s) to queue"""
    click.echo(f"📤 Pushing {count} task(s) to {stream_name}...")
    
    try:
        coordinator = create_cluster_coordinator()
        
        # Parse task data as JSON
        try:
            data = json.loads(task_data)
        except json.JSONDecodeError:
            # Treat as simple string data
            data = {'message': task_data, 'timestamp': datetime.now().isoformat()}
        
        success_count = 0
        for i in range(count):
            task_id = coordinator.push_task(stream_name, {**data, 'sequence': i})
            if task_id:
                success_count += 1
                if count == 1:
                    click.echo(f"✅ Task pushed with ID: {task_id}")
        
        if count > 1:
            click.echo(f"✅ {success_count}/{count} tasks pushed successfully")
            
    except Exception as e:
        click.echo(f"❌ Error pushing task: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--key', required=True, help='Rate limit key')
@click.option('--limit', default=10, help='Request limit')
@click.option('--window', default=60, help='Time window in seconds') 
@click.option('--cost', default=1, help='Cost per request')
def ratelimit(key, limit, window, cost):
    """Check rate limit for a key"""
    click.echo(f"🚦 Checking rate limit for '{key}'...")
    
    try:
        limiter = get_rate_limiter()
        result = limiter.check_rate_limit(key, limit, window, cost)
        
        status = "✅ ALLOWED" if result.allowed else "❌ DENIED"
        click.echo(f"{status}")
        click.echo(f"  Tokens Remaining: {result.tokens_remaining}")
        click.echo(f"  Reset Time: {datetime.fromtimestamp(result.reset_time)}")
        
        if not result.allowed and result.retry_after:
            click.echo(f"  Retry After: {result.retry_after:.1f}s")
            
    except Exception as e:
        click.echo(f"❌ Error checking rate limit: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--node-id', help='Node ID for leadership attempt')
def leadership(node_id):
    """Try to acquire cluster leadership"""
    click.echo("🗳️  Attempting to acquire cluster leadership...")
    
    try:
        election = create_leader_election(node_id)
        
        # Check current leader
        current_leader = election.get_current_leader()
        if current_leader:
            click.echo(f"Current leader: {current_leader}")
        
        # Try to acquire leadership
        if election.acquire_leadership():
            click.echo("✅ Leadership acquired!")
            click.echo("Press Ctrl+C to release leadership...")
            
            try:
                while True:
                    time.sleep(5)
                    if not election.is_leader():
                        click.echo("⚠️ Lost leadership")
                        break
                    click.echo(f"👑 Holding leadership... (leader: {election.get_current_leader()})")
            except KeyboardInterrupt:
                pass
        else:
            click.echo("❌ Failed to acquire leadership")
            if current_leader:
                click.echo(f"Current leader is: {current_leader}")
        
    except Exception as e:
        click.echo(f"❌ Error with leadership: {e}", err=True)
    finally:
        if 'election' in locals():
            election.release_leadership()
            click.echo("🎖️  Leadership released")


@cli.command()
@click.option('--format', type=click.Choice(['json', 'yaml']), default='json', help='Output format')
def config(format):
    """Show cluster configuration"""
    try:
        config = get_cluster_config()
        
        if format == 'json':
            import dataclasses
            config_dict = dataclasses.asdict(config)
            click.echo(json.dumps(config_dict, indent=2, default=str))
        elif format == 'yaml':
            import yaml
            import dataclasses
            config_dict = dataclasses.asdict(config)
            click.echo(yaml.dump(config_dict, default_flow_style=False))
            
    except Exception as e:
        click.echo(f"❌ Error showing config: {e}", err=True)
        sys.exit(1)


@cli.command()
def test():
    """Run cluster component tests"""
    click.echo("🧪 Running StockSpot cluster tests...")
    
    try:
        import subprocess
        
        # Run the test suite
        result = subprocess.run([
            sys.executable, 
            'tests/test_cluster.py'
        ], capture_output=True, text=True)
        
        click.echo(result.stdout)
        if result.stderr:
            click.echo(result.stderr, err=True)
        
        if result.returncode == 0:
            click.echo("\n✅ All tests passed!")
        else:
            click.echo(f"\n❌ Tests failed (exit code: {result.returncode})")
            sys.exit(result.returncode)
            
    except Exception as e:
        click.echo(f"❌ Error running tests: {e}", err=True)
        sys.exit(1)


@cli.command()
@click.option('--follow', '-f', is_flag=True, help='Follow log output')
@click.option('--lines', '-n', default=50, help='Number of lines to show')
def logs(follow, lines):
    """Show cluster logs"""
    log_file = os.path.join('logs', 'cluster.log')
    
    if not os.path.exists(log_file):
        click.echo(f"❌ Log file not found: {log_file}")
        return
    
    try:
        if follow:
            click.echo(f"📜 Following cluster logs ({log_file})...")
            import subprocess
            subprocess.run(['tail', '-f', log_file])
        else:
            click.echo(f"📜 Last {lines} lines from cluster logs:")
            with open(log_file, 'r') as f:
                all_lines = f.readlines()
                for line in all_lines[-lines:]:
                    click.echo(line.rstrip())
                    
    except Exception as e:
        click.echo(f"❌ Error reading logs: {e}", err=True)


@cli.command()
@click.confirmation_option(prompt='Are you sure you want to stop the cluster?')
def stop():
    """Stop the cluster (if running via systemd/docker)"""
    click.echo("🛑 Stopping StockSpot cluster...")
    
    # This would typically interact with systemd, docker, or k8s
    # For now, just provide instructions
    click.echo("Manual stop instructions:")
    click.echo("  Docker: docker-compose -f docker-compose.cluster.yml down")
    click.echo("  K8s: kubectl delete namespace affilly-cluster")
    click.echo("  Local: Send SIGTERM to coordinator process")


if __name__ == '__main__':
    cli()