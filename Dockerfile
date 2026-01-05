# StockSpot Docker Image
# Node.js 20 LTS Alpine - Optimized for Reddit autonomous deal bot
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Set environment variables for production
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=error \
    DRY_RUN=true \
    OBSERVER_MODE=true

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && \
    npm cache clean --force

# Copy all source files
COPY . .

# Build TypeScript if needed
RUN npm run build || true

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app
USER nodejs

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start StockSpot in observer + dry-run mode (safe startup)
CMD ["npm", "start"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:5000/health || exit 1

# Run the application
CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--timeout", "120", "app.dashboard:app"]