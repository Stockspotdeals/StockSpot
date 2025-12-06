#!/bin/bash
# AutoAffiliateHub-X2 Kubernetes Deployment Script
# 
# This script automates the deployment of the complete cluster to Kubernetes
# with proper dependency ordering and validation.

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="affilly-cluster"
MONITORING_NAMESPACE="affilly-monitoring"
IMAGE_NAME="affilly/cluster"
IMAGE_TAG="latest"

echo -e "${BLUE}🚀 AutoAffiliateHub-X2 Kubernetes Deployment${NC}"
echo "============================================"

# Function to print status
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to wait for pods to be ready
wait_for_pods() {
    local namespace=$1
    local app=$2
    local timeout=${3:-300}
    
    echo -e "${YELLOW}⏳ Waiting for $app pods in $namespace namespace...${NC}"
    
    kubectl wait --for=condition=Ready pods -l app=$app -n $namespace --timeout=${timeout}s
    
    if [ $? -eq 0 ]; then
        print_status "$app pods are ready"
    else
        print_error "$app pods failed to become ready within ${timeout}s"
        return 1
    fi
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Validate prerequisites
echo -e "${BLUE}🔍 Checking prerequisites...${NC}"

if ! command_exists kubectl; then
    print_error "kubectl is not installed or not in PATH"
    exit 1
fi

if ! command_exists docker; then
    print_error "docker is not installed or not in PATH"
    exit 1
fi

# Check kubectl cluster connection
if ! kubectl cluster-info >/dev/null 2>&1; then
    print_error "Cannot connect to Kubernetes cluster"
    echo "Please ensure kubectl is configured and cluster is accessible"
    exit 1
fi

print_status "Prerequisites validated"

# Build Docker images
echo -e "\n${BLUE}🏗️  Building Docker images...${NC}"

if [ -f "docker/Dockerfile.cluster" ]; then
    echo "Building cluster image..."
    docker build -f docker/Dockerfile.cluster -t $IMAGE_NAME:$IMAGE_TAG .
    
    if [ $? -eq 0 ]; then
        print_status "Docker image built successfully"
    else
        print_error "Failed to build Docker image"
        exit 1
    fi
else
    print_warning "Dockerfile.cluster not found, assuming image exists"
fi

# Load image to kind cluster (if using kind)
if kubectl config current-context | grep -q "kind"; then
    echo "Detected kind cluster, loading image..."
    kind load docker-image $IMAGE_NAME:$IMAGE_TAG
    print_status "Image loaded to kind cluster"
fi

# Deploy cluster resources
echo -e "\n${BLUE}🎯 Deploying cluster resources...${NC}"

# Create namespace
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
print_status "Namespace $NAMESPACE created/updated"

# Deploy Redis first
echo "Deploying Redis..."
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: $NAMESPACE
  labels:
    app: redis
    component: database
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7.2-alpine
        ports:
        - containerPort: 6379
          name: redis
        command: ["redis-server"]
        args: ["--appendonly", "yes", "--maxmemory", "1gb", "--maxmemory-policy", "allkeys-lru"]
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi" 
            cpu: "500m"
        livenessProbe:
          exec:
            command: ["redis-cli", "ping"]
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          exec:
            command: ["redis-cli", "ping"]
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: redis-service
  namespace: $NAMESPACE
  labels:
    app: redis
spec:
  ports:
  - port: 6379
    targetPort: 6379
    name: redis
  selector:
    app: redis
  type: ClusterIP
EOF

wait_for_pods $NAMESPACE "redis" 120

# Deploy ConfigMap
echo "Deploying configuration..."
kubectl apply -f k8s/cluster-deployment.yaml -n $NAMESPACE
print_status "Configuration deployed"

# Deploy coordinator
echo "Deploying coordinator..."
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: coordinator
  namespace: $NAMESPACE
  labels:
    app: coordinator
    component: management
spec:
  replicas: 1
  selector:
    matchLabels:
      app: coordinator
  template:
    metadata:
      labels:
        app: coordinator
    spec:
      containers:
      - name: coordinator
        image: $IMAGE_NAME:$IMAGE_TAG
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 8080
          name: health
        env:
        - name: REDIS_HOST
          value: "redis-service"
        - name: REDIS_PORT
          value: "6379"
        - name: CLUSTER_NODE_TYPE
          value: "coordinator"
        - name: LOG_LEVEL
          value: "INFO"
        - name: CLUSTER_MAX_WORKERS
          value: "10"
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 60
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: coordinator-service
  namespace: $NAMESPACE
  labels:
    app: coordinator
spec:
  ports:
  - port: 8080
    targetPort: 8080
    name: health
  selector:
    app: coordinator
  type: ClusterIP
EOF

wait_for_pods $NAMESPACE "coordinator" 180

# Deploy workers
echo "Deploying workers..."
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
  namespace: $NAMESPACE
  labels:
    app: worker
    component: processing
spec:
  replicas: 3
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      containers:
      - name: worker
        image: $IMAGE_NAME:$IMAGE_TAG
        imagePullPolicy: IfNotPresent
        env:
        - name: REDIS_HOST
          value: "redis-service"
        - name: REDIS_PORT
          value: "6379"
        - name: CLUSTER_NODE_TYPE
          value: "worker"
        - name: LOG_LEVEL
          value: "INFO"
        - name: WORKER_ID
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
        livenessProbe:
          exec:
            command: ["python", "/app/health_check.py"]
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          exec:
            command: ["python", "/app/health_check.py"]
          initialDelaySeconds: 15
          periodSeconds: 15
EOF

wait_for_pods $NAMESPACE "worker" 120

# Deploy dashboard
echo "Deploying dashboard..."
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dashboard
  namespace: $NAMESPACE
  labels:
    app: dashboard
    component: interface
spec:
  replicas: 2
  selector:
    matchLabels:
      app: dashboard
  template:
    metadata:
      labels:
        app: dashboard
    spec:
      containers:
      - name: dashboard
        image: $IMAGE_NAME:$IMAGE_TAG
        imagePullPolicy: IfNotPresent
        ports:
        - containerPort: 5000
          name: http
        env:
        - name: REDIS_HOST
          value: "redis-service"
        - name: REDIS_PORT
          value: "6379"
        - name: CLUSTER_NODE_TYPE
          value: "dashboard"
        - name: FLASK_ENV
          value: "production"
        - name: LOG_LEVEL
          value: "INFO"
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 30
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health
            port: 5000
          initialDelaySeconds: 15
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: dashboard-service
  namespace: $NAMESPACE
  labels:
    app: dashboard
spec:
  ports:
  - port: 80
    targetPort: 5000
    name: http
  selector:
    app: dashboard
  type: ClusterIP
EOF

wait_for_pods $NAMESPACE "dashboard" 120

# Deploy HPA (optional)
echo "Deploying HorizontalPodAutoscaler..."
kubectl apply -f - <<EOF
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: worker-hpa
  namespace: $NAMESPACE
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
EOF

print_status "HorizontalPodAutoscaler deployed"

# Deploy monitoring (optional)
if [ "$1" = "--with-monitoring" ]; then
    echo -e "\n${BLUE}📊 Deploying monitoring stack...${NC}"
    
    kubectl create namespace $MONITORING_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    kubectl apply -f k8s/monitoring.yaml
    
    wait_for_pods $MONITORING_NAMESPACE "prometheus" 180
    wait_for_pods $MONITORING_NAMESPACE "grafana" 120
    
    print_status "Monitoring stack deployed"
fi

# Validate deployment
echo -e "\n${BLUE}🔍 Validating deployment...${NC}"

# Check all pods are running
echo "Checking pod status..."
kubectl get pods -n $NAMESPACE

# Check services
echo -e "\nChecking services..."
kubectl get services -n $NAMESPACE

# Check HPA status
echo -e "\nChecking HPA status..."
kubectl get hpa -n $NAMESPACE

# Get cluster status
echo -e "\n${BLUE}📊 Cluster Status${NC}"
echo "==================="

REDIS_STATUS=$(kubectl get pods -n $NAMESPACE -l app=redis -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not Found")
COORDINATOR_STATUS=$(kubectl get pods -n $NAMESPACE -l app=coordinator -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not Found")
WORKER_COUNT=$(kubectl get pods -n $NAMESPACE -l app=worker --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
DASHBOARD_STATUS=$(kubectl get pods -n $NAMESPACE -l app=dashboard -o jsonpath='{.items[0].status.phase}' 2>/dev/null || echo "Not Found")

echo "Redis Status: $REDIS_STATUS"
echo "Coordinator Status: $COORDINATOR_STATUS" 
echo "Running Workers: $WORKER_COUNT"
echo "Dashboard Status: $DASHBOARD_STATUS"

# Port forwarding instructions
echo -e "\n${BLUE}🌐 Access Instructions${NC}"
echo "======================="
echo "To access the dashboard:"
echo "  kubectl port-forward -n $NAMESPACE service/dashboard-service 8080:80"
echo "  Then open: http://localhost:8080"
echo ""
echo "To access coordinator health endpoint:"
echo "  kubectl port-forward -n $NAMESPACE service/coordinator-service 8081:8080" 
echo "  Then open: http://localhost:8081/health"

if [ "$1" = "--with-monitoring" ]; then
    echo ""
    echo "To access Grafana:"
    echo "  kubectl port-forward -n $MONITORING_NAMESPACE service/grafana-service 3000:3000"
    echo "  Then open: http://localhost:3000 (admin/affilly123)"
    echo ""
    echo "To access Prometheus:"
    echo "  kubectl port-forward -n $MONITORING_NAMESPACE service/prometheus-service 9090:9090"
    echo "  Then open: http://localhost:9090"
fi

# Cleanup instructions
echo -e "\n${BLUE}🗑️  Cleanup Instructions${NC}"
echo "========================"
echo "To remove the deployment:"
echo "  kubectl delete namespace $NAMESPACE"
if [ "$1" = "--with-monitoring" ]; then
    echo "  kubectl delete namespace $MONITORING_NAMESPACE"
fi

print_status "Deployment completed successfully!"
echo -e "\n${GREEN}🎉 AutoAffiliateHub-X2 cluster is now running on Kubernetes!${NC}"