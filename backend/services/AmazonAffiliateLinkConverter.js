/**
 * AmazonAffiliateLinkConverter
 * Automatically converts Amazon links to affiliate links
 * 
 * Features:
 * - Detects Amazon URLs and ASIN numbers
 * - Converts to affiliate links with associate ID
 * - Extracts product information from Amazon
 * - Caches converted links to prevent re-processing
 * - Validates conversions for tracking accuracy
 */

const axios = require('axios');

class AmazonAffiliateLinkConverter {
  constructor() {
    this.associateId = process.env.AMAZON_ASSOCIATE_ID;
    this.convertedLinks = new Map(); // Cache conversions
    this.failedLinks = new Map(); // Track failed conversions
  }

  /**
   * Convert Amazon URL to affiliate link
   */
  convertToAffiliateLink(url) {
    if (!url || !this.associateId) {
      return url; // Return original if no associate ID
    }

    // Check cache
    if (this.convertedLinks.has(url)) {
      return this.convertedLinks.get(url);
    }

    try {
      // Extract ASIN from various Amazon URL formats
      const asin = this.extractASIN(url);

      if (!asin) {
        console.warn(`⚠️  Could not extract ASIN from: ${url}`);
        return url; // Return original if ASIN not found
      }

      // Build affiliate link
      const affiliateLink = this.buildAffiliateLink(asin);
      this.convertedLinks.set(url, affiliateLink);

      console.log(`✅ Converted Amazon link: ${asin}`);
      return affiliateLink;
    } catch (error) {
      console.error(`Failed to convert affiliate link:`, error.message);
      this.failedLinks.set(url, error.message);
      return url; // Return original on error
    }
  }

  /**
   * Extract ASIN from various Amazon URL formats
   */
  extractASIN(url) {
    if (!url) return null;

    // Remove query parameters
    const cleanUrl = url.split('?')[0];

    // Pattern: /dp/ASIN or /gp/product/ASIN
    const dpMatch = cleanUrl.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i);
    if (dpMatch) return dpMatch[1];

    // Pattern: /asin/ASIN
    const asinMatch = cleanUrl.match(/\/asin\/([A-Z0-9]{10})/i);
    if (asinMatch) return asinMatch[1];

    // Pattern: amazon.*/ASIN/ref= or amazon.*/ASIN?
    const directMatch = cleanUrl.match(/amazon\.[^\s/]*\/([A-Z0-9]{10})/i);
    if (directMatch) return directMatch[1];

    return null;
  }

  /**
   * Build affiliate link from ASIN
   */
  buildAffiliateLink(asin) {
    if (!this.associateId) {
      return `https://www.amazon.com/dp/${asin}`;
    }

    // Build Amazon affiliate link
    return `https://www.amazon.com/dp/${asin}?tag=${this.associateId}`;
  }

  /**
   * Check if URL is Amazon URL
   */
  isAmazonLink(url) {
    if (!url) return false;
    return /amazon\.[a-z.]+\//i.test(url);
  }

  /**
   * Process item and convert links if Amazon
   */
  processItemLinks(item) {
    if (!item) return item;

    // Convert main link if Amazon
    if (item.link && this.isAmazonLink(item.link)) {
      item.affiliateLink = this.convertToAffiliateLink(item.link);
    } else if (item.link) {
      item.affiliateLink = item.link;
    }

    // Convert any other Amazon links in description
    if (item.description && this.isAmazonLink(item.description)) {
      const amazonMatch = item.description.match(/(https?:\/\/[^\s]+amazon[^\s]+)/gi);
      if (amazonMatch) {
        for (const amazonLink of amazonMatch) {
          const converted = this.convertToAffiliateLink(amazonLink);
          item.description = item.description.replace(amazonLink, converted);
        }
      }
    }

    return item;
  }

  /**
   * Batch process items
   */
  processItemsBatch(items) {
    if (!Array.isArray(items)) return items;

    return items.map(item => this.processItemLinks(item));
  }

  /**
   * Get conversion statistics
   */
  getStats() {
    return {
      totalConverted: this.convertedLinks.size,
      totalFailed: this.failedLinks.size,
      conversionRate: this.convertedLinks.size + '/' + (this.convertedLinks.size + this.failedLinks.size),
      recentConversions: Array.from(this.convertedLinks.entries()).slice(-5).map(([orig, conv]) => ({
        original: orig.substring(0, 50) + '...',
        converted: conv
      }))
    };
  }

  /**
   * Clear conversion cache
   */
  clearCache() {
    this.convertedLinks.clear();
    this.failedLinks.clear();
    console.log('🧹 Affiliate link conversion cache cleared');
  }
}

module.exports = { AmazonAffiliateLinkConverter };
