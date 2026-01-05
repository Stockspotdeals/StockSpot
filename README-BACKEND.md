# StockSpot Backend API

Production-ready Express.js backend for the StockSpot affiliate marketing automation platform. Handles API requests, serves the frontend, and manages integrations with external services.

## 🔧 Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.x
- **Security**: Helmet, CORS, Rate limiting
- **Authentication**: JWT (ready for implementation)
- **Logging**: Morgan
- **Environment**: dotenv

## ⚡ Quick Start

### Installation
```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your API credentials
nano .env

# Start the server
npm start
```

### Development Mode
```bash
# Start with auto-reload
npm run dev

# Run tests
npm test

# Lint code
npm run lint
```

## 🌐 Server Configuration

- **Port**: 3001 (configurable via `PORT` environment variable)
- **Frontend**: Serves React build from `/frontend/build`
- **Static Files**: Legacy assets served from `/static`
- **API Base**: All endpoints under `/api/`

## 📡 API Endpoints

### Health & Info
- `GET /api/health` - Server health check with uptime and environment info
- `GET /api/info` - API documentation and available endpoints

### Deal Management
- `GET /api/deals` - Retrieve deals with pagination and filtering
- `POST /api/deals` - Create new deal (requires authentication)

### Analytics
- `GET /api/analytics` - Performance metrics and revenue data

### Social Media Integration
- `POST /api/twitter/post` - Post content to Twitter/X
- `GET /api/twitter/status` - Check Twitter API connection

### E-commerce APIs
- `GET /api/amazon/products` - Search Amazon products via PA-API
- `POST /api/amazon/affiliate` - Generate affiliate links

### URL Management  
- `POST /api/links/shorten` - Create tracked short URLs
- `GET /api/links/stats` - URL click statistics

## 🔐 Environment Variables

### Required Variables
```env
NODE_ENV=production
PORT=3001
JWT_SECRET=your-secure-jwt-secret
```

### Amazon Integration
```env
AMAZON_ACCESS_KEY=your-amazon-access-key
AMAZON_SECRET_KEY=your-amazon-secret-key  
AMAZON_ASSOCIATE_TAG=your-associate-tag-20
AMAZON_MARKETPLACE=webservices.amazon.com
```

### Twitter/X API
```env
TWITTER_CLIENT_ID=your-twitter-client-id
TWITTER_CLIENT_SECRET=your-twitter-client-secret
TWITTER_ACCESS_TOKEN=your-access-token
TWITTER_ACCESS_TOKEN_SECRET=your-token-secret
TWITTER_BEARER_TOKEN=your-bearer-token
```

### Additional Services
```env
URLGENIUS_API_KEY=your-urlgenius-key
FRONTEND_URL=https://your-domain.com
DATABASE_URL=postgresql://user:pass@localhost:5432/stockspot
REDIS_URL=redis://localhost:6379
```

## 🔒 Security Features

### Implemented
- **Helmet.js**: Security headers and CSP policies
- **CORS**: Cross-origin request management
- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Input Validation**: Request body sanitization
- **Environment-based Config**: No hardcoded secrets

### Content Security Policy
```javascript
contentSecurityPolicy: {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:", "http:"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    connectSrc: ["'self'", "https://api.twitter.com", "https://webservices.amazon.com"]
  }
}
```

## 🚀 Deployment

### Render.com (Recommended)
```yaml
# render.yaml configuration included
services:
  - type: web
    name: stockspot-backend
    env: node
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
```

### Heroku
```bash
# Uses included Procfile
web: node server.js

# Deploy commands
heroku create your-app-name
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret
git push heroku main
```

### Docker
```bash
# Build image
docker build -t stockspot-backend .

# Run container
docker run -d --env-file .env -p 3001:3001 stockspot-backend
```

## 🔄 Background Workers

The backend coordinates with Python workers for automation tasks:

### Python Integration
- **Auto Scheduler**: `python app/auto_scheduler.py`
- **Deal Engine**: Discovers and processes deals
- **Posting Engine**: Handles social media automation
- **Queue Manager**: Manages posting schedules

### Worker Communication
- Shared file system for job queues (`job_queue.json`)
- Database integration for persistent data
- Redis for real-time coordination (optional)

## 📊 Monitoring & Logging

### Health Checks
```bash
# Basic health check
curl http://localhost:3001/api/health

# Expected response
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 3600.123,
  "environment": "production",
  "version": "1.0.0"
}
```

### Logging
- **Morgan**: HTTP request logging
- **Console**: Application-level logs
- **Error Tracking**: Structured error responses

## 🧪 Development

### Project Structure
```
backend/
├── server.js           # Main application entry
├── package.json        # Dependencies and scripts  
├── .env.example        # Environment template
├── routes/            # API route handlers (planned)
├── middleware/        # Custom middleware (planned)
├── models/           # Data models (planned)
└── utils/            # Helper functions (planned)
```

### Adding New Endpoints
1. Define route handler in `server.js`
2. Add validation and error handling
3. Update `/api/info` endpoint documentation
4. Add tests for the new functionality

### Database Integration
```javascript
// Planned database configuration
const DATABASE_URL = process.env.DATABASE_URL;
// PostgreSQL/MySQL connection setup
// Prisma/TypeORM integration
```

## 🎯 Performance

### Optimizations
- **Compression**: Gzip compression enabled
- **Caching**: Static file caching headers
- **Rate Limiting**: Protects against abuse
- **Connection Pooling**: Database connection management

### Monitoring
- Request/response times via Morgan logging
- Error rates and API endpoint usage
- Resource utilization metrics

## 🔗 Integration Points

### Frontend Communication
- Serves React build files from `/frontend/build`
- API endpoints prefixed with `/api/`
- Static assets served from `/static/`

### Python Worker Integration
- File-based job queues
- Shared configuration via `.env`
- Process coordination for automation tasks

### External APIs
- Amazon Product Advertising API
- Twitter/X API v2
- URL shortening services
- Social media platforms

## 🐛 Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Check what's using port 3001
lsof -i :3001
# Or use different port
PORT=3002 npm start
```

**Missing Environment Variables**
- Check `.env` file exists and has required variables
- Verify API credentials are correct and active
- Review console warnings on startup

**API Rate Limits**
- Check rate limiting configuration
- Monitor API quota usage
- Implement proper backoff strategies

### Debug Mode
```bash
# Enable detailed logging
DEBUG=true npm start

# Development environment
NODE_ENV=development npm run dev
```

## 📚 API Documentation

Full API documentation available at:
- `GET /api/info` - Interactive endpoint listing
- Postman collection (planned)
- OpenAPI/Swagger documentation (planned)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-endpoint`)
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

---

**StockSpot Backend** - Powering intelligent affiliate marketing automation.