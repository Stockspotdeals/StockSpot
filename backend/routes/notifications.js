/**
 * Notification API Routes
 * Endpoints for managing notifications, RSS feeds, and user preferences
 */

const express = require('express');
const router = express.Router();
const { NotificationManager } = require('../notifications/NotificationManager');
const { RSSFeedManager } = require('../notifications/RSSFeedManager');
const { NotificationQueue } = require('../notifications/NotificationQueue');
const { User } = require('../models/User');

// Initialize managers
const notificationManager = new NotificationManager();
const rssManager = new RSSFeedManager();
const queue = new NotificationQueue();

/**
 * GET /api/notifications/health
 * Health check for notification system
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'operational',
    mode: process.env.DRY_RUN === 'true' ? 'dry-run' : 'production',
    isDryRun: process.env.DRY_RUN === 'true',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/notifications/stats
 * Get system-wide notification statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const managerStats = notificationManager.getStats();
    const queueStats = await queue.getStats();

    res.json({
      manager: managerStats,
      queue: queueStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/process
 * Manually trigger notification processing for all users
 * (Typically called by cron job)
 */
router.post('/process', async (req, res) => {
  try {
    // Get all active users
    const users = await User.find({ isActive: true }).select('-password');

    if (users.length === 0) {
      return res.json({
        success: true,
        processed: 0,
        message: 'No active users to process'
      });
    }

    // Process notifications
    const results = await notificationManager.processAllFeeds(users);
    const stats = notificationManager.getStats();

    res.json({
      success: true,
      processed: results.success,
      failed: results.failed,
      stats: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notifications/user/:userId
 * Get notification history for a specific user
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { status, limit = 50 } = req.query;

    const notifications = await queue.getUserNotifications(userId, status, parseInt(limit));

    res.json({
      userId,
      count: notifications.length,
      notifications,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/user/:userId/send-now
 * Manually trigger notifications for a specific user
 */
router.post('/user/:userId/send-now', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await notificationManager.processUserNotifications(user);

    res.json({
      success: result.success,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/notifications/preferences/:userId
 * Get notification preferences for a user
 */
router.get('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('preferences subscriptions');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      userId,
      preferences: user.preferences,
      subscriptions: user.subscriptions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/notifications/preferences/:userId
 * Update notification preferences for a user
 */
router.put('/preferences/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { preferences, subscriptions } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (preferences) {
      Object.assign(user.preferences, preferences);
    }

    if (subscriptions) {
      Object.assign(user.subscriptions, subscriptions);
    }

    await user.save();

    res.json({
      success: true,
      preferences: user.preferences,
      subscriptions: user.subscriptions,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /feeds/user-:userId.xml
 * Serve user's RSS feed
 */
router.get('/feeds/user-:userId.xml', async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user exists and has RSS enabled
    const user = await User.findById(userId);
    if (!user || !user.preferences.rssEnabled) {
      return res.status(404).json({ error: 'Feed not found' });
    }

    // Serve the feed
    await rssManager.serveUserFeed(userId, res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /feeds/public.xml
 * Serve public RSS feed (all deals)
 */
router.get('/feeds/public.xml', (req, res) => {
  try {
    const items = notificationManager.getMockFeedItems();
    const publicFeed = rssManager.generatePublicFeed(items);

    res.set('Content-Type', 'application/rss+xml');
    res.send(publicFeed);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/queue/cleanup
 * Clean up old notifications (admin only)
 */
router.post('/queue/cleanup', async (req, res) => {
  try {
    const { daysOld = 30 } = req.body;

    const result = await queue.cleanup(daysOld);

    res.json({
      success: true,
      deleted: result.deleted,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/notifications/manual-item/:userId
 * Add a manual item for monitoring (YEARLY tier only)
 */
router.post('/manual-item/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { url, productName, targetPrice } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.tier !== 'YEARLY') {
      return res.status(403).json({ error: 'Only YEARLY tier users can add manual items' });
    }

    const manualItem = {
      _id: new require('mongoose').Types.ObjectId(),
      url,
      productName,
      targetPrice,
      addedDate: new Date(),
      active: true
    };

    user.manualItems.push(manualItem);
    await user.save();

    res.json({
      success: true,
      manualItem,
      totalManualItems: user.manualItems.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/notifications/manual-item/:userId/:itemId
 * Remove a manual item
 */
router.delete('/manual-item/:userId/:itemId', async (req, res) => {
  try {
    const { userId, itemId } = req.params;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.manualItems = user.manualItems.filter(item => item._id.toString() !== itemId);
    await user.save();

    res.json({
      success: true,
      removed: itemId,
      remainingItems: user.manualItems.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
