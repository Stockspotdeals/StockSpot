const axios = require('axios');
const { ProductMonitor } = require('./ProductMonitor');
const { NotificationService } = require('./NotificationService');

/**
 * MultiRetailerFeed - Aggregates deals from multiple retailers
 * Supports: Amazon, Walmart, Target, Best Buy, GameStop, TCG, Sports Cards,
 * eBay, Newegg, StockX, Adorama, REI, Costco, Micro Center, Foot Locker,
 * Dick's Sporting Goods, Powell's Books, Backcountry
 */
class MultiRetailerFeed {
  constructor() {
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.feeds = new Map();
    this.initializeFeeds();
  }

  initializeFeeds() {
    console.log('📡 Initializing Multi-Retailer Feed System...');
    
    // MAJOR RETAILERS & MARKETPLACES
    this.feeds.set('amazon', {
      name: 'Amazon Deals & Restocks',
      category: 'Electronics & General',
      enabled: true,
      interval: 5 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('ebay', {
      name: 'eBay Flash Deals',
      category: 'Marketplace',
      enabled: process.env.EBAY_MONITORING_ENABLED !== 'false',
      interval: 10 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('walmart', {
      name: 'Walmart Limited & Hype Items',
      category: 'General Retail',
      enabled: process.env.WALMART_MONITORING_ENABLED === 'true',
      interval: 10 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('target', {
      name: 'Target Limited & Hype Items',
      category: 'General Retail',
      enabled: process.env.TARGET_MONITORING_ENABLED === 'true',
      interval: 10 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('costco', {
      name: 'Costco Member Deals',
      category: 'Wholesale',
      enabled: process.env.COSTCO_MONITORING_ENABLED !== 'false',
      interval: 12 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    // ELECTRONICS & TECH
    this.feeds.set('bestbuy', {
      name: 'Best Buy Limited & Hype Items',
      category: 'Electronics',
      enabled: process.env.BESTBUY_MONITORING_ENABLED === 'true',
      interval: 10 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('newegg', {
      name: 'Newegg Tech Deals',
      category: 'Electronics',
      enabled: process.env.NEWEGG_MONITORING_ENABLED !== 'false',
      interval: 10 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('microcenter', {
      name: 'Micro Center Tech Clearance',
      category: 'Electronics',
      enabled: process.env.MICROCENTER_MONITORING_ENABLED !== 'false',
      interval: 12 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('apple', {
      name: 'Apple Store Refurbished',
      category: 'Electronics',
      enabled: process.env.APPLE_MONITORING_ENABLED !== 'false',
      interval: 15 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    // GAMING & COLLECTIBLES
    this.feeds.set('gamestop', {
      name: 'GameStop Pre-Orders & Restocks',
      category: 'Gaming',
      enabled: process.env.GAMESTOP_MONITORING_ENABLED !== 'false',
      interval: 10 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('tcg', {
      name: 'Trading Card Game Drops',
      category: 'Collectibles',
      enabled: true,
      interval: 15 * 60 * 1000,
      lastRun: null,
      itemCount: 0,
      types: ['Pokemon', 'One Piece', 'Magic: The Gathering', 'Yu-Gi-Oh', 'Digimon']
    });

    this.feeds.set('stockx', {
      name: 'StockX Sneaker & Hype Drops',
      category: 'Collectibles',
      enabled: process.env.STOCKX_MONITORING_ENABLED !== 'false',
      interval: 10 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('sports-cards', {
      name: 'Sports Card Drops',
      category: 'Collectibles',
      enabled: true,
      interval: 15 * 60 * 1000,
      lastRun: null,
      itemCount: 0,
      sports: ['NBA', 'NFL', 'MLB', 'NHL', 'NCAAB']
    });

    // SPECIALTY RETAILERS
    this.feeds.set('adorama', {
      name: 'Adorama Camera Deals',
      category: 'Photography',
      enabled: process.env.ADORAMA_MONITORING_ENABLED !== 'false',
      interval: 12 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('bh-photo', {
      name: 'B&H Photo Video Deals',
      category: 'Photography',
      enabled: process.env.BH_PHOTO_MONITORING_ENABLED !== 'false',
      interval: 12 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('rei', {
      name: 'REI Outdoor Gear Sales',
      category: 'Sports & Outdoor',
      enabled: process.env.REI_MONITORING_ENABLED !== 'false',
      interval: 12 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('backcountry', {
      name: 'Backcountry Outdoor Deals',
      category: 'Sports & Outdoor',
      enabled: process.env.BACKCOUNTRY_MONITORING_ENABLED !== 'false',
      interval: 12 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('footlocker', {
      name: 'Foot Locker Sneaker Releases',
      category: 'Footwear',
      enabled: process.env.FOOTLOCKER_MONITORING_ENABLED !== 'false',
      interval: 8 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('dickssports', {
      name: "Dick's Sporting Goods Sales",
      category: 'Sports & Fitness',
      enabled: process.env.DICKSSPORTS_MONITORING_ENABLED !== 'false',
      interval: 12 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('powells', {
      name: "Powell's Books Rare & New Releases",
      category: 'Books',
      enabled: process.env.POWELLS_MONITORING_ENABLED !== 'false',
      interval: 24 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('barnes-noble', {
      name: "Barnes & Noble Book Sales",
      category: 'Books',
      enabled: process.env.BARNES_NOBLE_MONITORING_ENABLED !== 'false',
      interval: 24 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    // NOTIFICATIONS & FEEDS
    this.feeds.set('email', {
      name: 'Email Notification Feed',
      category: 'Notifications',
      enabled: process.env.EMAIL_ENABLED === 'true',
      interval: 30 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.feeds.set('rss', {
      name: 'RSS Feed Generation',
      category: 'Notifications',
      enabled: process.env.RSS_ENABLED === 'true',
      interval: 5 * 60 * 1000,
      lastRun: null,
      itemCount: 0
    });

    this.logFeedStatus();
  }

  logFeedStatus() {
    console.log('\n🔄 Feed Status (Organized by Category):');
    
    const categories = {};
    for (const [key, feed] of this.feeds) {
      const cat = feed.category || 'Other';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ key, feed });
    }

    for (const [category, feeds] of Object.entries(categories)) {
      console.log(`\n  📂 ${category}`);
      feeds.forEach(({ key, feed }) => {
        const status = feed.enabled ? '✅' : '⏭️';
        console.log(`     ${status} ${feed.name}`);
      });
    }
    console.log('');
  }

  /**
   * Get mock data for dry-run mode - NOW WITH 20+ RETAILERS
   */
  getMockFeedData() {
    const mockItems = [
      // Electronics
      { id: 'amazon-1', retailer: 'Amazon', title: 'Premium Wireless Headphones - Limited Deal', price: 79.99, originalPrice: 199.99, category: 'Electronics', discount: 60, itemType: 'Limited Stock' },
      { id: 'bestbuy-1', retailer: 'Best Buy', title: 'Gaming Laptop - New Release', price: 1299.99, originalPrice: 1999.99, category: 'Electronics', discount: 35, itemType: 'Limited Stock' },
      { id: 'newegg-1', retailer: 'Newegg', title: 'RTX 4080 Graphics Card - Restock', price: 1199.99, originalPrice: 1499.99, category: 'Electronics', discount: 20, itemType: 'Restock Alert' },
      { id: 'microcenter-1', retailer: 'Micro Center', title: 'Intel Core i9-14900K - Flash Sale', price: 599.99, originalPrice: 699.99, category: 'Electronics', discount: 14, itemType: 'Flash Sale' },
      { id: 'apple-1', retailer: 'Apple Store', title: 'MacBook Pro 14" M3 Max - Refurbished', price: 1899.99, originalPrice: 2499.99, category: 'Electronics', discount: 24, itemType: 'Refurbished' },
      
      // General Retail
      { id: 'walmart-1', retailer: 'Walmart', title: '4K Smart TV - Hype Release', price: 299.99, originalPrice: 799.99, category: 'Electronics', discount: 62, itemType: 'Limited Stock' },
      { id: 'target-1', retailer: 'Target', title: 'Designer Handbag - Flash Sale', price: 89.99, originalPrice: 249.99, category: 'Fashion', discount: 64, itemType: 'Flash Sale' },
      { id: 'ebay-1', retailer: 'eBay', title: 'Vintage Camera Collection - Auction Ending', price: 149.99, originalPrice: 300.00, category: 'Collectibles', discount: 50, itemType: 'Limited Time' },
      { id: 'costco-1', retailer: 'Costco', title: 'Bulk Snack Bundle - Member Deal', price: 34.99, originalPrice: 59.99, category: 'General', discount: 42, itemType: 'Member Only' },
      
      // Collectibles & Gaming
      { id: 'tcg-1', retailer: 'TCG Provider', title: 'Pokemon Scarlet & Violet Booster Box', price: 89.99, originalPrice: 120.00, category: 'Pokemon TCG', discount: 25, itemType: 'Restock' },
      { id: 'stockx-1', retailer: 'StockX', title: 'Air Jordan 1 Retro High OG Travis Scott', price: 2499.99, originalPrice: 4000.00, category: 'Sneakers', discount: 37, itemType: 'Limited Release' },
      { id: 'sports-1', retailer: 'Sports Card Distributor', title: 'NBA 2024-25 Rookie Cards Blaster Box', price: 149.99, originalPrice: 200.00, category: 'NBA Cards', discount: 25, itemType: 'New Drop' },
      { id: 'gamestop-1', retailer: 'GameStop', title: 'PS5 Exclusive Pre-Order Bundle', price: 649.99, originalPrice: 899.99, category: 'Gaming', discount: 28, itemType: 'Pre-Order' },
      
      // Specialty
      { id: 'adorama-1', retailer: 'Adorama', title: 'Sony A7IV Camera Body - Open Box', price: 1799.99, originalPrice: 2498.00, category: 'Photography', discount: 28, itemType: 'Open Box Deal' },
      { id: 'bh-1', retailer: 'B&H Photo', title: 'Canon EF 24-70mm f/2.8L II Lens', price: 1299.99, originalPrice: 1799.99, category: 'Photography', discount: 28, itemType: 'Clearance' },
      { id: 'rei-1', retailer: 'REI', title: 'The North Face Backpacking Tent - Sale', price: 249.99, originalPrice: 399.99, category: 'Outdoor', discount: 37, itemType: 'Seasonal Sale' },
      { id: 'backcountry-1', retailer: 'Backcountry', title: 'Arc\'teryx Ski Jacket - Closeout', price: 399.99, originalPrice: 899.99, category: 'Outdoor', discount: 55, itemType: 'Closeout' },
      { id: 'footlocker-1', retailer: 'Foot Locker', title: 'Nike Dunk Low Retro - Release', price: 119.99, originalPrice: 119.99, category: 'Footwear', discount: 0, itemType: 'New Release' },
      { id: 'dicks-1', retailer: "Dick's Sporting Goods", title: 'Spalding Basketball Pro Edition', price: 59.99, originalPrice: 99.99, category: 'Sports', discount: 40, itemType: 'Sale' },
      
      // Books
      { id: 'powells-1', retailer: "Powell's Books", title: 'Rare First Edition - Limited Inventory', price: 149.99, originalPrice: 350.00, category: 'Books', discount: 57, itemType: 'Rare Find' },
      { id: 'barnes-1', retailer: "Barnes & Noble", title: 'Latest Bestseller Hardcover Bundle', price: 39.99, originalPrice: 89.99, category: 'Books', discount: 55, itemType: 'Flash Sale' }
    ];

    return mockItems;
  }

  /**
   * Process a feed item and create notifications
   */
  async processFeedItem(item) {
    try {
      // In production, this would integrate with ProductMonitor
      // For now, just track the item count
      for (const [key, feed] of this.feeds) {
        if (feed.enabled) {
          feed.itemCount += 1;
        }
      }
      return { success: true, itemId: item.id };
    } catch (error) {
      console.error(`❌ Error processing feed item ${item.id}:`, error.message);
      return { success: false, itemId: item.id, error: error.message };
    }
  }

  /**
   * Get current feed statistics
   */
  getStats() {
    const stats = {
      feeds: {},
      totalFeeds: this.feeds.size,
      enabledFeeds: 0,
      totalItems: 0
    };

    for (const [key, feed] of this.feeds) {
      stats.feeds[key] = {
        name: feed.name,
        enabled: feed.enabled,
        interval: `${feed.interval / 60000}min`,
        lastRun: feed.lastRun,
        itemCount: feed.itemCount
      };

      if (feed.enabled) {
        stats.enabledFeeds += 1;
      }
      stats.totalItems += feed.itemCount;
    }

    return stats;
  }

  /**
   * Simulate feed processing in dry-run mode
   */
  async simulateDryRun() {
    console.log('\n🧪 Starting Multi-Retailer Feed Dry-Run Simulation...\n');

    const mockItems = this.getMockFeedData();
    const results = [];

    for (const item of mockItems) {
      const result = await this.processFeedItem(item);
      results.push(result);
      console.log(`  ✅ ${item.retailer}: "${item.title}" (${item.discount}% off)`);
    }

    const stats = this.getStats();
    console.log('\n📊 Feed Statistics:');
    console.log(`  Total Feeds: ${stats.totalFeeds}`);
    console.log(`  Enabled Feeds: ${stats.enabledFeeds}`);
    console.log(`  Items Processed: ${stats.totalItems}`);
    console.log('');

    return {
      success: true,
      processedItems: results.length,
      stats: stats
    };
  }
}

module.exports = { MultiRetailerFeed };
