# StockSpot Node.js Backend

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your actual API keys and credentials
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Development Mode**
   ```bash
   npm run dev
   ```

## Server Information

- **Port**: 3001 (configurable via PORT environment variable)
- **Health Check**: `GET /api/health`
- **API Documentation**: `GET /api/info`

## API Endpoints

### Core Endpoints
- `GET /api/health` - Server health check
- `GET /api/info` - API information and available endpoints

### Deal Management
- `GET /api/deals` - Get deals (TODO: implement)
- `POST /api/deals` - Create new deal (TODO: implement)

### Analytics
- `GET /api/analytics` - Get analytics data (TODO: implement)

### Social Media
- `POST /api/twitter/post` - Post to Twitter (TODO: implement)

### E-commerce Integration
- `GET /api/amazon/products` - Search Amazon products (TODO: implement)
- `POST /api/links/shorten` - Shorten URLs with tracking (TODO: implement)

## Environment Variables

See `.env.example` for all available configuration options.

### Required
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port

### Optional (Features will be disabled if not set)
- `TWITTER_CLIENT_ID` - Twitter API access
- `AMAZON_ACCESS_KEY` - Amazon Product API
- `URLGENIUS_API_KEY` - Link shortening
- `JWT_SECRET` - Authentication
- `DATABASE_URL` - Database connection

## Deployment

### Render.com
The project is configured for Render deployment:
- Build command: `npm install`
- Start command: `npm start`

### Heroku
```bash
heroku create your-app-name
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=your-secret
# Add other environment variables
git push heroku main
```

### Railway
```bash
railway login
railway new
railway add
railway up
```

## Development

### File Structure
```
/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── .env.example           # Environment template
├── frontend/
│   └── build/             # React build output
├── static/                # Legacy static files
└── templates/             # Legacy HTML templates
```

### Adding New API Endpoints

1. Add route handlers in `server.js`
2. Follow the existing pattern with error handling
3. Add endpoint documentation to `/api/info`
4. Test with the frontend testing interface

### Frontend Integration

The server serves a React app from `/frontend/build/`. To integrate with React:

1. Create React app in `/frontend/`
2. Build React app to `/frontend/build/`
3. Use `/api/*` for all API calls

## Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Configure all required environment variables
- [ ] Set up SSL/HTTPS
- [ ] Configure database
- [ ] Set up monitoring (optional)
- [ ] Configure backup strategy
- [ ] Set up CI/CD pipeline

## Support

For questions or issues, check the GitHub repository or create an issue.