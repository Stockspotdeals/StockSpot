const { MessageBuilder } = require('./MessageBuilder');
const { NotificationEvent, NotificationChannel, CHANNEL_TYPES, DELIVERY_STATUS, EVENT_TYPES } = require('../models/Notification');

class NotificationService {
  constructor() {
    this.providers = new Map();
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.initializeProviders();
    this.rateLimits = new Map();
  }

  initializeProviders() {
    // Provider initialization - currently supports email and RSS
    // Skip in dry-run mode
    if (this.isDryRun) {
      return;
    }
  }

  async createNotificationEvent(userId, productId, eventType, eventData = {}) {
    try {
      // Get user's active notification channels
      const channels = await NotificationChannel.find({
        userId,
        isActive: true,
        isVerified: true
      });

      if (channels.length === 0) {
        console.log(`No active channels for user ${userId}`);
        return [];
      }

      // Get product details for message building
      const { TrackedProduct } = require('../models/TrackedProduct');
      const product = await TrackedProduct.findById(productId);

      if (!product) {
        throw new Error('Product not found');
      }

      const events = [];

      for (const channel of channels) {
        // Check if user wants this type of notification on this channel
        if (!this.shouldSendNotification(channel, eventType)) {
          continue;
        }

        // Build message for this channel
        const message = this.buildMessage(product, eventType, channel, eventData);

        // Generate deduplication key
        const deduplicationKey = this.generateDeduplicationKey(userId, productId, eventType, channel._id);

        // Check if we already sent this notification today
        const existingEvent = await NotificationEvent.findOne({
          deduplicationKey,
          deliveryStatus: { $in: [DELIVERY_STATUS.SENT, DELIVERY_STATUS.PENDING] }
        });

        if (existingEvent) {
          console.log(`Duplicate notification prevented: ${deduplicationKey}`);
          continue;
        }

        // Create notification event
        const notificationEvent = new NotificationEvent({
          userId,
          productId,
          channelId: channel._id,
          eventType,
          message,
          deduplicationKey,
          scheduledFor: new Date()
        });

        await notificationEvent.save();
        events.push(notificationEvent);
      }

      return events;
    } catch (error) {
      console.error('Error creating notification events:', error);
      throw error;
    }
  }

  buildMessage(product, eventType, channel, eventData) {
    switch (eventType) {
      case EVENT_TYPES.RESTOCK:
        return MessageBuilder.buildRestockMessage(product, eventData, channel);
      
      case EVENT_TYPES.PRICE_DROP:
        return MessageBuilder.buildPriceDropMessage(
          product, 
          eventData, 
          channel, 
          eventData.oldPrice, 
          eventData.newPrice
        );
      
      case EVENT_TYPES.TARGET_PRICE:
        return MessageBuilder.buildTargetPriceMessage(
          product, 
          eventData, 
          channel, 
          product.targetPrice
        );
      
      default:
        throw new Error(`Unknown event type: ${eventType}`);
    }
  }

  shouldSendNotification(channel, eventType) {
    // Check channel configuration for this event type
    const config = channel.configuration || new Map();
    
    // Default to true for restock alerts
    if (eventType === EVENT_TYPES.RESTOCK) {
      return config.get('restock') !== false;
    }
    
    if (eventType === EVENT_TYPES.PRICE_DROP) {
      return config.get('priceChange') !== false;
    }
    
    if (eventType === EVENT_TYPES.TARGET_PRICE) {
      return config.get('targetPrice') !== false;
    }
    
    return true;
  }

  generateDeduplicationKey(userId, productId, eventType, channelId) {
    const date = new Date().toISOString().split('T')[0];
    return `${userId}_${productId}_${eventType}_${channelId}_${date}`;
  }

  async deliverPendingNotifications() {
    try {
      const pendingEvents = await NotificationEvent.find({
        deliveryStatus: DELIVERY_STATUS.PENDING,
        scheduledFor: { $lte: new Date() },
        deliveryAttempts: { $lt: 3 }
      })
      .populate('channelId')
      .populate('userId', 'plan')
      .sort({ scheduledFor: 1 })
      .limit(100);

      const results = [];

      for (const event of pendingEvents) {
        try {
          // Check user's plan limits
          if (!(await this.checkDeliveryLimits(event))) {
            await event.updateOne({
              deliveryStatus: DELIVERY_STATUS.SKIPPED,
              failureReason: 'Plan limit exceeded'
            });
            continue;
          }

          // Check rate limits
          if (this.isRateLimited(event.channelId)) {
            continue;
          }

          const result = await this.deliverNotification(event);
          results.push(result);

        } catch (error) {
          console.error(`Failed to deliver notification ${event._id}:`, error);
          await event.markFailed(error.message);
        }
      }

      return results;
    } catch (error) {
      console.error('Error delivering notifications:', error);
      throw error;
    }
  }

  async deliverNotification(notificationEvent) {
    try {
      const channel = notificationEvent.channelId;
      const provider = this.providers.get(channel.channelType);

      if (!provider) {
        throw new Error(`No provider found for channel type: ${channel.channelType}`);
      }

      // Attempt delivery
      const result = await provider.sendNotification(notificationEvent, channel);

      if (result.success) {
        await notificationEvent.markSent(result.externalId);
        
        // Update channel last used
        await NotificationChannel.findByIdAndUpdate(channel._id, {
          lastUsed: new Date(),
          errorCount: 0,
          lastError: null
        });

        // Update rate limits if specified
        if (result.retryAfter) {
          this.setRateLimit(channel._id, result.retryAfter * 1000);
        }

        return {
          eventId: notificationEvent._id,
          success: true,
          channelType: channel.channelType,
          externalId: result.externalId
        };
      } else {
        await notificationEvent.markFailed(result.error);
        
        // Update channel error count
        await NotificationChannel.findByIdAndUpdate(channel._id, {
          $inc: { errorCount: 1 },
          lastError: result.error
        });

        // Disable channel if too many errors
        if (channel.errorCount >= 5) {
          await NotificationChannel.findByIdAndUpdate(channel._id, {
            isActive: false
          });
        }

        return {
          eventId: notificationEvent._id,
          success: false,
          error: result.error,
          channelType: channel.channelType
        };
      }
    } catch (error) {
      await notificationEvent.markFailed(error.message);
      throw error;
    }
  }

  async checkDeliveryLimits(notificationEvent) {
    const user = notificationEvent.userId;
    const limits = {
      free: 10,
      paid: 100,
      admin: 1000
    };

    const userLimit = limits[user.plan] || limits.free;

    // Count notifications sent today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sentToday = await NotificationEvent.countDocuments({
      userId: user._id,
      deliveryStatus: DELIVERY_STATUS.SENT,
      sentAt: { $gte: today }
    });

    return sentToday < userLimit;
  }

  isRateLimited(channelId) {
    const limit = this.rateLimits.get(channelId.toString());
    return limit && Date.now() < limit;
  }

  setRateLimit(channelId, duration) {
    this.rateLimits.set(channelId.toString(), Date.now() + duration);
  }

  async testNotificationChannel(channelId) {
    try {
      const channel = await NotificationChannel.findById(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      const provider = this.providers.get(channel.channelType);
      if (!provider) {
        throw new Error(`No provider for channel type: ${channel.channelType}`);
      }

      // Create test message
      const message = MessageBuilder.buildTestMessage(channel);

      // Create test event
      const testEvent = {
        _id: 'test',
        eventType: 'test',
        message
      };

      // Attempt delivery
      const result = await provider.sendNotification(testEvent, channel);

      if (result.success) {
        await NotificationChannel.findByIdAndUpdate(channelId, {
          lastUsed: new Date(),
          errorCount: 0,
          lastError: null
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getNotificationStats(userId) {
    try {
      const [
        totalChannels,
        activeChannels,
        totalEvents,
        sentEvents,
        failedEvents,
        recentEvents
      ] = await Promise.all([
        NotificationChannel.countDocuments({ userId }),
        NotificationChannel.countDocuments({ userId, isActive: true }),
        NotificationEvent.countDocuments({ userId }),
        NotificationEvent.countDocuments({ userId, deliveryStatus: DELIVERY_STATUS.SENT }),
        NotificationEvent.countDocuments({ userId, deliveryStatus: DELIVERY_STATUS.FAILED }),
        NotificationEvent.find({ userId })
          .sort('-createdAt')
          .limit(10)
          .populate('channelId', 'channelType displayName')
          .lean()
      ]);

      return {
        channels: {
          total: totalChannels,
          active: activeChannels,
          inactive: totalChannels - activeChannels
        },
        events: {
          total: totalEvents,
          sent: sentEvents,
          failed: failedEvents,
          pending: totalEvents - sentEvents - failedEvents
        },
        recentEvents
      };
    } catch (error) {
      console.error('Error getting notification stats:', error);
      throw error;
    }
  }
}

module.exports = { NotificationService };