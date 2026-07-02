/**
 * FeedObserver - Autonomous Feed Ingestion Engine
 * 
 * Monitors 6 major retailers for:
 * - New listings
 * - Price drops
 * - Restocks
 * - Limited/exclusive/hype items
 * 
 * Runs every 5-10 minutes and integrates with notification system
 * Respects user tier rules (FREE/PAID/YEARLY)
 */

const cron = require('node-cron');
const { MultiRetailerFeed } = require('./MultiRetailerFeed');
const { NotificationManager } = require('../notifications/NotificationManager');
const { UserModel } = require('../models/User');
const mongoose = require('mongoose');

class FeedObserver {
  constructor() {
    this.feed = new MultiRetailerFeed();
    this.notificationManager = new NotificationManager();
    this.isRunning = false;
    this.lastCheckTime = new Map(); // Track last check per retailer
    this.scheduledTasks = [];
    this.stats = {
      itemsProcessed: 0,
      notificationsSent: 0,
      errors: 0,
      lastRun: null,
      nextRun: null,
    };
  }

  /**
   * Start the autonomous observer with cron scheduling
   * Default: Every 5 minutes (can be configured via env)
   */
  async start() {
    if (this.isRunning) {
      console.log('⚠️  FeedObserver already running');
      return;
    }

    const interval = process.env.MONITOR_INTERVAL_MINUTES || 5;
    console.log(`🚀 FeedObserver starting - checking feeds every ${interval} minutes`);
    console.log(`⏰ Next check: ${new Date(Date.now() + interval * 60000).toISOString()}`);

    // Schedule the main feed check
    const mainTask = cron.schedule(`*/${interval} * * * *`, async () => {
      try {
        this.stats.lastRun = new Date();
        this.stats.nextRun = new Date(Date.now() + interval * 60000);
        await this.checkFeeds();
      } catch (error) {
        console.error('❌ FeedObserver error:', error.message);
        this.stats.errors++;
      }
    });

    // Schedule restock checks (faster interval)
    const restockInterval = process.env.RESTOCK_CHECK_INTERVAL_MINUTES || 2;
    const restockTask = cron.schedule(`*/${restockInterval} * * * *`, async () => {
      try {
        await this.checkRestocks();
      } catch (error) {
        console.error('❌ Restock check error:', error.message);
      }
    });

    this.scheduledTasks = [mainTask, restockTask];
    this.isRunning = true;

    // Run initial check
    setTimeout(() => this.checkFeeds(), 5000);
  }

  /**
   * Stop the observer
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️  FeedObserver not running');
      return;
    }

    console.log('🛑 Stopping FeedObserver...');
    this.scheduledTasks.forEach(task => task.stop());
    this.scheduledTasks = [];
    this.isRunning = false;
  }

  /**
   * Check all configured feeds for new items
   */
  async checkFeeds() {
    console.log(`\n📡 [${new Date().toISOString()}] Checking all feeds...`);

    const retailers = ['amazon', 'walmart', 'target', 'bestbuy', 'tcg', 'sports_cards'];
    const allItems = [];

    for (const retailer of retailers) {
      try {
        if (process.env[`${retailer.toUpperCase()}_MONITORING_ENABLED`] !== 'false') {
          const items = await this.feed.getRetailerFeed(retailer);
          allItems.push(...items.map(item => ({ ...item, retailer })));
          console.log(`✅ ${retailer}: ${items.length} items found`);
        }
      } catch (error) {
        console.error(`❌ ${retailer} error:`, error.message);
        this.stats.errors++;
      }
    }

    // Process items and send notifications based on tier
    await this.processItems(allItems);

    console.log(`📊 Stats: ${this.stats.itemsProcessed} items, ${this.stats.notificationsSent} notifications sent\n`);
  }

  /**
   * Check for restocks on tracked items
   */
  async checkRestocks() {
    try {
      // Get all users with tracked items
      const users = await UserModel.find({ 
        trackedItems: { $exists: true, $ne: [] }
      });

      for (const user of users) {
        for (const item of user.trackedItems) {
          // Check if item is back in stock
          const availability = await this.feed.checkAvailability(item);
          
          if (availability.inStock && !item.wasInStock) {
            // Send restock notification
            await this.notificationManager.sendRestockNotification(user, item);
            this.stats.notificationsSent++;
          }

          // Update tracking status
          item.wasInStock = availability.inStock;
        }
        await user.save();
      }
    } catch (error) {
      console.error('❌ Restock check error:', error.message);
    }
  }

  /**
   * Process feed items and send notifications based on user tier
   */
  async processItems(items) {
    if (!items || items.length === 0) {
      console.log('ℹ️  No new items found');
      return;
    }

    // Get all active users
    const users = await UserModel.find({ active: true });

    for (const item of items) {
      this.stats.itemsProcessed++;

      // Check each user's tier and send if applicable
      for (const user of users) {
        const shouldNotify = this.shouldNotifyUser(user, item);
        
        if (shouldNotify) {
          try {
            await this.notificationManager.queueNotification(user._id, {
              type: 'new_deal',
              item,
              timestamp: new Date(),
              source: item.retailer,
              affiliate: item.affiliateLink,
            });
            this.stats.notificationsSent++;
          } catch (error) {
            console.error(`Error queuing notification for user ${user._id}:`, error.message);
          }
        }
      }
    }
  }

  /**
   * Determine if user should be notified based on tier and settings
   */
  shouldNotifyUser(user, item) {
    // User must have notifications enabled
    if (!user.notificationsEnabled) {
      return false;
    }

    // Check category subscription
    if (user.preferredCategories && !user.preferredCategories.includes(item.category)) {
      return false;
    }

    // Check tier rules
    const tier = user.subscriptionTier || 'FREE';

    if (tier === 'FREE') {
      // FREE tier gets instant Amazon, 10-min delayed others
      if (item.retailer === 'amazon') {
        return true; // Instant
      }
      
      // Check if delay period has passed
      const delayMinutes = process.env.FREE_TIER_DELAY_MINUTES || 10;
      const lastNotification = this.lastCheckTime.get(`${user._id}-${item.id}`);
      
      if (!lastNotification) {
        this.lastCheckTime.set(`${user._id}-${item.id}`, new Date());
        return false; // First time, return false to delay
      }

      const elapsed = (Date.now() - lastNotification.getTime()) / (1000 * 60);
      return elapsed >= delayMinutes;
    }

    if (tier === 'PAID') {
      // PAID gets instant all retailers
      return true;
    }

    if (tier === 'YEARLY') {
      // YEARLY gets instant + premium features
      return true;
    }

    return false;
  }

  /**
   * Get current observer statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      scheduledTaskCount: this.scheduledTasks.length,
    };
  }

  /**
   * Manually trigger a feed check (for testing)
   */
  async manualCheck() {
    console.log('🔄 Manual feed check triggered');
    if (!this.isRunning) {
      await this.checkFeeds();
    }
  }
}

module.exports = { FeedObserver };
