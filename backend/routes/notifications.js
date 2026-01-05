const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');
const { NotificationService } = require('../services/NotificationService');
const { NotificationChannel, NotificationEvent, CHANNEL_TYPES } = require('../models/Notification');

const router = express.Router();
const notificationService = new NotificationService();

/**
 * GET /api/notifications/channels - Get user's notification channels
 */
router.get('/channels', authenticateToken, async (req, res) => {
  try {
    const channels = await NotificationChannel.find({ userId: req.user.userId })
      .sort('-createdAt')
      .lean();
    
    res.json({ channels });
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Failed to fetch notification channels' });
  }
});

/**
 * POST /api/notifications/channels - Add a new notification channel
 */
router.post('/channels', authenticateToken, rateLimiter, async (req, res) => {
  try {
    const { channelType, destination, displayName, configuration = {} } = req.body;
    
    if (!channelType || !destination) {
      return res.status(400).json({ error: 'Channel type and destination are required' });
    }
    
    if (!Object.values(CHANNEL_TYPES).includes(channelType)) {
      return res.status(400).json({ error: 'Invalid channel type' });
    }
    
    // Validate destination based on channel type
    const validation = validateDestination(channelType, destination);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }
    
    // Check if channel already exists
    const existingChannel = await NotificationChannel.findOne({
      userId: req.user.userId,
      channelType,
      destination: validation.normalizedDestination || destination
    });
    
    if (existingChannel) {
      return res.status(409).json({ 
        error: 'Channel already exists',
        channelId: existingChannel._id
      });
    }
    
    const channel = new NotificationChannel({
      userId: req.user.userId,
      channelType,
      destination: validation.normalizedDestination || destination,
      displayName: displayName || `${channelType} - ${destination}`,
      configuration: new Map(Object.entries(configuration)),
      isVerified: channelType === CHANNEL_TYPES.EMAIL ? false : true // Email requires verification
    });
    
    await channel.save();
    
    // Send verification for email channels
    if (channelType === CHANNEL_TYPES.EMAIL) {
      // TODO: Send verification email
      // For now, we'll mark as verified in development
      if (process.env.NODE_ENV === 'development') {
        channel.isVerified = true;
        await channel.save();
      }
    }
    
    res.status(201).json({
      message: 'Notification channel added successfully',
      channel,
      requiresVerification: channelType === CHANNEL_TYPES.EMAIL && process.env.NODE_ENV !== 'development'
    });
    
  } catch (error) {
    console.error('Error adding channel:', error);
    res.status(500).json({ error: 'Failed to add notification channel' });
  }
});

/**
 * PATCH /api/notifications/channels/:id - Update notification channel
 */
router.patch('/channels/:id', authenticateToken, rateLimiter, async (req, res) => {
  try {
    const { displayName, configuration, isActive } = req.body;
    
    const channel = await NotificationChannel.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    const updates = {};
    
    if (displayName !== undefined) {
      updates.displayName = displayName;
    }
    
    if (configuration !== undefined) {
      updates.configuration = new Map(Object.entries(configuration));
    }
    
    if (isActive !== undefined) {
      updates.isActive = isActive;
    }
    
    const updatedChannel = await NotificationChannel.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );
    
    res.json({
      message: 'Channel updated successfully',
      channel: updatedChannel
    });
    
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({ error: 'Failed to update channel' });
  }
});

/**
 * DELETE /api/notifications/channels/:id - Remove notification channel
 */
router.delete('/channels/:id', authenticateToken, async (req, res) => {
  try {
    const channel = await NotificationChannel.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    await NotificationChannel.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Channel removed successfully' });
    
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: 'Failed to remove channel' });
  }
});

/**
 * POST /api/notifications/channels/:id/test - Test notification channel
 */
router.post('/channels/:id/test', authenticateToken, rateLimiter, async (req, res) => {
  try {
    const channel = await NotificationChannel.findOne({
      _id: req.params.id,
      userId: req.user.userId
    });
    
    if (!channel) {
      return res.status(404).json({ error: 'Channel not found' });
    }
    
    if (!channel.isActive) {
      return res.status(400).json({ error: 'Channel is not active' });
    }
    
    const result = await notificationService.testNotificationChannel(req.params.id);
    
    if (result.success) {
      res.json({
        message: 'Test notification sent successfully',
        externalId: result.externalId
      });
    } else {
      res.status(400).json({
        error: 'Failed to send test notification',
        details: result.error
      });
    }
    
  } catch (error) {
    console.error('Error testing channel:', error);
    res.status(500).json({ error: 'Failed to test channel' });
  }
});

/**
 * GET /api/notifications/events - Get notification event history
 */
router.get('/events', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, eventType, channelType, deliveryStatus } = req.query;
    
    const filter = { userId: req.user.userId };
    
    if (eventType) {
      filter.eventType = eventType;
    }
    
    if (deliveryStatus) {
      filter.deliveryStatus = deliveryStatus;
    }
    
    let query = NotificationEvent.find(filter)
      .populate('channelId', 'channelType displayName destination')
      .populate('productId', 'productName url retailer')
      .sort('-createdAt')
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    if (channelType) {
      query = query.populate({
        path: 'channelId',
        match: { channelType: channelType }
      });
    }
    
    const events = await query.lean();
    const total = await NotificationEvent.countDocuments(filter);
    
    // Filter out events with no channel if channelType filter was applied
    const filteredEvents = channelType 
      ? events.filter(event => event.channelId) 
      : events;
    
    res.json({
      events: filteredEvents,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: channelType ? filteredEvents.length : total,
        pages: Math.ceil((channelType ? filteredEvents.length : total) / limit)
      }
    });
    
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch notification events' });
  }
});

/**
 * GET /api/notifications/stats - Get notification statistics
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const stats = await notificationService.getNotificationStats(req.user.userId);
    
    // Add plan limits
    const limits = {
      free: 10,
      paid: 100,
      admin: 1000
    };
    
    stats.dailyLimit = limits[req.user.plan] || limits.free;
    
    // Get today's usage
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const sentToday = await NotificationEvent.countDocuments({
      userId: req.user.userId,
      deliveryStatus: 'sent',
      sentAt: { $gte: today }
    });
    
    stats.dailyUsage = sentToday;
    stats.dailyRemaining = Math.max(0, stats.dailyLimit - sentToday);
    
    res.json(stats);
    
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch notification statistics' });
  }
});

/**
 * POST /api/notifications/events/:id/retry - Retry failed notification
 */
router.post('/events/:id/retry', authenticateToken, rateLimiter, async (req, res) => {
  try {
    const event = await NotificationEvent.findOne({
      _id: req.params.id,
      userId: req.user.userId,
      deliveryStatus: 'failed'
    }).populate('channelId');
    
    if (!event) {
      return res.status(404).json({ error: 'Failed notification event not found' });
    }
    
    if (event.deliveryAttempts >= 3) {
      return res.status(400).json({ error: 'Maximum retry attempts exceeded' });
    }
    
    // Reset event for retry
    event.deliveryStatus = 'pending';
    event.scheduledFor = new Date();
    await event.save();
    
    res.json({ message: 'Notification queued for retry' });
    
  } catch (error) {
    console.error('Error retrying notification:', error);
    res.status(500).json({ error: 'Failed to retry notification' });
  }
});

function validateDestination(channelType, destination) {
  switch (channelType) {
    case CHANNEL_TYPES.EMAIL:
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(destination)) {
        return { valid: false, error: 'Invalid email address' };
      }
      return { valid: true, normalizedDestination: destination.toLowerCase() };
    
    case CHANNEL_TYPES.DISCORD:
      if (!destination.includes('discord.com/api/webhooks/')) {
        return { valid: false, error: 'Invalid Discord webhook URL' };
      }
      return { valid: true };
    
    case CHANNEL_TYPES.TELEGRAM:
      // Accept chat IDs or usernames
      if (!/^@?[a-zA-Z0-9_]+$/.test(destination) && !/^-?\d+$/.test(destination)) {
        return { valid: false, error: 'Invalid Telegram chat ID or username' };
      }
      return { valid: true };
    
    case CHANNEL_TYPES.TWITTER:
      // Accept usernames or user IDs
      if (!/^@?[a-zA-Z0-9_]+$/.test(destination) && !/^\d+$/.test(destination)) {
        return { valid: false, error: 'Invalid Twitter username or user ID' };
      }
      return { valid: true, normalizedDestination: destination.replace('@', '') };
    
    default:
      return { valid: false, error: 'Unknown channel type' };
  }
}

module.exports = router;