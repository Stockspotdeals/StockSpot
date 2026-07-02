/**
 * Amazon Affiliate Link Converter
 * Converts Amazon URLs to affiliate links
 */

const crypto = require('crypto');

class AffiliateConverter {
  /**
   * Convert Amazon URL to affiliate link
   * @param {string} asin - Amazon product ASIN
   * @param {string} associateId - Amazon Associate ID
   * @returns {string} Affiliate URL
   */
  static createAmazonAffiliateLink(asin, associateId) {
    if (!asin || !associateId) {
      return null;
    }
    
    return `https://amazon.com/dp/${asin}?tag=${associateId}`;
  }

  /**
   * Extract ASIN from Amazon URL
   * @param {string} url - Amazon product URL
   * @returns {string|null} ASIN or null
   */
  static extractASIN(url) {
    if (!url) return null;

    // Common ASIN patterns
    const patterns = [
      /(?:amazon\.com|amazon\.ca|amazon\.co\.uk|amazon\.de|amazon\.fr|amazon\.it|amazon\.es|amazon\.com\.br)\/(?:.*\/)?(?:dp|gp)\/([A-Z0-9]{10})/i,
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /asin=([A-Z0-9]{10})/i,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Generate tracking ID for item
   * Useful for duplicate detection and analytics
   * @param {Object} item - Item object
   * @returns {string} Tracking ID hash
   */
  static generateTrackingId(item) {
    const data = `${item.retailer}-${item.asin || item.productId}-${item.name}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 12);
  }

  /**
   * Check if URLs point to same product
   * @param {string} url1 - First URL
   * @param {string} url2 - Second URL
   * @returns {boolean}
   */
  static isSameAmazonProduct(url1, url2) {
    const asin1 = this.extractASIN(url1);
    const asin2 = this.extractASIN(url2);
    return asin1 && asin2 && asin1 === asin2;
  }
}

module.exports = AffiliateConverter;
