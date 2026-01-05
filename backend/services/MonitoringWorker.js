const cron = require('node-cron');
const { ProductMonitor } = require('./ProductMonitor');
const { NotificationService } = require('./NotificationService');
const { TrackedProduct, ProductEvent } = require('../models/TrackedProduct');

class MonitoringWorker {
  constructor() {
    this.productMonitor = new ProductMonitor();
    this.notificationService = new NotificationService();
    this.isRunning = false;
    this.currentJob = null;
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      notificationsSent: 0,
      lastRun: null,
      runDuration: 0
    };
  }

  /**
   * Start the monitoring worker
   */
  start() {
    console.log('🚀 Starting StockSpot monitoring worker...');
    
    // Main monitoring job - runs every 5 minutes
    this.currentJob = cron.schedule('*/5 * * * *', async () => {
      if (this.isRunning) {
        console.log('⏳ Previous monitoring job still running, skipping...');
        return;
      }
      
      await this.runMonitoringCycle();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });

    // Notification delivery job - runs every 2 minutes
    cron.schedule('*/2 * * * *', async () => {
      try {
        const results = await this.notificationService.deliverPendingNotifications();
        if (results.length > 0) {
          const successful = results.filter(r => r.success).length;
          console.log(`📬 Delivered ${successful}/${results.length} notifications`);
          this.stats.notificationsSent += successful;
        }
      } catch (error) {
        console.error('❌ Error delivering notifications:', error.message);
      }
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });

    // Cleanup job - runs daily at 2 AM
    cron.schedule('0 2 * * *', async () => {
      await this.cleanup();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });

    // Stats logging - runs every 30 minutes
    cron.schedule('*/30 * * * *', () => {
      this.logStats();
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });

    console.log('✅ Monitoring worker started successfully');
    console.log('📅 Main job schedule: Every 5 minutes');
    console.log('📬 Notification delivery: Every 2 minutes');
    console.log('🧹 Cleanup schedule: Daily at 2:00 AM');
    console.log('📊 Stats logging: Every 30 minutes');
  }

  /**
   * Stop the monitoring worker
   */
  stop() {
    console.log('🛑 Stopping monitoring worker...');
    
    if (this.currentJob) {
      this.currentJob.stop();
      this.currentJob.destroy();
      this.currentJob = null;
    }
    
    console.log('✅ Monitoring worker stopped');
  }

  /**
   * Run a complete monitoring cycle
   */
  async runMonitoringCycle() {
    const startTime = Date.now();
    this.isRunning = true;
    
    try {
      console.log('🔄 Starting monitoring cycle...');
      
      // Get products due for checking
      const productsDue = await this.productMonitor.getProductsDueForCheck();
      
      if (productsDue.length === 0) {
        console.log('✨ No products due for checking');
        return;
      }
      
      console.log(`📦 Found ${productsDue.length} products to monitor`);
      
      // Group products by user to respect rate limits
      const productsByUser = this.groupProductsByUser(productsDue);
      
      let totalChecked = 0;
      let totalSuccessful = 0;
      let totalFailed = 0;
      
      // Process each user's products
      for (const [userId, userProducts] of Object.entries(productsByUser)) {
        try {
          console.log(`👤 Processing ${userProducts.length} products for user ${userId}`);
          
          const results = await this.productMonitor.monitorProducts(userProducts);
          
          const successful = results.filter(r => r.success).length;
          const failed = results.filter(r => !r.success).length;
          
          console.log(`  ✅ ${successful} successful, ❌ ${failed} failed`);
          
          totalChecked += userProducts.length;
          totalSuccessful += successful;
          totalFailed += failed;
          
          // Log significant events
          await this.logSignificantEvents(results);
          
          // Add delay between users to be respectful
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          console.error(`❌ Error processing products for user ${userId}:`, error.message);
          totalFailed += userProducts.length;
        }
      }
      
      // Update stats
      this.stats.totalChecks += totalChecked;
      this.stats.successfulChecks += totalSuccessful;
      this.stats.failedChecks += totalFailed;
      this.stats.lastRun = new Date();
      this.stats.runDuration = Date.now() - startTime;
      
      console.log(`🎯 Monitoring cycle complete: ${totalSuccessful}/${totalChecked} successful (${Math.round(totalSuccessful/totalChecked*100)}%)`);
      console.log(`⏱️ Duration: ${Math.round(this.stats.runDuration/1000)}s`);
      
    } catch (error) {
      console.error('💥 Error in monitoring cycle:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Group products by user ID for rate limiting
   */
  groupProductsByUser(products) {
    return products.reduce((groups, product) => {
      const userId = product.userId.toString();
      if (!groups[userId]) {
        groups[userId] = [];
      }
      groups[userId].push(product);
      return groups;
    }, {});
  }

  /**
   * Log significant events (restocks, price targets, etc.)
   */
  async logSignificantEvents(results) {
    for (const result of results) {
      if (result.success && result.result.changes.length > 0) {
        const changes = result.result.changes;
        
        // Log restock events
        const restockEvents = changes.filter(c => c.type === 'restock');
        if (restockEvents.length > 0) {
          console.log(`🔔 RESTOCK ALERT: Product ${result.productId} is back in stock!`);
        }
        
        // Log target price reached
        const targetPriceEvents = changes.filter(c => c.type === 'target_price_reached');
        if (targetPriceEvents.length > 0) {
          console.log(`💰 PRICE TARGET: Product ${result.productId} reached target price!`);
        }
        
        // Log significant price drops (>20%)
        const priceChanges = changes.filter(c => c.type === 'price_change');
        for (const change of priceChanges) {
          const percentChange = Math.abs(((change.newValue - change.oldValue) / change.oldValue) * 100);
          if (percentChange >= 20) {
            console.log(`📉 SIGNIFICANT PRICE CHANGE: Product ${result.productId} price changed by ${percentChange.toFixed(1)}%`);
          }
        }
      }
    }
  }

  /**
   * Clean up old data
   */
  async cleanup() {
    try {
      console.log('🧹 Starting cleanup...');
      
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      // Clean up old events (keep only last 30 days)
      const deletedEvents = await ProductEvent.deleteMany({
        createdAt: { $lt: thirtyDaysAgo }
      });
      
      console.log(`🗑️ Deleted ${deletedEvents.deletedCount} old events`);
      
      // Mark failed products as inactive if they haven't been checked in 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      
      const failedProducts = await TrackedProduct.updateMany({
        status: 'failed',
        lastChecked: { $lt: sevenDaysAgo },
        isActive: true
      }, {
        isActive: false,
        status: 'inactive'
      });
      
      console.log(`😴 Marked ${failedProducts.modifiedCount} failed products as inactive`);
      
      // Log cleanup stats
      const activeProducts = await TrackedProduct.countDocuments({ isActive: true });
      const totalProducts = await TrackedProduct.countDocuments();
      const totalEvents = await ProductEvent.countDocuments();
      
      console.log(`📊 Cleanup complete: ${activeProducts}/${totalProducts} active products, ${totalEvents} total events`);
      
    } catch (error) {
      console.error('❌ Error during cleanup:', error);
    }
  }

  /**
   * Log worker statistics
   */
  logStats() {
    const successRate = this.stats.totalChecks > 0 
      ? (this.stats.successfulChecks / this.stats.totalChecks * 100).toFixed(1)
      : 0;
    
    console.log('📊 Worker Stats:');
    console.log(`  Total checks: ${this.stats.totalChecks}`);
    console.log(`  Success rate: ${successRate}%`);
    console.log(`  Last run: ${this.stats.lastRun ? this.stats.lastRun.toLocaleString() : 'Never'}`);
    console.log(`  Last duration: ${this.stats.runDuration ? Math.round(this.stats.runDuration/1000) + 's' : 'N/A'}`);
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasJob: !!this.currentJob,
      stats: this.stats
    };
  }

  /**
   * Force run monitoring cycle (for testing)
   */
  async forceRun() {
    if (this.isRunning) {
      throw new Error('Monitoring cycle already running');
    }
    
    await this.runMonitoringCycle();
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      lastRun: null,
      runDuration: 0
    };
    console.log('📊 Worker statistics reset');
  }
}

// Singleton instance
let workerInstance = null;

function getMonitoringWorker() {
  if (!workerInstance) {
    workerInstance = new MonitoringWorker();
  }
  return workerInstance;
}

module.exports = { MonitoringWorker, getMonitoringWorker };