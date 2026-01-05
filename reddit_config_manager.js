const { getSubredditConfig } = require('./backend/services/SubredditConfig');

/**
 * StockSpot Reddit Configuration Management Utility
 * Provides CLI tools for managing subreddit settings, cooldowns, and posting rules
 */

class RedditConfigManager {
  constructor() {
    this.config = getSubredditConfig();
  }

  /**
   * Display comprehensive status of all subreddits
   */
  showStatus() {
    console.log('\n📊 StockSpot Reddit Posting Status');
    console.log('=' .repeat(50));
    
    const stats = this.config.getStats();
    
    Object.entries(stats).forEach(([subreddit, stat]) => {
      const status = stat.disabled ? '⛔ DISABLED' : 
                     stat.canPost ? '✅ READY' : '⏳ COOLDOWN';
      
      console.log(`\nr/${subreddit} - ${status}`);
      console.log(`  Categories: ${stat.category.join(', ')}`);
      console.log(`  Cooldown: ${stat.cooldownHours}h (${stat.hoursSinceLastPost}h since last post)`);
      console.log(`  Daily Posts: ${stat.dailyPosts}/${stat.maxDailyPosts}`);
      console.log(`  Affiliate Links: ${stat.affiliateAllowed ? 'Allowed' : 'Blocked'}`);
      
      if (!stat.canPost && !stat.disabled) {
        console.log(`  Next post available in: ${stat.hoursUntilCanPost}h`);
      }
    });
    
    console.log('\n📈 Summary:');
    const totalSubreddits = Object.keys(stats).length;
    const availableSubreddits = Object.values(stats).filter(s => s.canPost && !s.disabled).length;
    const disabledSubreddits = Object.values(stats).filter(s => s.disabled).length;
    
    console.log(`  Total Subreddits: ${totalSubreddits}`);
    console.log(`  Available for Posting: ${availableSubreddits}`);
    console.log(`  On Cooldown: ${totalSubreddits - availableSubreddits - disabledSubreddits}`);
    console.log(`  Disabled: ${disabledSubreddits}`);
  }

  /**
   * Show routing for specific category
   */
  showCategoryRouting(category) {
    console.log(`\n🎯 Category Routing: ${category}`);
    console.log('=' .repeat(30));
    
    const validSubreddits = this.config.getValidSubreddits(category);
    const selection = this.config.selectBestSubreddit(category);
    
    if (validSubreddits.length === 0) {
      console.log('❌ No valid subreddits for this category');
      return;
    }
    
    console.log('Valid Subreddits:');
    validSubreddits.forEach(sub => {
      const canPost = this.config.canPostToCooldown(sub) && this.config.canPostToDailyLimit(sub);
      const status = sub.disabled ? '⛔' : canPost ? '✅' : '⏳';
      
      console.log(`  ${status} r/${sub.name} (${sub.minCooldownHours}h cooldown, ${sub.dailyPosts}/${sub.maxPostsPerDay} daily)`);
    });
    
    console.log(`\nSelected: ${selection.subreddit ? `r/${selection.subreddit.name}` : 'None'}`);
    console.log(`Reason: ${selection.reason}`);
  }

  /**
   * Disable a subreddit
   */
  disableSubreddit(subredditName, reason) {
    this.config.disableSubreddit(subredditName, reason);
    console.log(`\n⛔ Disabled r/${subredditName}: ${reason}`);
  }

  /**
   * Enable a disabled subreddit
   */
  enableSubreddit(subredditName) {
    this.config.enableSubreddit(subredditName);
    console.log(`\n✅ Enabled r/${subredditName}`);
  }

  /**
   * Reset all cooldowns (for testing)
   */
  resetCooldowns() {
    Object.values(this.config.subreddits).forEach(config => {
      config.lastPost = 0;
      config.dailyPosts = 0;
      config.lastDayReset = Date.now();
    });
    
    this.config.saveState();
    console.log('\n🔄 All cooldowns and daily counters reset');
  }

  /**
   * Show posted products history
   */
  showPostHistory(limit = 10) {
    console.log(`\n📝 Recent Posted Products (Last ${limit})`);
    console.log('=' .repeat(40));
    
    const products = Object.entries(this.config.state.postedProducts || {})
      .map(([productId, posts]) => ({
        productId,
        posts: posts.sort((a, b) => b.timestamp - a.timestamp)
      }))
      .sort((a, b) => b.posts[0]?.timestamp - a.posts[0]?.timestamp)
      .slice(0, limit);
    
    if (products.length === 0) {
      console.log('No posted products found');
      return;
    }
    
    products.forEach(({ productId, posts }) => {
      console.log(`\n${productId}:`);
      posts.forEach(post => {
        const timeAgo = Math.floor((Date.now() - post.timestamp) / (60 * 60 * 1000));
        console.log(`  r/${post.subreddit} - ${timeAgo}h ago`);
      });
    });
  }

  /**
   * Test posting logic without actually posting
   */
  testPostingLogic(category, productName = 'Test Product') {
    console.log(`\n🧪 Testing Posting Logic for Category: ${category}`);
    console.log('=' .repeat(50));
    
    const testProduct = {
      id: `test-${Date.now()}`,
      name: productName,
      category: category,
      currentPrice: 29.99,
      originalPrice: 49.99,
      url: 'https://example.com/test-product'
    };
    
    // Check for recent duplicates
    const hasRecent = this.config.hasPostedProductRecently(testProduct.id);
    console.log(`Duplicate check: ${hasRecent ? '❌ Recently posted' : '✅ New product'}`);
    
    // Get valid subreddits
    const validSubreddits = this.config.getValidSubreddits(category);
    console.log(`\nValid subreddits: ${validSubreddits.length}`);
    
    if (validSubreddits.length === 0) {
      console.log('❌ No subreddits available for this category');
      return;
    }
    
    // Show selection logic
    const selection = this.config.selectBestSubreddit(category);
    
    console.log('\nSubreddit Analysis:');
    validSubreddits.forEach(sub => {
      const cooldownPassed = this.config.canPostToCooldown(sub);
      const dailyLimitOk = this.config.canPostToDailyLimit(sub);
      const available = cooldownPassed && dailyLimitOk && !sub.disabled;
      
      const status = sub.disabled ? '⛔ Disabled' : 
                     !cooldownPassed ? '⏳ Cooldown' :
                     !dailyLimitOk ? '📊 Daily Limit' : 
                     '✅ Available';
      
      console.log(`  r/${sub.name}: ${status}`);
    });
    
    console.log(`\nFinal Selection: ${selection.subreddit ? `r/${selection.subreddit.name}` : 'None'}`);
    console.log(`Selection Reason: ${selection.reason}`);
    
    if (selection.subreddit) {
      const titleVariations = selection.subreddit.titleVariations;
      const randomTitle = titleVariations[Math.floor(Math.random() * titleVariations.length)]
        .replace('{name}', testProduct.name)
        .replace('${price}', testProduct.currentPrice);
      
      console.log(`\nGenerated Title: "${randomTitle}"`);
      console.log(`Post URL: ${testProduct.url}`);
    }
  }
}

// CLI interface
function printUsage() {
  console.log('\n🔧 StockSpot Reddit Configuration Manager');
  console.log('Usage: node reddit_config_manager.js <command> [args]');
  console.log('\nCommands:');
  console.log('  status                    - Show all subreddit status');
  console.log('  category <name>           - Show routing for specific category');
  console.log('  disable <subreddit> <reason> - Disable a subreddit');
  console.log('  enable <subreddit>        - Enable a disabled subreddit');
  console.log('  reset-cooldowns          - Reset all cooldowns (for testing)');
  console.log('  history [limit]          - Show posted products history');
  console.log('  test <category> [name]   - Test posting logic for category');
  console.log('\nExamples:');
  console.log('  node reddit_config_manager.js status');
  console.log('  node reddit_config_manager.js category pokemon_tcg');
  console.log('  node reddit_config_manager.js disable PokemonTCG "Temporary ban"');
  console.log('  node reddit_config_manager.js test gaming "Zelda BOTW"');
}

async function main() {
  const manager = new RedditConfigManager();
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    printUsage();
    return;
  }
  
  const command = args[0].toLowerCase();
  
  switch (command) {
    case 'status':
      manager.showStatus();
      break;
    
    case 'category':
      if (args.length < 2) {
        console.log('Error: Category name required');
        console.log('Usage: node reddit_config_manager.js category <name>');
        return;
      }
      manager.showCategoryRouting(args[1]);
      break;
    
    case 'disable':
      if (args.length < 3) {
        console.log('Error: Subreddit name and reason required');
        console.log('Usage: node reddit_config_manager.js disable <subreddit> <reason>');
        return;
      }
      manager.disableSubreddit(args[1], args.slice(2).join(' '));
      break;
    
    case 'enable':
      if (args.length < 2) {
        console.log('Error: Subreddit name required');
        console.log('Usage: node reddit_config_manager.js enable <subreddit>');
        return;
      }
      manager.enableSubreddit(args[1]);
      break;
    
    case 'reset-cooldowns':
      manager.resetCooldowns();
      break;
    
    case 'history':
      const limit = args[1] ? parseInt(args[1]) : 10;
      manager.showPostHistory(limit);
      break;
    
    case 'test':
      if (args.length < 2) {
        console.log('Error: Category required');
        console.log('Usage: node reddit_config_manager.js test <category> [name]');
        return;
      }
      const productName = args[2] || 'Test Product';
      manager.testPostingLogic(args[1], productName);
      break;
    
    default:
      console.log(`Error: Unknown command '${command}'`);
      printUsage();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error.message);
    process.exit(1);
  });
}

module.exports = RedditConfigManager;