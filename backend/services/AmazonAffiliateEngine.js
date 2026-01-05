/**
 * Amazon Affiliate Link Engine for StockSpot
 * Generates affiliate URLs for Amazon products
 */

class AmazonAffiliateEngine {
  constructor() {
    this.associateId = process.env.AMAZON_ASSOCIATE_ID || 'stockspot-20';
    this.supportedDomains = [
      'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de',
      'amazon.fr', 'amazon.it', 'amazon.es', 'amazon.co.jp',
      'amazon.in', 'amazon.com.br', 'amazon.com.mx', 'amazon.com.au'
    ];
  }

  /**
   * Check if URL is an Amazon product URL
   */
  isAmazonUrl(url) {
    if (!url) return false;
    const urlLower = url.toLowerCase();
    return this.supportedDomains.some(domain => urlLower.includes(domain));
  }

  /**
   * Extract ASIN from Amazon URL
   */
  extractASIN(url) {
    if (!url) return null;
    
    // Common ASIN patterns in Amazon URLs
    const asinPatterns = [
      /\/dp\/([A-Z0-9]{10})/i,
      /\/gp\/product\/([A-Z0-9]{10})/i,
      /\/product\/([A-Z0-9]{10})/i,
      /asin=([A-Z0-9]{10})/i
    ];
    
    for (const pattern of asinPatterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    
    return null;
  }

  /**
   * Generate affiliate URL for Amazon product
   */
  generateAffiliateUrl(originalUrl) {
    if (!originalUrl || !this.isAmazonUrl(originalUrl)) {
      return originalUrl;
    }

    try {
      const url = new URL(originalUrl);
      const asin = this.extractASIN(originalUrl);
      
      if (!asin) {
        // If no ASIN found, just add tag to existing URL
        url.searchParams.set('tag', this.associateId);
        return url.toString();
      }

      // Create clean affiliate URL with ASIN
      const domain = url.hostname;
      const affiliateUrl = `https://${domain}/dp/${asin}?tag=${this.associateId}`;
      
      return affiliateUrl;
    } catch (error) {
      console.error('Error generating affiliate URL:', error);
      return originalUrl;
    }
  }

  /**
   * Clean and optimize Amazon URL
   */
  cleanAmazonUrl(url) {
    if (!url || !this.isAmazonUrl(url)) {
      return url;
    }

    try {
      const urlObj = new URL(url);
      const asin = this.extractASIN(url);
      
      if (asin) {
        // Return clean URL with just the essential parts
        return `https://${urlObj.hostname}/dp/${asin}`;
      }
      
      return url;
    } catch (error) {
      console.error('Error cleaning Amazon URL:', error);
      return url;
    }
  }

  /**
   * Get affiliate commission rate estimate
   */
  getCommissionRate(category) {
    const rates = {
      'electronics': 0.025,      // 2.5%
      'gaming': 0.025,           // 2.5%  
      'toys': 0.03,              // 3%
      'sports_cards': 0.03,      // 3%
      'pokemon_tcg': 0.03,       // 3%
      'one_piece_tcg': 0.03,     // 3%
      'collectibles': 0.03,      // 3%
      'other': 0.025             // 2.5%
    };
    
    return rates[category] || rates['other'];
  }

  /**
   * Estimate potential earnings from a deal
   */
  estimateEarnings(price, category) {
    if (!price || isNaN(price)) return 0;
    
    const rate = this.getCommissionRate(category);
    return Math.round((price * rate) * 100) / 100; // Round to 2 decimals
  }

  /**
   * Validate affiliate URL
   */
  isValidAffiliateUrl(url) {
    if (!url || !this.isAmazonUrl(url)) return false;
    
    try {
      const urlObj = new URL(url);
      const tag = urlObj.searchParams.get('tag');
      return tag === this.associateId;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get affiliate link stats
   */
  getStats() {
    return {
      associateId: this.associateId,
      supportedDomains: this.supportedDomains.length,
      avgCommissionRate: 0.027 // 2.7% average
    };
  }
}

module.exports = { AmazonAffiliateEngine };