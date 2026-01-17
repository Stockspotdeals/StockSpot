/**
 * Feed Generator
 * Creates and manages feed items with tier-based delays
 */

const TierManager = require('../tiers/TierManager');
const RetailerMonitor = require('../monitors/RetailerMonitor');
const AffiliateConverter = require('../affiliate/AffiliateConverter');

class FeedGenerator {
  /**
   * Process new items for feed
   * @param {Array} items - Raw items from scrapers
   * @param {string} userTier - User tier (free, paid, yearly)
   * @returns {Array} Processed feed items
   */
  static processFeedItems(items, userTier = 'free') {
    if (!Array.isArray(items)) {
      return [];
    }

    const processed = items
      .map((item) => this.enrichItem(item, userTier))
      .filter((item) => item !== null)
      .sort((a, b) => {
        // Sort by priority first (descending), then by timestamp (newest first)
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }
        return new Date(b.detectedAt) - new Date(a.detectedAt);
      });

    return processed;
  }

  /**
   * Enrich item with feed metadata
   */
  static enrichItem(item, userTier) {
    try {
      const tier = TierManager.getTier(userTier);

      // Determine feed visibility
      const delay = TierManager.getFeedDelay(userTier, item.retailer);
      const detectedAt = new Date(item.detectedAt || Date.now());
      const visibleAt = new Date(detectedAt.getTime() + delay);

      // Check if item should be visible now
      const isVisible = visibleAt <= new Date();

      // Apply affiliate link if applicable
      let affiliateLink = null;
      if (
        item.retailer === 'amazon' &&
        RetailerMonitor.isAmazonAffiliateEligible(item) &&
        process.env.AMAZON_ASSOCIATE_ID
      ) {
        affiliateLink = AffiliateConverter.createAmazonAffiliateLink(
          item.asin,
          process.env.AMAZON_ASSOCIATE_ID
        );
      }

      // Classify priority
      const { priority, classification, confidence } =
        RetailerMonitor.classifyPriority(item);

      return {
        id: item.id || AffiliateConverter.generateTrackingId(item),
        name: item.name,
        retailer: item.retailer,
        category: item.category,
        price: item.price,
        originalPrice: item.originalPrice,
        discountPercent: item.discountPercent,
        link: affiliateLink || item.link,
        affiliateLink: !!affiliateLink,
        inStock: item.inStock,
        isRestock: item.isRestock || false,
        isLimitedEdition: item.isLimitedEdition || false,
        isHypeItem: item.isHypeItem || false,
        detectedAt: detectedAt.toISOString(),
        visibleAt: visibleAt.toISOString(),
        visible: isVisible,
        priority,
        classification,
        confidence,
        image: item.image,
        description: item.description,
        retailerLogo: item.retailerLogo,
        stockLevel: item.stockLevel || 'medium',
        demandIndicator: item.demandIndicator || 'normal',
        reviewCount: item.reviewCount || 0,
        rating: item.rating || 0,
      };
    } catch (error) {
      console.error('Error enriching item:', item, error);
      return null;
    }
  }

  /**
   * Generate RSS feed XML
   */
  static generateRSSFeed(items, config = {}) {
    const title = config.title || 'StockSpot Deals Feed';
    const description = config.description || 'Real-time product alerts and deals';
    const link = config.link || 'https://stockspot.com';

    const itemsXml = items
      .map(
        (item) => `
    <item>
      <title>${this.escapeXml(item.name)}</title>
      <description>${this.escapeXml(`${item.classification} - ${item.retailer} - ${item.price ? '$' + item.price : 'Price TBD'}`)}${item.discountPercent ? ` - ${item.discountPercent}% off` : ''}</description>
      <link>${this.escapeXml(item.link)}</link>
      <pubDate>${new Date(item.detectedAt).toUTCString()}</pubDate>
      <guid>${item.id}</guid>
      <category>${this.escapeXml(item.category)}</category>
    </item>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${this.escapeXml(title)}</title>
    <link>${link}</link>
    <description>${this.escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${itemsXml}
  </channel>
</rss>`;
  }

  /**
   * Escape XML special characters
   */
  static escapeXml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Deduplicate items
   */
  static deduplicateItems(items) {
    const seen = new Set();
    return items.filter((item) => {
      const key = `${item.retailer}-${item.asin || item.productId}-${item.name}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }
}

module.exports = FeedGenerator;
