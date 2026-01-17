/**
 * NotificationManager - Main notification orchestrator
 * Handles feed fetching, tier filtering, and multi-channel delivery
 */

const { MultiRetailerFeed } = require('../services/MultiRetailerFeed');
const { EmailProvider } = require('./EmailProvider');
const { RSSFeedManager } = require('./RSSFeedManager');

class NotificationManager {
  constructor() {
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.feed = new MultiRetailerFeed();
    this.emailProvider = new EmailProvider();
    this.rssFeedManager = new RSSFeedManager();
    this.stats = {
      processedItems: 0,
      emailsSent: 0,
      rssUpdates: 0,
      errors: []
    };
  }

  /**
   * Process all feeds for all users
   */
  async processAllFeeds(users) {
    console.log('\n📬 Processing notifications for all users...');
    
    const results = {
      success: 0,
      failed: 0,
      users: []
    };

    for (const user of users) {
      try {
        const userResult = await this.processUserNotifications(user);
        results.users.push(userResult);
        
        if (userResult.success) {
          results.success += 1;
        } else {
          results.failed += 1;
        }
      } catch (error) {
        console.error(`❌ Error processing user ${user._id}:`, error.message);
        results.failed += 1;
        this.stats.errors.push(`User ${user._id}: ${error.message}`);
      }
    }

    return results;
  }

  /**
   * Process notifications for a single user
   */
  async processUserNotifications(user) {
    try {
      // Fetch all feed items
      const allItems = this.getMockFeedItems();

      // Apply tier-based filtering and delays
      const filteredItems = this.applyTierFiltering(allItems, user);

      // Separate items for email and RSS
      const itemsToNotify = filteredItems.filter(item => item.shouldNotify);
      const itemsForRSS = filteredItems;

      // Send notifications
      let emailResult = { sent: 0, skipped: 0 };
      let rssResult = { updated: false };

      if (itemsToNotify.length > 0 && user.emailNotifications) {
        emailResult = await this.sendEmailNotification(user, itemsToNotify);
        this.stats.emailsSent += emailResult.sent;
      }

      // Update RSS feed
      if (user.rssEnabled) {
        rssResult = await this.rssFeedManager.updateUserFeed(user._id, itemsForRSS);
        if (rssResult.updated) {
          this.stats.rssUpdates += 1;
        }
      }

      this.stats.processedItems += itemsToNotify.length;

      return {
        success: true,
        userId: user._id,
        email: user.email,
        itemsNotified: itemsToNotify.length,
        emailSent: emailResult.sent,
        rssUpdated: rssResult.updated
      };
    } catch (error) {
      return {
        success: false,
        userId: user._id,
        error: error.message
      };
    }
  }

  /**
   * Apply tier-based filtering to items
   */
  applyTierFiltering(items, user) {
    const now = Date.now();

    return items.map(item => {
      let shouldNotify = true;
      let delayApplied = 0;

      // Apply tier-specific logic
      switch (user.tier.toUpperCase()) {
        case 'FREE':
          // FREE: 10-min delay for non-Amazon, instant for Amazon affiliate
          if (item.retailer.toLowerCase() !== 'amazon') {
            delayApplied = 10 * 60 * 1000; // 10 minutes
            const nextNotifyTime = (item.detectedAt || now) + delayApplied;
            shouldNotify = now >= nextNotifyTime;
          }
          break;

        case 'PAID':
          // PAID: Instant notifications for all items
          shouldNotify = true;
          delayApplied = 0;
          break;

        case 'YEARLY':
          // YEARLY: Instant notifications + manual items
          shouldNotify = true;
          delayApplied = 0;
          // Include manual items
          break;

        default:
          shouldNotify = false;
      }

      return {
        ...item,
        shouldNotify,
        delayApplied,
        tier: user.tier,
        userId: user._id
      };
    });
  }

  /**
   * Send email notification for items
   */
  async sendEmailNotification(user, items) {
    if (this.isDryRun) {
      console.log(`  📧 [DRY-RUN] Would send email to ${user.email} with ${items.length} items`);
      return { sent: items.length, skipped: 0 };
    }

    try {
      const result = await this.emailProvider.sendNotificationEmail(user, items);
      console.log(`  ✅ Email sent to ${user.email} (${items.length} items)`);
      return { sent: result.count, skipped: 0 };
    } catch (error) {
      console.error(`  ❌ Failed to send email to ${user.email}:`, error.message);
      return { sent: 0, skipped: items.length };
    }
  }

  /**
   * Get mock feed items for testing
   */
  getMockFeedItems() {
    return [
      {
        id: 'amz-1',
        retailer: 'Amazon',
        name: 'Premium Wireless Headphones',
        price: 79.99,
        originalPrice: 199.99,
        discount: 60,
        url: 'https://amazon.com/headphones',
        category: 'Electronics',
        detectedAt: Date.now(),
        isAmazonAffiliate: true
      },
      {
        id: 'walmart-1',
        retailer: 'Walmart',
        name: '4K Smart TV',
        price: 299.99,
        originalPrice: 799.99,
        discount: 62,
        url: 'https://walmart.com/tv',
        category: 'Electronics',
        detectedAt: Date.now() - 5 * 60 * 1000
      },
      {
        id: 'target-1',
        retailer: 'Target',
        name: 'Designer Handbag',
        price: 89.99,
        originalPrice: 249.99,
        discount: 64,
        url: 'https://target.com/bag',
        category: 'Fashion',
        detectedAt: Date.now() - 8 * 60 * 1000
      },
      {
        id: 'tcg-1',
        retailer: 'Pokemon TCG',
        name: 'Scarlet & Violet Booster Box',
        price: 89.99,
        originalPrice: 120.00,
        discount: 25,
        url: 'https://pokemon.com/booster',
        category: 'Trading Card Games',
        detectedAt: Date.now() - 3 * 60 * 1000
      },
      {
        id: 'sports-1',
        retailer: 'Sports Cards',
        name: 'NBA 2024-25 Rookie Cards',
        price: 149.99,
        originalPrice: 200.00,
        discount: 25,
        url: 'https://sportscards.com/nba',
        category: 'Sports Cards',
        detectedAt: Date.now() - 2 * 60 * 1000
      }
    ];
  }

  /**
   * Get notification statistics
   */
  getStats() {
    return {
      ...this.stats,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = { NotificationManager };
