#!/bin/bash
# AutoAffiliateHub-X2 Cluster Coordinator Startup Script

set -e

echo "🚀 Starting AutoAffiliateHub-X2 Cluster Coordinator..."

# Set default environment variables
export REDIS_HOST=${REDIS_HOST:-localhost}
export REDIS_PORT=${REDIS_PORT:-6379}
export LOG_LEVEL=${LOG_LEVEL:-INFO}
export CLUSTER_NODE_TYPE=${CLUSTER_NODE_TYPE:-coordinator}
export CLUSTER_MAX_WORKERS=${CLUSTER_MAX_WORKERS:-4}

# Create log directory
mkdir -p /app/logs

# Wait for Redis to be available
echo "⏳ Waiting for Redis at ${REDIS_HOST}:${REDIS_PORT}..."
while ! nc -z ${REDIS_HOST} ${REDIS_PORT}; do
    sleep 1
done
echo "✅ Redis is available"

# Start health check endpoint in background
echo "🏥 Starting health check endpoint on port 8080..."
python -c "
import time
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from app.cluster.health import get_health_checker

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            try:
                health = get_health_checker().get_health()
                if health.status.value == 'healthy':
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{\"status\": \"healthy\"}')
                else:
                    self.send_response(503)
                    self.send_header('Content-type', 'application/json')  
                    self.end_headers()
                    self.wfile.write(f'{{\"status\": \"{health.status.value}\"}}'.encode())
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(f'{{\"error\": \"{str(e)}\"}}'.encode())
        else:
            self.send_response(404)
            self.end_headers()
    
    def log_message(self, format, *args):
        pass  # Suppress default logging

def run_health_server():
    server = HTTPServer(('0.0.0.0', 8080), HealthHandler)
    server.serve_forever()

# Start health server in background thread
health_thread = threading.Thread(target=run_health_server, daemon=True)
health_thread.start()

print('Health endpoint started on port 8080')
" &

# Start the coordinator
echo "🎯 Starting cluster coordinator..."
exec python -c "
import sys
import logging
from app.cluster import create_cluster_coordinator
from app.auto_scheduler import AutoScheduler

# Set up logging
logging.basicConfig(
    level='${LOG_LEVEL}',
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Define worker function that integrates with existing AutoAffiliateHub
def affilly_worker_function(monitoring_context=None, **kwargs):
    '''Worker function that processes AutoAffiliateHub tasks'''
    if monitoring_context:
        logger = monitoring_context['logger']
        worker_id = monitoring_context['worker_id'] 
        shutdown_event = monitoring_context['shutdown_event']
        
        logger.info(f'AutoAffiliateHub worker {worker_id} starting')
        
        # Initialize scheduler for this worker
        scheduler = AutoScheduler()
        
        try:
            task_count = 0
            while not shutdown_event.is_set():
                # Process one cycle of tasks
                try:
                    processed = scheduler.process_cycle()
                    if processed:
                        task_count += processed
                        logger.info(f'Worker {worker_id} processed {processed} tasks (total: {task_count})')
                    
                    # Brief sleep to prevent busy waiting
                    if shutdown_event.wait(5.0):  # 5 second intervals
                        break
                        
                except Exception as e:
                    logger.error(f'Worker {worker_id} error in processing cycle: {e}')
                    if shutdown_event.wait(10.0):  # Wait longer on error
                        break
                        
        except Exception as e:
            logger.error(f'Worker {worker_id} fatal error: {e}')
        finally:
            logger.info(f'Worker {worker_id} shutting down after {task_count} tasks')

try:
    # Create and start coordinator
    coordinator = create_cluster_coordinator(affilly_worker_function)
    
    if coordinator.start():
        print('✅ Coordinator started successfully')
        
        # Run forever with status reporting
        coordinator.run_forever(check_interval=30.0)
    else:
        print('❌ Failed to start coordinator')
        sys.exit(1)
        
except KeyboardInterrupt:
    print('⚠️ Received shutdown signal')
    if 'coordinator' in locals():
        coordinator.stop()
    sys.exit(0)
except Exception as e:
    print(f'❌ Coordinator failed: {e}')
    sys.exit(1)
"