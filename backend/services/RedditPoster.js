const axios = require('axios');
const { getObserverMode } = require('./ObserverMode');
const { getSubredditConfig } = require('./SubredditConfig');

class RedditPoster {
  constructor() {
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.username = process.env.REDDIT_USERNAME;
    this.password = process.env.REDDIT_PASSWORD;
    this.userAgent = process.env.REDDIT_USER_AGENT || 'StockSpot/1.0.0 (Deal Bot)';
    
    this.accessToken = null;
    this.tokenExpiry = null;
    this.baseUrl = 'https://oauth.reddit.com';
    
    // DRY-RUN and REDDIT_ENABLED flags
    this.dryRun = process.env.DRY_RUN === 'true';
    this.redditEnabled = process.env.REDDIT_ENABLED !== 'false';
    
    // Use centralized subreddit configuration
    this.subredditConfig = getSubredditConfig();
    
    // Legacy mapping for backward compatibility (to be removed)
    this.legacyConfig = {
      'pokemon_tcg': {
        subreddit: 'PokemonTCG',
        lastPost: 0,
        cooldownHours: 6,
        titleVariations: [
          '{name} - ${price}',
          'Deal Alert: {name} - ${price}',
          '{name} available for ${price}',
          'In stock: {name} - ${price}'
        ]
      },
      'one_piece_tcg': {
        subreddit: 'OnePieceTCG',
        lastPost: 0,
        cooldownHours: 6,
        titleVariations: [
          '{name} - ${price}',
          'One Piece TCG Deal: {name} - ${price}',
          '{name} now available - ${price}',
          'TCG Deal: {name} - ${price}'
        ]
      },
      'sports_cards': {
        subreddit: 'tradingcardcommunity',
        lastPost: 0,
        cooldownHours: 4,
        titleVariations: [
          '{name} - ${price}',
          'Sports Card Deal: {name} - ${price}',
          '{name} available - ${price}',
          'Trading Card Alert: {name} - ${price}'
        ]
      },
      'gaming': {
        subreddit: 'GameDeals',
        lastPost: 0,
        cooldownHours: 4,
        titleVariations: [
          '{name} - ${price}',
          'Gaming Deal: {name} - ${price}',
          '{name} on sale - ${price}',
          'Game Alert: {name} - ${price}'
        ]
      },
      'electronics': {
        subreddit: 'deals',
        lastPost: 0,
        cooldownHours: 6,
        titleVariations: [
          '{name} - ${price}',
          'Electronics Deal: {name} - ${price}',
          '{name} discounted to ${price}',
          'Tech Deal: {name} - ${price}'
        ]
      },
      'collectibles': {
        subreddit: 'collectibles',
        lastPost: 0,
        cooldownHours: 6,
        titleVariations: [
          '{name} - ${price}',
          'Collectible Deal: {name} - ${price}',
          '{name} available for ${price}',
          'Collector Alert: {name} - ${price}'
        ]
      },
      'toys': {
        subreddit: 'toys',
        lastPost: 0,
        cooldownHours: 8,
        titleVariations: [
          '{name} - ${price}',
          'Toy Deal: {name} - ${price}',
          '{name} on sale - ${price}',
          'Kids Deal: {name} - ${price}'
        ]
      },
      'other': {
        subreddit: 'deals',
        lastPost: 0,
        cooldownHours: 8,
        titleVariations: [
          '{name} - ${price}',
          'Deal Alert: {name} - ${price}',
          '{name} discounted to ${price}',
          'Hot Deal: {name} - ${price}'
        ]
      }
    };
    
    this.observer = getObserverMode();
  }

  /**
   * Get Reddit OAuth access token
   */
  async authenticate() {
    if (this.dryRun) {
      console.log('🔒 [DRY-RUN] Skipping Reddit authentication');
      return 'dry-run-token';
    }

    if (!this.redditEnabled) {
      console.log('🔒 Reddit posting disabled via REDDIT_ENABLED=false');
      return null;
    }

    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
      
      const response = await axios.post('https://www.reddit.com/api/v1/access_token', 
        'grant_type=password&username=' + encodeURIComponent(this.username) + 
        '&password=' + encodeURIComponent(this.password),
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': this.userAgent
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000;
      
      console.log('✅ Reddit OAuth token obtained successfully');
      return this.accessToken;
    } catch (error) {
      console.error('❌ Reddit authentication failed:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Generate varied post title to avoid repetition
   */
  generateTitle(product, subredditConfig) {
    if (!subredditConfig || !subredditConfig.titleVariations.length) {
      return `${product.name} - $${product.currentPrice}`;
    }
    
    // Select random title variation
    const template = subredditConfig.titleVariations[Math.floor(Math.random() * subredditConfig.titleVariations.length)];
    
    return template
      .replace('{name}', product.name)
      .replace('${price}', product.currentPrice);
  }

  /**
   * Post deal to Reddit with enhanced safety checks, routing, and DRY-RUN support
   */
  async postDeal(product, dealType = 'price_drop') {
    try {
      const logPrefix = this.dryRun ? '[DRY-RUN]' : '';
      console.log(`🔍 ${logPrefix} Processing deal for product: ${product.name} (Category: ${product.category})`);

      // Reddit disabled check
      if (!this.redditEnabled) {
        console.log(`🔒 ${logPrefix} Reddit posting disabled via REDDIT_ENABLED=false`);
        return { success: false, reason: 'reddit_disabled', message: 'Reddit posting disabled' };
      }

      // Observer mode check
      if (!this.observer.canPost()) {
        console.log(`🔕 ${logPrefix} Observer mode active - simulating post activity`);
        if (!this.dryRun) {
          await this.observer.performObserverActivities(['deals']);
        }
        return { success: false, reason: 'observer_mode', message: 'Observer mode active - not posting yet' };
      }

      // Credentials check (skip in DRY-RUN)
      if (!this.dryRun && (!this.clientId || !this.clientSecret || !this.username || !this.password)) {
        console.error(`❌ ${logPrefix} Reddit credentials not configured`);
        return { success: false, reason: 'no_credentials', message: 'Reddit credentials missing' };
      }

      const category = product.category || 'other';
      const productId = product.id || product.url;
      const retailer = this.detectRetailer(product.url);
      const priceInfo = this.formatPriceInfo(product);
      
      // Check for recent duplicate posts
      if (this.subredditConfig.hasPostedProductRecently(productId)) {
        console.log(`🚫 ${logPrefix} Product ${product.name} was posted recently - skipping to avoid spam`);
        this.logDryRunSkip(product, category, retailer, priceInfo, 'duplicate_recent', 'Product posted recently');
        return { success: false, reason: 'duplicate_recent', message: 'Product posted recently' };
      }

      // Select best subreddit using intelligent routing
      const { subreddit: selectedSubreddit, reason: selectionReason } = this.subredditConfig.selectBestSubreddit(category);
      
      if (!selectedSubreddit) {
        console.log(`⏳ ${logPrefix} No available subreddits for category '${category}': ${selectionReason}`);
        this.logDryRunSkip(product, category, retailer, priceInfo, selectionReason, `No available subreddits for category ${category}`);
        return { 
          success: false, 
          reason: selectionReason,
          message: `No available subreddits for category ${category}`,
          category: category
        };
      }

      console.log(`🎯 ${logPrefix} Selected r/${selectedSubreddit.name} for category '${category}' (${selectedSubreddit.minCooldownHours}h cooldown)`);

      // Generate title using subreddit-specific variations
      const title = this.generateTitle(product, selectedSubreddit);
      const url = product.affiliateUrl || product.url;
      
      if (!url) {
        console.error(`❌ ${logPrefix} No URL available for product`);
        this.logDryRunSkip(product, category, retailer, priceInfo, 'no_url', 'Product URL missing');
        return { success: false, reason: 'no_url', message: 'Product URL missing' };
      }

      // Validate title format
      if (!this.isValidTitle(title)) {
        console.error(`❌ ${logPrefix} Generated title failed validation: ${title}`);
        this.logDryRunSkip(product, category, retailer, priceInfo, 'invalid_title', 'Title validation failed');
        return { success: false, reason: 'invalid_title', message: 'Title validation failed' };
      }

      // DRY-RUN: Log what would be posted
      if (this.dryRun) {
        this.logDryRunPost(product, category, retailer, priceInfo, selectedSubreddit.name, title, url, dealType);
        // In dry-run, still record the "post" to test duplicate detection
        this.subredditConfig.recordPost(selectedSubreddit.name, productId);
        return { 
          success: true, 
          dryRun: true,
          postId: 'dry-run-post-id', 
          postUrl: `https://reddit.com/r/${selectedSubreddit.name}/comments/dry-run`,
          subreddit: selectedSubreddit.name,
          title,
          category,
          message: 'DRY-RUN: Would have posted successfully'
        };
      }

      // LIVE POSTING: Authenticate with Reddit
      await this.authenticate();
      
      console.log(`📝 Posting: "${title}" to r/${selectedSubreddit.name}`);
      console.log(`🔗 URL: ${url}`);

      // Submit as link post
      const response = await axios.post(`${this.baseUrl}/api/submit`, {
        sr: selectedSubreddit.name,
        kind: 'link',
        title: title,
        url: url,
        api_type: 'json'
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent
        }
      });

      // Check for Reddit API errors
      if (response.data.json && response.data.json.errors && response.data.json.errors.length > 0) {
        const errors = response.data.json.errors;
        console.error('❌ Reddit API errors:', errors);
        
        // Handle specific error types
        if (errors.some(err => err[0] === 'RATELIMIT')) {
          console.log('⏳ Rate limit hit - will retry later');
          return { success: false, reason: 'rate_limit', errors, message: 'Reddit rate limit hit' };
        }
        
        if (errors.some(err => err[0] === 'ALREADY_SUB')) {
          console.log('🔄 URL already posted - marking as duplicate');
          this.subredditConfig.recordPost(selectedSubreddit.name, productId);
          return { success: false, reason: 'already_posted', errors, message: 'URL already posted' };
        }
        
        return { success: false, reason: 'api_error', errors, message: 'Reddit API error' };
      }

      // Record successful post
      this.subredditConfig.recordPost(selectedSubreddit.name, productId);
      
      const postId = response.data.json?.data?.name;
      const postUrl = postId ? `https://reddit.com/r/${selectedSubreddit.name}/comments/${postId.replace('t3_', '')}` : null;
      
      console.log(`✅ Successfully posted to r/${selectedSubreddit.name}`);
      console.log(`   Title: ${title}`);
      if (postUrl) console.log(`   URL: ${postUrl}`);
      
      return { 
        success: true, 
        postId, 
        postUrl,
        subreddit: selectedSubreddit.name,
        title,
        category,
        message: 'Posted successfully'
      };
      
    } catch (error) {
      const logPrefix = this.dryRun ? '[DRY-RUN]' : '';
      console.error(`❌ ${logPrefix} Reddit post failed:`, error.response?.data || error.message);
      
      // Handle authentication errors
      if (error.response?.status === 401) {
        console.log(`🔑 ${logPrefix} Authentication failed - resetting token`);
        this.accessToken = null;
        this.tokenExpiry = null;
        return { success: false, reason: 'auth_failed', message: 'Reddit authentication failed' };
      }
      
      // Handle rate limiting
      if (error.response?.status === 429) {
        console.log(`⏳ ${logPrefix} Rate limited by Reddit`);
        return { success: false, reason: 'rate_limited', message: 'Rate limited by Reddit' };
      }
      
      return { 
        success: false, 
        reason: 'network_error',
        message: error.message,
        error: error.response?.data || error.message 
      };
    }
  }

  /**
   * Get subreddit posting statistics and status
   */
  getPostingStats() {
    return this.subredditConfig.getStats();
  }

  /**
   * Disable a problematic subreddit
   */
  disableSubreddit(subredditName, reason) {
    this.subredditConfig.disableSubreddit(subredditName, reason);
  }

  /**
   * Re-enable a disabled subreddit
   */
  enableSubreddit(subredditName) {
    this.subredditConfig.enableSubreddit(subredditName);
  }

  /**
   * Add comment to existing post (for affiliate disclosure)
   */
  async addComment(postId, comment) {
    if (!this.observer.canPost()) {
      return { success: false, reason: 'observer_mode' };
    }

    try {
      await this.authenticate();
      
      const response = await axios.post(`${this.baseUrl}/api/comment`, {
        thing_id: postId,
        text: comment,
        api_type: 'json'
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent
        }
      });

      if (response.data.json?.errors?.length > 0) {
        console.error('Reddit comment errors:', response.data.json.errors);
        return { success: false, errors: response.data.json.errors };
      }

      console.log(`💬 Added comment to post ${postId}`);
      return { success: true };
      
    } catch (error) {
      console.error('Reddit comment failed:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Log what would be posted in DRY-RUN mode
   */
  logDryRunPost(product, category, retailer, priceInfo, subreddit, title, url, dealType) {
    console.log('\n' + '='.repeat(80));
    console.log('📋 [DRY-RUN] WOULD POST TO REDDIT');
    console.log('='.repeat(80));
    console.log(`Product Name: ${product.name}`);
    console.log(`Category: ${category}`);
    console.log(`Retailer: ${retailer}`);
    console.log(`${priceInfo}`);
    console.log(`Deal Type: ${dealType}`);
    console.log(`Selected Subreddit: r/${subreddit}`);
    console.log(`Generated Title: "${title}"`);
    console.log(`Post URL: ${url}`);
    console.log(`Amazon Associate ID: ${this.extractAssociateId(url) || 'None/Placeholder'}`);
    console.log('='.repeat(80));
  }

  /**
   * Log why a deal was skipped in DRY-RUN mode
   */
  logDryRunSkip(product, category, retailer, priceInfo, reason, message) {
    if (this.dryRun) {
      console.log('\n' + '-'.repeat(80));
      console.log('⏭️  [DRY-RUN] SKIPPED POSTING');
      console.log('-'.repeat(80));
      console.log(`Product Name: ${product.name}`);
      console.log(`Category: ${category}`);
      console.log(`Retailer: ${retailer}`);
      console.log(`${priceInfo}`);
      console.log(`Skip Reason: ${reason}`);
      console.log(`Message: ${message}`);
      console.log('-'.repeat(80));
    }
  }

  /**
   * Detect retailer from URL
   */
  detectRetailer(url) {
    if (!url) return 'Unknown';
    
    if (url.includes('amazon.com')) return 'Amazon';
    if (url.includes('bestbuy.com')) return 'Best Buy';
    if (url.includes('target.com')) return 'Target';
    if (url.includes('walmart.com')) return 'Walmart';
    if (url.includes('gamestop.com')) return 'GameStop';
    if (url.includes('pokemoncenter.com')) return 'Pokemon Center';
    
    // Extract domain for unknown retailers
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace('www.', '').replace('.com', '');
    } catch {
      return 'Unknown';
    }
  }

  /**
   * Format price information for logging
   */
  formatPriceInfo(product) {
    const current = product.currentPrice || product.price;
    const original = product.originalPrice;
    
    if (current && original && current !== original) {
      const discount = ((original - current) / original * 100).toFixed(0);
      return `Price: $${current} (was $${original}, ${discount}% off)`;
    } else if (current) {
      return `Price: $${current}`;
    }
    
    return 'Price: Not available';
  }

  /**
   * Extract Amazon Associate ID from URL
   */
  extractAssociateId(url) {
    if (!url || !url.includes('amazon.com')) return null;
    
    const tagMatch = url.match(/[?&]tag=([^&]+)/);
    return tagMatch ? tagMatch[1] : null;
  }

  /**
   * Validate title format for Reddit posting
   */
  isValidTitle(title) {
    if (!title || typeof title !== 'string') return false;
    
    // Check length (Reddit limit is 300 chars)
    if (title.length > 300) return false;
    
    // No all caps (more than 50% uppercase)
    const upperCount = (title.match(/[A-Z]/g) || []).length;
    const letterCount = (title.match(/[A-Za-z]/g) || []).length;
    if (letterCount > 0 && (upperCount / letterCount) > 0.5) return false;
    
    // No excessive emojis
    const emojiCount = (title.match(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu) || []).length;
    if (emojiCount > 2) return false;
    
    // No spam phrases
    const spamPhrases = ['BUY NOW', 'LIMITED TIME', 'ACT FAST', 'DONT MISS', 'URGENT', 'AMAZING DEAL'];
    const upperTitle = title.toUpperCase();
    if (spamPhrases.some(phrase => upperTitle.includes(phrase))) return false;
    
    return true;
  }

  /**
   * Test Reddit connection
   */
  async testConnection() {
    if (this.dryRun) {
      console.log('🔒 [DRY-RUN] Skipping Reddit connection test');
      return { success: true, username: 'dry-run-user', dryRun: true };
    }

    if (!this.redditEnabled) {
      console.log('🔒 Reddit connection test skipped - Reddit disabled');
      return { success: false, error: 'Reddit disabled via REDDIT_ENABLED=false' };
    }

    try {
      await this.authenticate();
      
      const response = await axios.get(`${this.baseUrl}/api/v1/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': this.userAgent
        }
      });
      
      console.log('✅ Reddit connection test successful:', response.data.name);
      return { success: true, username: response.data.name };
    } catch (error) {
      console.error('❌ Reddit connection test failed:', error.response?.data || error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = RedditPoster;