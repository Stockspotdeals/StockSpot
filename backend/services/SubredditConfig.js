const fs = require('fs');
const path = require('path');

/**
 * Centralized Subreddit Configuration for StockSpot Reddit Bot
 * Defines all allowed subreddits with posting rules and restrictions
 */

class SubredditConfig {
  constructor() {
    this.configFile = path.join(__dirname, '..', '.subreddit_state.json');
    this.loadState();
    
    // Centralized subreddit configuration
    this.subreddits = {
      'PokemonTCG': {
        name: 'PokemonTCG',
        allowedCategories: ['pokemon_tcg'],
        minCooldownHours: 6,
        maxPostsPerDay: 3,
        affiliateAllowed: true,
        lastPost: this.state.lastPosts?.['PokemonTCG'] || 0,
        dailyPosts: this.state.dailyPosts?.['PokemonTCG'] || 0,
        lastDayReset: this.state.lastDayReset?.['PokemonTCG'] || Date.now(),
        disabled: false,
        titleVariations: [
          '{name} - ${price}',
          'Deal Alert: {name} - ${price}',
          '{name} available for ${price}',
          'In stock: {name} - ${price}'
        ]
      },
      'OnePieceTCG': {
        name: 'OnePieceTCG',
        allowedCategories: ['one_piece_tcg'],
        minCooldownHours: 6,
        maxPostsPerDay: 3,
        affiliateAllowed: true,
        lastPost: this.state.lastPosts?.['OnePieceTCG'] || 0,
        dailyPosts: this.state.dailyPosts?.['OnePieceTCG'] || 0,
        lastDayReset: this.state.lastDayReset?.['OnePieceTCG'] || Date.now(),
        disabled: false,
        titleVariations: [
          '{name} - ${price}',
          'One Piece TCG Deal: {name} - ${price}',
          '{name} now available - ${price}',
          'TCG Deal: {name} - ${price}'
        ]
      },
      'tradingcardcommunity': {
        name: 'tradingcardcommunity',
        allowedCategories: ['sports_cards', 'pokemon_tcg', 'one_piece_tcg'],
        minCooldownHours: 4,
        maxPostsPerDay: 4,
        affiliateAllowed: true,
        lastPost: this.state.lastPosts?.['tradingcardcommunity'] || 0,
        dailyPosts: this.state.dailyPosts?.['tradingcardcommunity'] || 0,
        lastDayReset: this.state.lastDayReset?.['tradingcardcommunity'] || Date.now(),
        disabled: false,
        titleVariations: [
          '{name} - ${price}',
          'Sports Card Deal: {name} - ${price}',
          '{name} available - ${price}',
          'Trading Card Alert: {name} - ${price}'
        ]
      },
      'GameDeals': {
        name: 'GameDeals',
        allowedCategories: ['gaming'],
        minCooldownHours: 4,
        maxPostsPerDay: 5,
        affiliateAllowed: true,
        lastPost: this.state.lastPosts?.['GameDeals'] || 0,
        dailyPosts: this.state.dailyPosts?.['GameDeals'] || 0,
        lastDayReset: this.state.lastDayReset?.['GameDeals'] || Date.now(),
        disabled: false,
        titleVariations: [
          '{name} - ${price}',
          'Gaming Deal: {name} - ${price}',
          '{name} on sale - ${price}',
          'Game Alert: {name} - ${price}'
        ]
      },
      'deals': {
        name: 'deals',
        allowedCategories: ['electronics', 'collectibles', 'toys', 'other'],
        minCooldownHours: 8,
        maxPostsPerDay: 2,
        affiliateAllowed: true,
        lastPost: this.state.lastPosts?.['deals'] || 0,
        dailyPosts: this.state.dailyPosts?.['deals'] || 0,
        lastDayReset: this.state.lastDayReset?.['deals'] || Date.now(),
        disabled: false,
        titleVariations: [
          '{name} - ${price}',
          'Deal Alert: {name} - ${price}',
          '{name} discounted to ${price}',
          'Hot Deal: {name} - ${price}'
        ]
      },
      'collectibles': {
        name: 'collectibles',
        allowedCategories: ['collectibles', 'pokemon_tcg', 'one_piece_tcg', 'sports_cards'],
        minCooldownHours: 6,
        maxPostsPerDay: 3,
        affiliateAllowed: true,
        lastPost: this.state.lastPosts?.['collectibles'] || 0,
        dailyPosts: this.state.dailyPosts?.['collectibles'] || 0,
        lastDayReset: this.state.lastDayReset?.['collectibles'] || Date.now(),
        disabled: false,
        titleVariations: [
          '{name} - ${price}',
          'Collectible Deal: {name} - ${price}',
          '{name} available for ${price}',
          'Collector Alert: {name} - ${price}'
        ]
      },
      'toys': {
        name: 'toys',
        allowedCategories: ['toys'],
        minCooldownHours: 8,
        maxPostsPerDay: 2,
        affiliateAllowed: true,
        lastPost: this.state.lastPosts?.['toys'] || 0,
        dailyPosts: this.state.dailyPosts?.['toys'] || 0,
        lastDayReset: this.state.lastDayReset?.['toys'] || Date.now(),
        disabled: false,
        titleVariations: [
          '{name} - ${price}',
          'Toy Deal: {name} - ${price}',
          '{name} on sale - ${price}',
          'Kids Deal: {name} - ${price}'
        ]
      }
    };
  }

  /**
   * Load persistent state from file
   */
  loadState() {
    try {
      if (fs.existsSync(this.configFile)) {
        this.state = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
      } else {
        this.state = {
          lastPosts: {},
          dailyPosts: {},
          lastDayReset: {},
          postedProducts: {},
          disabledSubreddits: []
        };
        this.saveState();
      }
    } catch (error) {
      console.error('Failed to load subreddit state:', error);
      this.state = {
        lastPosts: {},
        dailyPosts: {},
        lastDayReset: {},
        postedProducts: {},
        disabledSubreddits: []
      };
    }
  }

  /**
   * Save state to persistent storage
   */
  saveState() {
    try {
      // Update state from current subreddit values
      if (this.subreddits) {
        Object.values(this.subreddits).forEach(config => {
          this.state.lastPosts[config.name] = config.lastPost;
          this.state.dailyPosts[config.name] = config.dailyPosts;
          this.state.lastDayReset[config.name] = config.lastDayReset;
        });
      }

      fs.writeFileSync(this.configFile, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('Failed to save subreddit state:', error);
    }
  }

  /**
   * Get valid subreddits for a product category
   */
  getValidSubreddits(category) {
    return Object.values(this.subreddits).filter(config => 
      config.allowedCategories.includes(category) && !config.disabled
    );
  }

  /**
   * Select the best subreddit for posting based on cooldowns and limits
   */
  selectBestSubreddit(category) {
    const validSubreddits = this.getValidSubreddits(category);
    
    if (validSubreddits.length === 0) {
      return { subreddit: null, reason: 'no_valid_subreddits' };
    }

    // Filter by cooldown and daily limits
    const availableSubreddits = validSubreddits.filter(config => {
      const cooldownPassed = this.canPostToCooldown(config);
      const dailyLimitOk = this.canPostToDailyLimit(config);
      return cooldownPassed && dailyLimitOk;
    });

    if (availableSubreddits.length === 0) {
      return { subreddit: null, reason: 'all_on_cooldown_or_limit' };
    }

    // Select subreddit with longest elapsed time since last post
    const bestSubreddit = availableSubreddits.reduce((best, current) => {
      const currentElapsed = Date.now() - current.lastPost;
      const bestElapsed = Date.now() - best.lastPost;
      return currentElapsed > bestElapsed ? current : best;
    });

    return { subreddit: bestSubreddit, reason: 'selected' };
  }

  /**
   * Check if subreddit cooldown has passed
   */
  canPostToCooldown(config) {
    const cooldownMs = config.minCooldownHours * 60 * 60 * 1000;
    return (Date.now() - config.lastPost) >= cooldownMs;
  }

  /**
   * Check if daily posting limit allows more posts
   */
  canPostToDailyLimit(config) {
    this.resetDailyCountIfNeeded(config);
    return config.dailyPosts < config.maxPostsPerDay;
  }

  /**
   * Reset daily post count if 24 hours have passed
   */
  resetDailyCountIfNeeded(config) {
    const hoursSinceReset = (Date.now() - config.lastDayReset) / (60 * 60 * 1000);
    if (hoursSinceReset >= 24) {
      config.dailyPosts = 0;
      config.lastDayReset = Date.now();
    }
  }

  /**
   * Record successful post to subreddit
   */
  recordPost(subredditName, productId) {
    const config = this.subreddits[subredditName];
    if (!config) return;

    config.lastPost = Date.now();
    config.dailyPosts++;
    
    // Track posted products to prevent duplicates
    if (!this.state.postedProducts[productId]) {
      this.state.postedProducts[productId] = [];
    }
    this.state.postedProducts[productId].push({
      subreddit: subredditName,
      timestamp: Date.now()
    });

    this.saveState();
  }

  /**
   * Check if product has been posted recently (within 24 hours)
   */
  hasPostedProductRecently(productId) {
    const posts = this.state.postedProducts[productId];
    if (!posts || posts.length === 0) return false;

    const last24Hours = Date.now() - (24 * 60 * 60 * 1000);
    return posts.some(post => post.timestamp > last24Hours);
  }

  /**
   * Disable a subreddit (e.g., due to bans or restrictions)
   */
  disableSubreddit(subredditName, reason) {
    const config = this.subreddits[subredditName];
    if (config) {
      config.disabled = true;
      this.state.disabledSubreddits.push({
        name: subredditName,
        reason,
        timestamp: Date.now()
      });
      this.saveState();
      console.log(`🚫 Disabled subreddit r/${subredditName}: ${reason}`);
    }
  }

  /**
   * Re-enable a disabled subreddit
   */
  enableSubreddit(subredditName) {
    const config = this.subreddits[subredditName];
    if (config) {
      config.disabled = false;
      this.state.disabledSubreddits = this.state.disabledSubreddits.filter(
        item => item.name !== subredditName
      );
      this.saveState();
      console.log(`✅ Re-enabled subreddit r/${subredditName}`);
    }
  }

  /**
   * Get posting statistics for all subreddits
   */
  getStats() {
    const stats = {};
    
    Object.entries(this.subreddits).forEach(([name, config]) => {
      this.resetDailyCountIfNeeded(config);
      
      const timeSinceLastPost = Date.now() - config.lastPost;
      const cooldownMs = config.minCooldownHours * 60 * 60 * 1000;
      const canPost = this.canPostToCooldown(config) && this.canPostToDailyLimit(config);
      
      stats[name] = {
        category: config.allowedCategories,
        canPost: canPost && !config.disabled,
        disabled: config.disabled,
        cooldownHours: config.minCooldownHours,
        hoursSinceLastPost: Math.floor(timeSinceLastPost / (60 * 60 * 1000)),
        hoursUntilCanPost: canPost ? 0 : Math.ceil((cooldownMs - timeSinceLastPost) / (60 * 60 * 1000)),
        dailyPosts: config.dailyPosts,
        maxDailyPosts: config.maxPostsPerDay,
        affiliateAllowed: config.affiliateAllowed
      };
    });
    
    return stats;
  }
}

// Singleton instance
let configInstance = null;

function getSubredditConfig() {
  if (!configInstance) {
    configInstance = new SubredditConfig();
  }
  return configInstance;
}

module.exports = { SubredditConfig, getSubredditConfig };