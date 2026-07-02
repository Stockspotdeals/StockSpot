/**
 * RSSFeedManager
 * Generates tier-aware RSS feeds for users and categories
 * 
 * Features:
 * - Per-user RSS feeds with tier-based item filtering
 * - Public category feeds (FREE tier items only)
 * - Automatic feed generation on demand
 * - XML parsing and Atom 1.0 compliance
 * - Tier-specific delays reflected in publication time
 */

const { v4: uuidv4 } = require('uuid');

class RSSFeedManager {
  constructor() {
    this.feeds = new Map(); // Cache generated feeds
    this.feedTimestamps = new Map(); // Track feed freshness
    this.refreshIntervalMs = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate user-specific RSS feed based on tier
   */
  generateUserRSSFeed(userId, userName, userTier, items = []) {
    try {
      const feedId = `user_${userId}`;
      const now = new Date().toISOString();

      // Filter items based on tier
      let filteredItems = items;

      if (userTier === 'free') {
        // FREE tier: only items from 10+ minutes ago
        const delayMs = (parseInt(process.env.FREE_TIER_DELAY_MINUTES || 10)) * 60 * 1000;
        filteredItems = items.filter(item => {
          const itemAge = Date.now() - new Date(item.foundAt).getTime();
          return itemAge >= delayMs;
        });
      }
      // PAID and YEARLY tiers get all items

      const feed = {
        version: '1.0',
        encoding: 'UTF-8',
        title: `StockSpot Feed - ${userName}`,
        id: `urn:stockspot:${feedId}`,
        link: `https://stockspot.com/feed/${userId}`,
        description: `Real-time deal alerts for ${userName} (${userTier.toUpperCase()} tier)`,
        updated: now,
        generator: 'StockSpot RSS Generator v1.0',
        items: filteredItems.map(item => this.generateFeedEntry(item, userTier))
      };

      this.feeds.set(feedId, feed);
      this.feedTimestamps.set(feedId, Date.now());

      return this.generateAtomXML(feed);
    } catch (error) {
      console.error('Error generating user RSS feed:', error);
      throw error;
    }
  }

  /**
   * Generate public category feed (FREE tier items only)
   */
  generateCategoryRSSFeed(category, items = []) {
    try {
      const feedId = `category_${category}`;
      const now = new Date().toISOString();

      // Public feeds only show FREE tier delayed items
      const delayMs = (parseInt(process.env.FREE_TIER_DELAY_MINUTES || 10)) * 60 * 1000;
      const filteredItems = items.filter(item => {
        const itemAge = Date.now() - new Date(item.foundAt).getTime();
        return itemAge >= delayMs && item.category === category;
      });

      const feed = {
        version: '1.0',
        encoding: 'UTF-8',
        title: `StockSpot - ${category} Deals`,
        id: `urn:stockspot:${feedId}`,
        link: `https://stockspot.com/feed/${category}`,
        description: `Latest deals from ${category} monitored by StockSpot`,
        updated: now,
        generator: 'StockSpot RSS Generator v1.0',
        items: filteredItems.map(item => this.generateFeedEntry(item, 'free'))
      };

      this.feeds.set(feedId, feed);
      this.feedTimestamps.set(feedId, Date.now());

      return this.generateAtomXML(feed);
    } catch (error) {
      console.error('Error generating category RSS feed:', error);
      throw error;
    }
  }

  /**
   * Generate individual feed entry (Atom format)
   */
  generateFeedEntry(item, userTier) {
    const entryId = item._id || uuidv4();
    const published = new Date(item.foundAt || item.createdAt || Date.now()).toISOString();

    return {
      id: `urn:stockspot:item:${entryId}`,
      title: item.title || 'Untitled',
      link: item.affiliateLink || item.link,
      published,
      updated: published,
      summary: this.generateSummary(item),
      content: this.generateContentHTML(item, userTier),
      author: {
        name: item.retailer || 'StockSpot',
        uri: item.retailerUrl || '#'
      },
      category: {
        term: item.category || 'General'
      },
      media: {
        thumbnail: item.imageUrl || 'https://stockspot.com/icon.png'
      }
    };
  }

  /**
   * Generate plain text summary for RSS entry
   */
  generateSummary(item) {
    let summary = `${item.retailer}: ${item.title}`;

    if (item.price) {
      summary += ` - $${item.price}`;
    }

    if (item.discount) {
      summary += ` (${item.discount}% off)`;
    }

    if (item.itemType) {
      summary += ` [${item.itemType}]`;
    }

    return summary;
  }

  /**
   * Generate HTML content for RSS entry
   */
  generateContentHTML(item, userTier) {
    const tierTag = userTier === 'yearly' ? '⭐ YEARLY' : userTier === 'paid' ? '💎 PAID' : '🆓 FREE';

    return `
<div style="font-family: Arial, sans-serif;">
  <h3>${item.title}</h3>
  <p style="color: #27ae60; font-size: 18px; font-weight: bold;">$${item.price || 'N/A'}</p>
  
  <div style="background: #f0f0f0; padding: 10px; border-radius: 4px; margin: 10px 0;">
    <strong>Retailer:</strong> ${item.retailer}<br>
    <strong>Category:</strong> ${item.category}<br>
    <strong>Status:</strong> ${item.itemType || 'Available'}<br>
    <strong>Tier:</strong> <span style="background: #ffc107; padding: 2px 8px; border-radius: 3px;">${tierTag}</span>
  </div>

  ${item.originalPrice ? `<p><strong>Original Price:</strong> $${item.originalPrice}</p>` : ''}
  ${item.discount ? `<p><strong>Discount:</strong> ${item.discount}%</p>` : ''}
  ${item.description ? `<p>${item.description}</p>` : ''}

  <p>
    <a href="${item.affiliateLink || item.link}" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block;">
      View Deal →
    </a>
  </p>
</div>
    `;
  }

  /**
   * Generate Atom 1.0 XML feed
   */
  generateAtomXML(feed) {
    const escapeXML = (str) => {
      if (!str) return '';
      return str.replace(/[<>&'"]/g, c => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        "'": '&apos;',
        '"': '&quot;'
      }[c]));
    };

    let xml = `<?xml version="${feed.version}" encoding="${feed.encoding}"?>\n`;
    xml += `<feed xmlns="http://www.w3.org/2005/Atom">\n`;
    xml += `  <id>${feed.id}</id>\n`;
    xml += `  <title>${escapeXML(feed.title)}</title>\n`;
    xml += `  <link href="${feed.link}" rel="alternate"/>\n`;
    xml += `  <updated>${feed.updated}</updated>\n`;
    xml += `  <generator uri="https://stockspot.com">${feed.generator}</generator>\n`;
    xml += `  <subtitle>${escapeXML(feed.description)}</subtitle>\n`;

    // Add entries
    if (feed.items && feed.items.length > 0) {
      for (const item of feed.items) {
        xml += `  <entry>\n`;
        xml += `    <id>${item.id}</id>\n`;
        xml += `    <title>${escapeXML(item.title)}</title>\n`;
        xml += `    <link href="${item.link}" rel="alternate"/>\n`;
        xml += `    <published>${item.published}</published>\n`;
        xml += `    <updated>${item.updated}</updated>\n`;
        xml += `    <summary>${escapeXML(item.summary)}</summary>\n`;
        xml += `    <content type="html"><![CDATA[${item.content}]]></content>\n`;

        if (item.author) {
          xml += `    <author>\n`;
          xml += `      <name>${escapeXML(item.author.name)}</name>\n`;
          xml += `      <uri>${item.author.uri}</uri>\n`;
          xml += `    </author>\n`;
        }

        if (item.category) {
          xml += `    <category term="${escapeXML(item.category.term)}"/>\n`;
        }

        if (item.media && item.media.thumbnail) {
          xml += `    <media:thumbnail url="${item.media.thumbnail}"/>\n`;
        }

        xml += `  </entry>\n`;
      }
    }

    xml += `</feed>\n`;
    return xml;
  }

  /**
   * Get or create user RSS feed URL
   */
  generateUserFeedUrl(userId) {
    return `https://stockspot.com/api/rss/user/${userId}`;
  }

  /**
   * Get or create category feed URL
   */
  generateCategoryFeedUrl(category) {
    return `https://stockspot.com/api/rss/category/${category}`;
  }

  /**
   * Clear expired feeds from cache
   */
  clearExpiredFeeds() {
    const now = Date.now();
    for (const [feedId, timestamp] of this.feedTimestamps.entries()) {
      if (now - timestamp > this.refreshIntervalMs) {
        this.feeds.delete(feedId);
        this.feedTimestamps.delete(feedId);
      }
    }
  }

  /**
   * Get feed statistics
   */
  getStats() {
    return {
      cachedFeeds: this.feeds.size,
      cacheAge: Array.from(this.feedTimestamps.values()).map(t => 
        `${((Date.now() - t) / 1000 / 60).toFixed(1)}min`
      )
    };
  }
}

module.exports = { RSSFeedManager };
