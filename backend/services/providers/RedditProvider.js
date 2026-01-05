const axios = require('axios');
const { DELIVERY_STATUS } = require('../../models/Notification');

class RedditProvider {
  constructor() {
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.username = process.env.REDDIT_USERNAME;
    this.password = process.env.REDDIT_PASSWORD;
    this.userAgent = process.env.REDDIT_USER_AGENT || 'StockSpot/1.0.0 (Deal Bot)';
    
    this.accessToken = null;
    this.tokenExpiry = null;
    this.baseUrl = 'https://oauth.reddit.com';
    this.rateLimits = new Map();
  }

  async authenticate() {
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
      
      return this.accessToken;
    } catch (error) {
      console.error('Reddit authentication failed:', error.response?.data || error.message);
      throw error;
    }
  }

  async sendNotification(notificationEvent, channel) {
    try {
      if (!this.clientId || !this.clientSecret) {
        throw new Error('Reddit credentials not configured');
      }

      await this.authenticate();
      
      const subreddit = channel.destination;
      
      if (this.isRateLimited(subreddit)) {
        throw new Error('Rate limited - too many requests');
      }

      const { message } = notificationEvent;
      
      const response = await axios.post(`${this.baseUrl}/api/submit`, {
        sr: subreddit,
        kind: 'self',
        title: message.title || 'StockSpot Deal Alert',
        text: message.body,
        api_type: 'json'
      }, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': this.userAgent
        }
      });

      if (response.data.json && response.data.json.errors && response.data.json.errors.length > 0) {
        const errors = response.data.json.errors;
        console.error('Reddit API errors:', errors);
        
        if (errors.some(err => err[0] === 'RATELIMIT')) {
          this.setRateLimit(subreddit, 10 * 60 * 1000);
        }
        
        return {
          success: false,
          error: errors[0][1] || 'Unknown Reddit API error'
        };
      }

      return {
        success: true,
        externalId: response.data.json?.data?.id || 'unknown',
        response: response.data
      };
      
    } catch (error) {
      if (error.response?.status === 429) {
        this.setRateLimit(channel.destination, 10 * 60 * 1000);
      }
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  isRateLimited(subreddit) {
    const rateLimitInfo = this.rateLimits.get(subreddit);
    return rateLimitInfo && Date.now() < rateLimitInfo.resetTime;
  }

  setRateLimit(subreddit, duration) {
    this.rateLimits.set(subreddit, {
      resetTime: Date.now() + duration
    });
  }

  async testMessage(subreddit) {
    try {
      await this.authenticate();
      
      const response = await axios.get(`${this.baseUrl}/api/v1/me`, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'User-Agent': this.userAgent
        }
      });
      
      return { 
        success: true,
        error: null
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  getProviderName() {
    return 'Reddit';
  }
}

module.exports = { RedditProvider };