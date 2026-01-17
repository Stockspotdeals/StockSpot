/**
 * StockSpot Notifications Integration Example
 * 
 * Complete example showing how to integrate the notifications module
 * into a StockSpot backend Express application
 */

const express = require('express');
const mongoose = require('mongoose');
const cron = require('node-cron');

// Import notification modules
const { NotificationManager } = require('./backend/notifications/NotificationManager');
const { NotificationQueue } = require('./backend/notifications/NotificationQueue');
const { User } = require('./backend/models/User');
const notificationRouter = require('./backend/routes/notifications');

/**
 * Initialize notifications in Express app
 */
function initializeNotifications(app) {
  console.log('🔔 Initializing StockSpot Notifications System...\n');

  // Register notification API routes
  app.use('/api/notifications', notificationRouter);

  // Set up cron job for automatic notification processing
  if (process.env.NODE_ENV === 'production') {
    setupNotificationCron();
  }

  console.log('✅ Notifications system initialized\n');
}

/**
 * Set up cron jobs for automatic notification delivery
 */
function setupNotificationCron() {
  const notificationManager = new NotificationManager();
  const queue = new NotificationQueue();

  // Process notifications every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      console.log('[CRON] Processing notifications...');

      // Get all active users
      const users = await User.find({ isActive: true }).select('-password');

      if (users.length === 0) {
        console.log('[CRON] No active users to process');
        return;
      }

      // Process notifications for all users
      const results = await notificationManager.processAllFeeds(users);
      const stats = notificationManager.getStats();

      console.log(`[CRON] Processed ${results.success} users (${stats.emailsSent} emails, ${stats.rssUpdates} RSS updates)`);
    } catch (error) {
      console.error('[CRON] Error processing notifications:', error.message);
    }
  });

  // Deliver queued notifications every 2 minutes
  cron.schedule('*/2 * * * *', async () => {
    try {
      console.log('[CRON] Delivering queued notifications...');

      const processor = async (notification) => {
        // Here you would implement the actual delivery logic
        // For now, just mark as success
        return { success: true };
      };

      const results = await queue.dequeueAndProcess(processor);
      console.log(`[CRON] Delivered ${results.processed} notifications (${results.failed} failed, ${results.deferred} deferred)`);
    } catch (error) {
      console.error('[CRON] Error delivering notifications:', error.message);
    }
  });

  // Clean up old notifications daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      console.log('[CRON] Cleaning up old notifications...');

      const result = await queue.cleanup(30); // Delete > 30 days old
      console.log(`[CRON] Cleaned up ${result.deleted} old notifications`);
    } catch (error) {
      console.error('[CRON] Error cleaning up notifications:', error.message);
    }
  });

  console.log('⏰ Notification cron jobs scheduled');
  console.log('   • Process notifications: every 5 minutes');
  console.log('   • Deliver queue: every 2 minutes');
  console.log('   • Cleanup old: daily at 2 AM\n');
}

/**
 * Example: Create a test user and send notifications
 */
async function exampleCreateUserAndNotify() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);

    // Create a test user
    const testUser = new User({
      email: 'test@stockspot.com',
      password: 'test123',
      name: 'Test User',
      tier: 'PAID',
      preferences: {
        emailNotifications: true,
        rssEnabled: true,
        notificationFrequency: 'instant'
      },
      subscriptions: {
        amazon: true,
        walmart: true,
        target: true,
        bestbuy: true,
        pokemon: true,
        sports: true
      }
    });

    await testUser.save();
    console.log('✅ Created test user:', testUser.email);

    // Send notifications
    const notificationManager = new NotificationManager();
    const result = await notificationManager.processUserNotifications(testUser);

    console.log('✅ Notification result:', result);

    // Get feed stats
    const stats = notificationManager.getStats();
    console.log('📊 Stats:', stats);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

/**
 * Example: Update user notification preferences
 */
async function exampleUpdatePreferences() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findById('user-id-here');

    // Update preferences
    user.preferences.emailNotifications = false;
    user.preferences.rssEnabled = true;
    user.preferences.notificationFrequency = 'daily';

    // Update subscriptions
    user.subscriptions.amazon = true;
    user.subscriptions.pokemon = true;
    user.subscriptions.sports = true;

    await user.save();
    console.log('✅ Updated preferences for user:', user.email);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

/**
 * Example: Add manual item for YEARLY user
 */
async function exampleAddManualItem() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const user = await User.findById('yearly-user-id-here');

    if (user.tier !== 'YEARLY') {
      throw new Error('Only YEARLY tier users can add manual items');
    }

    user.manualItems.push({
      url: 'https://amazon.com/some-product',
      productName: 'Amazing Widget',
      targetPrice: 49.99,
      addedDate: new Date()
    });

    await user.save();
    console.log('✅ Added manual item for user:', user.email);
    console.log('   Total manual items:', user.manualItems.length);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

/**
 * Example: Get user notification history
 */
async function exampleGetNotificationHistory() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const queue = new NotificationQueue();
    const notifications = await queue.getUserNotifications('user-id-here', 'delivered', 10);

    console.log('📬 User notification history:');
    notifications.forEach(notif => {
      console.log(`   • ${notif.createdAt}: ${notif.items.length} items via ${notif.channel}`);
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

/**
 * Export for use in Express app
 */
module.exports = {
  initializeNotifications,
  setupNotificationCron,
  // Example functions (for reference)
  exampleCreateUserAndNotify,
  exampleUpdatePreferences,
  exampleAddManualItem,
  exampleGetNotificationHistory
};

/**
 * Usage in main server.js:
 * 
 * const { initializeNotifications } = require('./integration-example');
 * 
 * const app = express();
 * // ... other middleware ...
 * 
 * // Initialize notifications
 * initializeNotifications(app);
 * 
 * // Start server
 * const server = app.listen(PORT, () => {
 *   console.log(`🚀 Server running on port ${PORT}`);
 * });
 */
