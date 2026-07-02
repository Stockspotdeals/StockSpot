/**
 * RSSFeedManager - Generates and manages RSS feeds per user
 */

const xml = require('xml');
const path = require('path');
const fs = require('fs').promises;

class RSSFeedManager {
  constructor() {
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.feedsDir = path.join(__dirname, '../../feeds');
  }

  /**
   * Update RSS feed for a user
   */
  async updateUserFeed(userId, items) {
    try {
      const feedContent = this.generateRSSFeed(userId, items);

      if (!this.isDryRun) {
        // Ensure feeds directory exists
        await fs.mkdir(this.feedsDir, { recursive: true });

        // Write RSS feed to file
        const feedPath = path.join(this.feedsDir, `user-${userId}.xml`);
        await fs.writeFile(feedPath, feedContent);

        return {
          updated: true,
          path: feedPath,
          itemCount: items.length
        };
      }

      return {
        updated: true,
        dry_run: true,
        itemCount: items.length
      };
    } catch (error) {
      console.error(`❌ Error updating RSS feed for user ${userId}:`, error.message);
      return {
        updated: false,
        error: error.message
      };
    }
  }

  /**
   * Generate RSS feed XML
   */
  generateRSSFeed(userId, items) {
    const baseUrl = process.env.FRONTEND_URL || 'https://stockspot.com';
    const now = new Date().toUTCString();

    // Filter items to include only those that should be in feed
    const feedItems = items.slice(0, 50).map(item => {
      const description = `
        ${item.name}
        Price: $${item.price.toFixed(2)} (was $${item.originalPrice.toFixed(2)})
        Discount: ${item.discount}%
        Retailer: ${item.retailer}
      `;

      return {
        item: [
          { title: item.name },
          { description },
          { link: item.url },
          { guid: `${item.id}-${userId}` },
          { pubDate: new Date(item.detectedAt || Date.now()).toUTCString() },
          { category: item.category || 'Deals' },
          {
            'content:encoded': {
              _cdata: `
                <h3>${item.name}</h3>
                <p><strong>Retailer:</strong> ${item.retailer}</p>
                <p><strong>Price:</strong> $${item.price.toFixed(2)} <s>$${item.originalPrice.toFixed(2)}</s></p>
                <p><strong>Discount:</strong> ${item.discount}% OFF</p>
                <a href="${item.url}">View Product</a>
              `
            }
          }
        ]
      };
    });

    const rssObject = {
      rss: [
        {
          _attr: {
            version: '2.0',
            'xmlns:content': 'http://purl.org/rss/1.0/modules/content/'
          }
        },
        {
          channel: [
            { title: 'StockSpot Deals Feed' },
            { link: baseUrl },
            { description: 'Real-time deals and restocks from your favorite retailers' },
            { language: 'en-us' },
            { pubDate: now },
            { lastBuildDate: now },
            { ttl: 5 }, // Update every 5 minutes
            {
              image: [
                { url: `${baseUrl}/logo.png` },
                { title: 'StockSpot' },
                { link: baseUrl }
              ]
            },
            ...feedItems
          ]
        }
      ]
    };

    return this.objectToXml(rssObject);
  }

  /**
   * Convert object to XML string
   */
  objectToXml(obj) {
    const xmlArray = xml(obj, { declaration: true, indent: '  ' });
    return Array.isArray(xmlArray) ? xmlArray.join('') : xmlArray;
  }

  /**
   * Get RSS feed URL for user
   */
  getUserFeedUrl(userId) {
    const baseUrl = process.env.FRONTEND_URL || 'https://stockspot.com';
    return `${baseUrl}/feeds/user-${userId}.xml`;
  }

  /**
   * Get public RSS feed for all users
   */
  generatePublicFeed(items) {
    const baseUrl = process.env.FRONTEND_URL || 'https://stockspot.com';
    const now = new Date().toUTCString();

    const feedItems = items.slice(0, 100).map(item => {
      return {
        item: [
          { title: item.name },
          { description: `${item.retailer} - $${item.price.toFixed(2)} (${item.discount}% off)` },
          { link: item.url },
          { guid: item.id },
          { pubDate: new Date(item.detectedAt || Date.now()).toUTCString() },
          { category: item.retailer }
        ]
      };
    });

    const rssObject = {
      rss: [
        {
          _attr: {
            version: '2.0',
            'xmlns:content': 'http://purl.org/rss/1.0/modules/content/'
          }
        },
        {
          channel: [
            { title: 'StockSpot - All Deals' },
            { link: baseUrl },
            { description: 'Real-time deals and restocks from Amazon, Walmart, Target, Best Buy, and more' },
            { language: 'en-us' },
            { pubDate: now },
            { lastBuildDate: now },
            { ttl: 5 },
            ...feedItems
          ]
        }
      ]
    };

    return this.objectToXml(rssObject);
  }

  /**
   * Serve user RSS feed (for express route)
   */
  async serveUserFeed(userId, res) {
    try {
      const feedPath = path.join(this.feedsDir, `user-${userId}.xml`);
      const content = await fs.readFile(feedPath, 'utf-8');

      res.set('Content-Type', 'application/rss+xml');
      res.send(content);
    } catch (error) {
      res.status(404).json({ error: 'Feed not found' });
    }
  }
}

module.exports = { RSSFeedManager };
