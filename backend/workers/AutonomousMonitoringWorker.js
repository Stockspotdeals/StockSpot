const { ProductMonitor } = require('../services/ProductMonitor');
const RedditPoster = require('../services/RedditPoster');
const { TrackedProduct } = require('../models/TrackedProduct');

class AutonomousMonitoringWorker {
  constructor() {
    this.productMonitor = new ProductMonitor();
    this.redditPoster = new RedditPoster();
    this.isRunning = false;
    this.intervalId = null;
    this.stats = {
      dealsFound: 0,
      restocks: 0,
      priceDrops: 0,
      totalSavings: 0,
      postsAttempted: 0,
      postsSuccessful: 0,
      lastReset: new Date()
    };
  }

  /**
   * Start the autonomous monitoring system
   */
  async start() {
    if (this.isRunning) {
      console.log('Worker already running');
      return;
    }

    console.log('🚀 Starting StockSpot Autonomous Deal Bot...');
    
    // Send startup notification
    try {
      const connection = await this.redditPoster.testConnection();
      if (connection.success) {
        console.log(`🔗 Reddit connected as u/${connection.username}`);
      }
    } catch (error) {
      console.error('Failed to test Reddit connection:', error);
    }

    this.isRunning = true;
    
    // Run immediately on startup
    await this.runMonitoringCycle();
    
    // Schedule regular monitoring (every 5 minutes)
    this.intervalId = setInterval(async () => {
      try {
        await this.runMonitoringCycle();
      } catch (error) {
        console.error('Error in monitoring cycle interval:', error);
      }
    }, 5 * 60 * 1000); // 5 minutes

    // Schedule daily summary (every 24 hours)
    this.scheduleDailySummary();

    console.log('✅ Autonomous monitoring started - checking every 5 minutes');
  }

  /**
   * Stop the monitoring system
   */
  stop() {
    if (!this.isRunning) {
      console.log('Worker not running');
      return;
    }

    console.log('🛑 Stopping autonomous monitoring...');
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('✅ Autonomous monitoring stopped');
  }

  /**
   * Run a complete monitoring cycle
   */
  async runMonitoringCycle() {
    try {
      console.log('🔍 Starting monitoring cycle...');
      
      // Get all active products
      const products = await this.productMonitor.getProductsDueForCheck();
      console.log(`Found ${products.length} products to monitor`);

      if (products.length === 0) {
        console.log('No products to monitor');
        return;
      }

      // Monitor products in batches
      const results = await this.productMonitor.monitorProducts(products);
      
      // Process results and update stats
      let successCount = 0;
      let errorCount = 0;
      
      for (const result of results) {
        if (result.success) {
          successCount++;
          if (result.result && result.result.changes) {
            this.updateStats(result.result.changes);
          }
        } else {
          errorCount++;
          console.error(`Product ${result.productId} failed: ${result.error}`);
        }
      }

      console.log(`✅ Monitoring cycle complete: ${successCount} successful, ${errorCount} errors`);
      
    } catch (error) {
      console.error('Error in monitoring cycle:', error);
    }
  }

  /**
   * Update statistics based on detected changes
   */
  updateStats(changes) {
    for (const change of changes) {
      switch (change.type) {
        case 'restock':
          this.stats.restocks++;
          this.stats.dealsFound++;
          break;
        
        case 'price_change':
          if (change.newValue < change.oldValue) {
            this.stats.priceDrops++;
            this.stats.dealsFound++;
            this.stats.totalSavings += (change.oldValue - change.newValue);
          }
          break;
        
        case 'target_price_reached':
          this.stats.dealsFound++;
          break;
      }
    }
  }

  /**
   * Schedule daily summary notifications
   */
  scheduleDailySummary() {
    // Calculate time until next 9 AM
    const now = new Date();
    const nextNineAM = new Date();
    nextNineAM.setHours(9, 0, 0, 0);
    
    if (nextNineAM <= now) {
      // If it's already past 9 AM today, schedule for tomorrow
      nextNineAM.setDate(nextNineAM.getDate() + 1);
    }
    
    const timeUntilNineAM = nextNineAM.getTime() - now.getTime();
    
    setTimeout(() => {
      this.sendDailySummary();
      
      // Then repeat every 24 hours
      setInterval(() => {
        this.sendDailySummary();
      }, 24 * 60 * 60 * 1000);
      
    }, timeUntilNineAM);
    
    console.log(`📅 Daily summary scheduled for ${nextNineAM.toLocaleString()}`);
  }

  /**
   * Send daily summary and reset stats
   */
  async sendDailySummary() {
    try {
      await this.redditNotifier.sendDailySummary(this.stats);
      
      // Reset daily stats
      this.stats = {
        dealsFound: 0,
        restocks: 0,
        priceDrops: 0,
        totalSavings: 0,
        lastReset: new Date()
      };
      
      console.log('📊 Daily summary sent and stats reset');
    } catch (error) {
      console.error('Failed to send daily summary:', error);
    }
  }

  /**
   * Add a new product to monitor
   */
  async addProduct(url, options = {}) {
    try {
      const productData = {
        url,
        isActive: true,
        createdAt: new Date(),
        lastCheckedAt: null,
        nextCheck: new Date(), // Check immediately
        ...options
      };

      const product = new TrackedProduct(productData);
      await product.save();
      
      console.log(`➕ Added new product to monitor: ${url}`);
      
      // Notify about new product
      // Post deal to Reddit
      this.stats.postsAttempted++;
      const result = await this.redditPoster.postDeal(product, 'new_deal');
      
      if (result.success) {
        this.stats.postsSuccessful++;
        console.log(`📬 Deal posted successfully: ${result.title}`);
        
        // Add affiliate disclosure comment if needed
        if (product.affiliateUrl && product.affiliateUrl !== product.url) {
          await this.redditPoster.addComment(result.postId, 'Disclosure: This post may contain affiliate links.');
        }
      } else {
        console.log(`⚠️ Post skipped: ${result.reason}`);
      }
      
      return product;
    } catch (error) {
      console.error('Failed to add product:', error);
      throw error;
    }
  }

  /**
   * Remove a product from monitoring
   */
  async removeProduct(productId) {
    try {
      const result = await TrackedProduct.findByIdAndDelete(productId);
      if (result) {
        console.log(`➖ Removed product from monitoring: ${productId}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to remove product:', error);
      throw error;
    }
  }

  /**
   * Get current monitoring statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      uptime: this.isRunning ? Date.now() - this.stats.lastReset.getTime() : 0
    };
  }

  /**
   * Health check for the monitoring system
   */
  async healthCheck() {
    try {
      // Check Reddit connection
      const redditTest = await this.redditPoster.testConnection();
      
      return {
        status: 'healthy',
        isRunning: this.isRunning,
        activeProducts: productCount,
        redditConnected: redditTest.success,
        subredditStats: this.redditPoster.getSubredditStats(),
        lastCycle: new Date(),
        stats: this.stats
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        isRunning: this.isRunning,
        lastCycle: new Date()
      };
    }
  }
}

// Singleton instance
let workerInstance = null;

function getWorkerInstance() {
  if (!workerInstance) {
    workerInstance = new AutonomousMonitoringWorker();
  }
  return workerInstance;
}

module.exports = { 
  AutonomousMonitoringWorker,
  getWorkerInstance
};