# StockSpot Notifications Module

Complete email/RSS notification system for multi-retailer deal aggregation.

## Architecture

### Core Components

1. **NotificationManager** (`backend/notifications/NotificationManager.js`)
   - Orchestrates feed fetching and processing
   - Applies tier-based filtering and delays
   - Coordinates email and RSS delivery

2. **EmailProvider** (`backend/notifications/EmailProvider.js`)
   - Multi-provider support (SendGrid, Nodemailer)
   - HTML and plain-text email generation
   - Dry-run mode for testing

3. **RSSFeedManager** (`backend/notifications/RSSFeedManager.js`)
   - Per-user RSS feed generation
   - Public feed for all deals
   - XML formatting and persistence

4. **NotificationQueue** (`backend/notifications/NotificationQueue.js`)
   - Queue management with MongoDB persistence
   - Retry logic and delivery tracking
   - Scheduled notification delivery

5. **User Model** (`backend/models/User.js`)
   - MongoDB schema with subscription tiers
   - Notification preferences
   - Manual item tracking (YEARLY tier)

## Features

### Tier-Based Filtering

- **FREE**: 10-minute delay for non-Amazon items, instant for Amazon
- **PAID**: Instant notifications for all items
- **YEARLY**: Instant notifications + manual item monitoring

### Multi-Retailer Support

- Amazon (affiliate)
- Walmart
- Target
- Best Buy
- GameStop
- Pokemon TCG
- One Piece TCG
- Magic: The Gathering
- NBA/NFL/MLB Sports Cards

### Email Delivery

```javascript
// Automatic HTML formatting
// Branded StockSpot template
// Discount highlights
// Direct product links
// Preference management
```

### RSS Feeds

- Per-user feeds: `/feeds/user-{userId}.xml`
- Public feed: `/feeds/public.xml`
- Auto-updates on new items
- Full product information

## Environment Configuration

```bash
# Email Provider
EMAIL_SERVICE=sendgrid  # or "nodemailer"
SENDGRID_API_KEY=your_key_here
EMAIL_FROM=noreply@stockspot.com

# Or for Nodemailer
EMAIL_SMTP_SERVICE=gmail
EMAIL_FROM=your-email@gmail.com
EMAIL_PASSWORD=app-password

# Frontend
FRONTEND_URL=http://localhost:3000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/stockspot

# Testing
DRY_RUN=true
```

## API Endpoints

### System Health

```
GET /api/notifications/health
GET /api/notifications/stats
```

### Process Notifications

```
POST /api/notifications/process
// Manually trigger processing for all users
```

### User Notifications

```
GET /api/notifications/user/:userId
GET /api/notifications/user/:userId?status=pending&limit=50

POST /api/notifications/user/:userId/send-now
// Manually trigger for one user
```

### Preferences

```
GET /api/notifications/preferences/:userId
PUT /api/notifications/preferences/:userId
// Update notification and subscription preferences
```

### Manual Items (YEARLY tier)

```
POST /api/notifications/manual-item/:userId
{
  "url": "https://amazon.com/product",
  "productName": "Amazing Widget",
  "targetPrice": 99.99
}

DELETE /api/notifications/manual-item/:userId/:itemId
```

### RSS Feeds

```
GET /feeds/user-{userId}.xml
GET /feeds/public.xml
```

## Usage Examples

### Process Notifications for All Users

```javascript
const { NotificationManager } = require('./backend/notifications/NotificationManager');
const { User } = require('./backend/models/User');

const manager = new NotificationManager();
const users = await User.find({ isActive: true });

const results = await manager.processAllFeeds(users);
console.log(`Processed: ${results.success}, Failed: ${results.failed}`);
```

### Send Email to Specific User

```javascript
const user = await User.findById(userId);
const items = manager.getMockFeedItems();
const filtered = manager.applyTierFiltering(items, user);

await manager.sendEmailNotification(user, filtered);
```

### Generate User RSS Feed

```javascript
const { RSSFeedManager } = require('./backend/notifications/RSSFeedManager');

const rssManager = new RSSFeedManager();
const items = [...];

await rssManager.updateUserFeed(userId, items);
const feedUrl = rssManager.getUserFeedUrl(userId);
```

### Manage Notification Queue

```javascript
const { NotificationQueue } = require('./backend/notifications/NotificationQueue');

const queue = new NotificationQueue();

// Enqueue
await queue.enqueue(userId, items, 'email');

// Process queue
const results = await queue.dequeueAndProcess(processor);

// Get stats
const stats = await queue.getStats();
```

## Testing

Run the comprehensive test suite:

```bash
npm run test:notifications
# or
node tests/notification-test.js
```

Tests cover:
- ✅ Tier filtering logic
- ✅ Email generation (HTML & plain text)
- ✅ RSS feed generation
- ✅ Queue management
- ✅ Manager integration

## Dry-Run Mode

All components support dry-run testing:

```bash
DRY_RUN=true node tests/notification-test.js
```

In dry-run mode:
- No emails are actually sent
- No files are written
- No MongoDB connections required
- All logic is tested with mock data

## Integration Steps

1. **Install package**
   ```bash
   npm install
   ```

2. **Configure environment** (see Environment Configuration)

3. **Add to Express app**
   ```javascript
   const notificationRouter = require('./backend/routes/notifications');
   app.use('/api/notifications', notificationRouter);
   ```

4. **Set up cron job** (optional, for automatic processing)
   ```javascript
   const cron = require('node-cron');
   const { NotificationManager } = require('./backend/notifications/NotificationManager');
   
   cron.schedule('*/5 * * * *', async () => {
     const manager = new NotificationManager();
     const users = await User.find({ isActive: true });
     await manager.processAllFeeds(users);
   });
   ```

5. **Test system**
   ```bash
   npm run test:notifications
   ```

## Production Deployment

### SendGrid Setup

1. Create SendGrid account
2. Generate API key
3. Set `SENDGRID_API_KEY` environment variable
4. `EMAIL_SERVICE=sendgrid`

### Nodemailer Setup

1. Use Gmail app-password or own SMTP server
2. Set environment variables:
   - `EMAIL_SMTP_SERVICE`
   - `EMAIL_FROM`
   - `EMAIL_PASSWORD`
3. `EMAIL_SERVICE=nodemailer`

### MongoDB

```javascript
// Ensure TTL index for auto-cleanup
db.notificationqueues.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 2592000 }  // 30 days
)
```

### Cron Jobs

```
# Process notifications every 5 minutes
*/5 * * * * curl -X POST http://localhost:3000/api/notifications/process

# Clean up old notifications daily
0 2 * * * curl -X POST http://localhost:3000/api/notifications/queue/cleanup -d '{"daysOld": 30}'
```

## Performance Considerations

- Uses MongoDB indexes for fast queries
- Batch processing for multiple users
- Queue-based delivery with retries
- TTL indexes for automatic cleanup
- RSS feeds cached and updated incrementally

## Error Handling

- Automatic retry logic (up to 3 retries)
- Detailed error logging
- Failed notifications tracked in queue
- Graceful degradation if email provider unavailable

## Security

- No sensitive data in logs
- API keys never logged
- User email validation
- HTTPS required in production
- MongoDB authentication required

## Troubleshooting

### Emails not sending

1. Check `EMAIL_SERVICE` environment variable
2. Verify API key/password
3. Check spam folder
4. Enable "Less secure apps" for Gmail (if using)

### RSS feeds not updating

1. Verify `FRONTEND_URL` is correct
2. Check `/feeds` directory permissions
3. Ensure RSS enabled in user preferences

### Notifications not processing

1. Check MongoDB connection
2. Run health check: `GET /api/notifications/health`
3. Check queue stats: `GET /api/notifications/stats`
4. Review logs for errors

## Support & Contribution

For issues or improvements, please:
1. Check existing documentation
2. Review test cases
3. Test in DRY_RUN mode first
4. Submit pull request with tests

---

**Last Updated**: January 2026
**Version**: 2.0.0
**Status**: Production Ready
