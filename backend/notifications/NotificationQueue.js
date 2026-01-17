/**
 * NotificationQueue - Queue management for reliable notification delivery
 * Handles retries, tracking, and persistence
 */

const mongoose = require('mongoose');

// Define notification queue schema
const notificationQueueSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  items: [{
    id: String,
    retailer: String,
    name: String,
    price: Number,
    originalPrice: Number,
    discount: Number,
    url: String,
    category: String
  }],
  channel: {
    type: String,
    enum: ['email', 'rss', 'push'],
    default: 'email'
  },
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'delivered', 'failed', 'cancelled'],
    default: 'pending'
  },
  retries: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  },
  lastError: String,
  deliveredAt: Date,
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
    expires: 30 * 24 * 60 * 60 // Auto-delete after 30 days
  },
  scheduledFor: {
    type: Date,
    index: true
  }
});

const NotificationQueueModel = mongoose.model('NotificationQueue', notificationQueueSchema);

class NotificationQueue {
  constructor() {
    this.isDryRun = process.env.DRY_RUN === 'true';
  }

  /**
   * Enqueue a notification
   */
  async enqueue(userId, items, channel = 'email', scheduledFor = null) {
    try {
      const notification = {
        userId,
        items,
        channel,
        status: 'pending',
        retries: 0,
        scheduledFor: scheduledFor || new Date()
      };

      if (this.isDryRun) {
        console.log(`[DRY-RUN] Enqueued notification for user ${userId} (${items.length} items via ${channel})`);
        return { success: true, dry_run: true, id: 'dry-run-' + Date.now() };
      }

      const queued = await NotificationQueueModel.create(notification);
      console.log(`✅ Notification enqueued for user ${userId} (ID: ${queued._id})`);

      return {
        success: true,
        id: queued._id,
        status: 'pending'
      };
    } catch (error) {
      console.error('❌ Error enqueuing notification:', error.message);
      throw error;
    }
  }

  /**
   * Dequeue and process pending notifications
   */
  async dequeueAndProcess(processor, maxToProcess = 100) {
    if (this.isDryRun) {
      console.log(`[DRY-RUN] Would process up to ${maxToProcess} pending notifications`);
      return { processed: 0, failed: 0, deferred: 0 };
    }

    try {
      const notifications = await NotificationQueueModel.find({
        status: 'pending',
        scheduledFor: { $lte: new Date() }
      })
        .limit(maxToProcess)
        .sort({ createdAt: 1 });

      console.log(`📬 Processing ${notifications.length} notifications...`);

      const results = {
        processed: 0,
        failed: 0,
        deferred: 0
      };

      for (const notification of notifications) {
        try {
          // Mark as in progress
          notification.status = 'in_progress';
          await notification.save();

          // Process the notification
          const result = await processor(notification);

          if (result.success) {
            notification.status = 'delivered';
            notification.deliveredAt = new Date();
            results.processed += 1;
          } else {
            // Retry logic
            notification.retries += 1;
            if (notification.retries < notification.maxRetries) {
              notification.status = 'pending';
              notification.scheduledFor = new Date(Date.now() + 5 * 60 * 1000); // Retry in 5 min
              results.deferred += 1;
            } else {
              notification.status = 'failed';
              notification.lastError = result.error;
              results.failed += 1;
            }
          }

          await notification.save();
        } catch (error) {
          console.error(`❌ Error processing notification ${notification._id}:`, error.message);
          notification.status = 'failed';
          notification.lastError = error.message;
          notification.retries += 1;
          await notification.save();
          results.failed += 1;
        }
      }

      return results;
    } catch (error) {
      console.error('❌ Error dequeueing notifications:', error.message);
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    if (this.isDryRun) {
      return {
        dry_run: true,
        pending: 0,
        in_progress: 0,
        delivered: 0,
        failed: 0
      };
    }

    try {
      const [pending, inProgress, delivered, failed] = await Promise.all([
        NotificationQueueModel.countDocuments({ status: 'pending' }),
        NotificationQueueModel.countDocuments({ status: 'in_progress' }),
        NotificationQueueModel.countDocuments({ status: 'delivered' }),
        NotificationQueueModel.countDocuments({ status: 'failed' })
      ]);

      return {
        pending,
        in_progress: inProgress,
        delivered,
        failed,
        total: pending + inProgress + delivered + failed
      };
    } catch (error) {
      console.error('❌ Error getting queue stats:', error.message);
      return { error: error.message };
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(userId, status = null, limit = 50) {
    try {
      const query = { userId };
      if (status) {
        query.status = status;
      }

      const notifications = await NotificationQueueModel.find(query)
        .sort({ createdAt: -1 })
        .limit(limit);

      return notifications;
    } catch (error) {
      console.error(`❌ Error getting notifications for user ${userId}:`, error.message);
      throw error;
    }
  }

  /**
   * Cancel a notification
   */
  async cancelNotification(notificationId) {
    try {
      const notification = await NotificationQueueModel.findByIdAndUpdate(
        notificationId,
        { status: 'cancelled' },
        { new: true }
      );

      return {
        success: true,
        notification
      };
    } catch (error) {
      console.error(`❌ Error cancelling notification:`, error.message);
      throw error;
    }
  }

  /**
   * Clear old delivered/failed notifications (older than X days)
   */
  async cleanup(daysOld = 30) {
    if (this.isDryRun) {
      console.log(`[DRY-RUN] Would delete notifications older than ${daysOld} days`);
      return { deleted: 0 };
    }

    try {
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

      const result = await NotificationQueueModel.deleteMany({
        $or: [
          { status: 'delivered', deliveredAt: { $lt: cutoffDate } },
          { status: 'failed', createdAt: { $lt: cutoffDate } }
        ]
      });

      console.log(`🧹 Cleaned up ${result.deletedCount} old notifications`);

      return {
        deleted: result.deletedCount
      };
    } catch (error) {
      console.error('❌ Error during cleanup:', error.message);
      throw error;
    }
  }
}

module.exports = { NotificationQueue, NotificationQueueModel };
