/**
 * Observer Mode Manager for StockSpot Reddit Bot
 * Handles safe warm-up browsing of subreddits without posting
 */

const fs = require('fs');
const path = require('path');

class ObserverMode {
  constructor() {
    this.isObserverMode = process.env.OBSERVER_MODE === 'true';
    this.observerDays = parseInt(process.env.OBSERVER_DAYS) || 7;
    this.stateFile = path.join(__dirname, '..', '.observer_state.json');
    this.loadState();
    
    console.log(`Observer Mode: ${this.isObserverMode ? 'ENABLED' : 'DISABLED'}`);
    if (this.isObserverMode) {
      console.log(`Observer period: ${this.observerDays} days`);
      console.log(`Started: ${new Date(this.startTime).toLocaleDateString()}`);
      console.log(`Will end: ${new Date(this.endTime).toLocaleDateString()}`);
    }
  }

  /**
   * Load observer state from persistent storage
   */
  loadState() {
    try {
      if (fs.existsSync(this.stateFile)) {
        const state = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
        this.startTime = state.startTime;
        this.endTime = state.endTime;
        this.activityLog = state.activityLog || [];
      } else {
        // First time running - set up observer period
        this.startTime = Date.now();
        this.endTime = this.startTime + (this.observerDays * 24 * 60 * 60 * 1000);
        this.activityLog = [];
        this.saveState();
      }
    } catch (error) {
      console.error('Failed to load observer state:', error);
      this.resetState();
    }
  }

  /**
   * Save observer state to persistent storage
   */
  saveState() {
    try {
      const state = {
        startTime: this.startTime,
        endTime: this.endTime,
        activityLog: this.activityLog
      };
      fs.writeFileSync(this.stateFile, JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('Failed to save observer state:', error);
    }
  }

  /**
   * Reset observer state
   */
  resetState() {
    this.startTime = Date.now();
    this.endTime = this.startTime + (this.observerDays * 24 * 60 * 60 * 1000);
    this.activityLog = [];
    this.saveState();
  }

  /**
   * Check if observer mode should be automatically disabled
   */
  checkAutoDisable() {
    if (this.isObserverMode && Date.now() >= this.endTime) {
      console.log('🎓 Observer period completed - switching to posting mode');
      this.isObserverMode = false;
      this.logActivity('auto_disabled', 'Observer mode automatically disabled after completion');
      return true;
    }
    return false;
  }

  /**
   * Check if posting is allowed (not in observer mode)
   */
  canPost() {
    this.checkAutoDisable();
    return !this.isObserverMode;
  }

  /**
   * Simulate browsing a subreddit (observer activity)
   */
  async browseSubreddit(subreddit) {
    if (!this.isObserverMode) {
      return false;
    }

    try {
      // Simulate browsing activity with randomized delays
      const delay = 2000 + Math.random() * 5000; // 2-7 second delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      this.logActivity('browse', `Browsed r/${subreddit}`, { subreddit });
      console.log(`👀 Observer: Browsed r/${subreddit}`);
      
      return true;
    } catch (error) {
      console.error(`Failed to browse r/${subreddit}:`, error);
      return false;
    }
  }

  /**
   * Simulate fetching posts from a subreddit
   */
  async fetchSubredditPosts(subreddit, sortBy = 'hot') {
    if (!this.isObserverMode) {
      return [];
    }

    try {
      // Simulate API call delay
      const delay = 1000 + Math.random() * 3000; // 1-4 second delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      this.logActivity('fetch_posts', `Fetched ${sortBy} posts from r/${subreddit}`, { 
        subreddit, 
        sortBy 
      });
      
      console.log(`📊 Observer: Fetched ${sortBy} posts from r/${subreddit}`);
      
      // Return mock post data for consistency
      return [
        { id: 'mock_post_1', title: 'Mock Post 1', score: 100 },
        { id: 'mock_post_2', title: 'Mock Post 2', score: 85 }
      ];
    } catch (error) {
      console.error(`Failed to fetch posts from r/${subreddit}:`, error);
      return [];
    }
  }

  /**
   * Perform randomized observer activities
   */
  async performObserverActivities(subreddits) {
    if (!this.isObserverMode) {
      return;
    }

    try {
      // Select random subreddits to browse
      const browsedSubreddits = subreddits.slice(0, 2 + Math.floor(Math.random() * 3));
      
      for (const subreddit of browsedSubreddits) {
        await this.browseSubreddit(subreddit);
        
        // Sometimes fetch posts
        if (Math.random() > 0.5) {
          const sortBy = Math.random() > 0.5 ? 'hot' : 'new';
          await this.fetchSubredditPosts(subreddit, sortBy);
        }
        
        // Random delay between activities
        const delay = 3000 + Math.random() * 7000; // 3-10 second delay
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      console.log(`👁️ Observer session completed - browsed ${browsedSubreddits.length} subreddits`);
    } catch (error) {
      console.error('Observer activities failed:', error);
    }
  }

  /**
   * Log observer activity
   */
  logActivity(action, description, metadata = {}) {
    const activity = {
      timestamp: Date.now(),
      action,
      description,
      metadata
    };
    
    this.activityLog.push(activity);
    
    // Keep only last 1000 activities
    if (this.activityLog.length > 1000) {
      this.activityLog = this.activityLog.slice(-1000);
    }
    
    this.saveState();
  }

  /**
   * Get observer statistics
   */
  getStats() {
    const now = Date.now();
    const daysSinceStart = Math.floor((now - this.startTime) / (24 * 60 * 60 * 1000));
    const daysRemaining = Math.max(0, Math.ceil((this.endTime - now) / (24 * 60 * 60 * 1000)));
    
    const activityCounts = {};
    this.activityLog.forEach(activity => {
      activityCounts[activity.action] = (activityCounts[activity.action] || 0) + 1;
    });

    return {
      isActive: this.isObserverMode,
      daysSinceStart,
      daysRemaining,
      totalActivities: this.activityLog.length,
      activityBreakdown: activityCounts,
      startTime: this.startTime,
      endTime: this.endTime
    };
  }

  /**
   * Force disable observer mode (for testing/manual override)
   */
  forceDisable() {
    this.isObserverMode = false;
    this.logActivity('manual_disabled', 'Observer mode manually disabled');
    console.log('Observer mode manually disabled');
  }

  /**
   * Force enable observer mode (for testing)
   */
  forceEnable(days = null) {
    this.isObserverMode = true;
    if (days) {
      this.observerDays = days;
      this.resetState();
    }
    this.logActivity('manual_enabled', 'Observer mode manually enabled');
    console.log(`Observer mode manually enabled for ${this.observerDays} days`);
  }
}

// Singleton instance
let observerInstance = null;

function getObserverMode() {
  if (!observerInstance) {
    observerInstance = new ObserverMode();
  }
  return observerInstance;
}

module.exports = { ObserverMode, getObserverMode };