const { RETAILER_TYPES } = require('../models/TrackedProduct');

class AffiliateEngine {
  constructor() {
    this.amazonAssociateId = process.env.AMAZON_ASSOCIATE_ID || 'stockspot-20';
  }

  /**
   * Generate affiliate link for Amazon products
   */
  generateAffiliateLink(originalUrl, retailer) {
    if (retailer !== RETAILER_TYPES.AMAZON) {
      return originalUrl; // Only Amazon affiliate links supported
    }

    try {
      const parsedUrl = new URL(originalUrl);
      
      // Ensure it's an Amazon domain
      if (!parsedUrl.hostname.includes('amazon.')) {
        return originalUrl;
      }

      // Add or update the affiliate tag
      parsedUrl.searchParams.set('tag', this.amazonAssociateId);
      
      // Remove other tracking parameters to clean up the URL
      const trackingParams = [
        'ref', 'ref_', 'pf_rd_r', 'pf_rd_p', 'pf_rd_m', 'pf_rd_s', 'pf_rd_t', 'pf_rd_i',
        'pd_rd_r', 'pd_rd_w', 'pd_rd_wg', 'psc', 'qid', 'sr', 'keywords',
        '_encoding', 'camp', 'creative', 'creativeASIN', 'linkCode', 'linkId',
        'ascsubtag', 'ie', 'node', 'pf', 'pd', 'smid', 'th', 'psc'
      ];

      trackingParams.forEach(param => {
        if (parsedUrl.searchParams.has(param)) {
          parsedUrl.searchParams.delete(param);
        }
      });

      return parsedUrl.toString();
    } catch (error) {
      console.error('Error generating affiliate link:', error);
      return originalUrl;
    }
  }

  /**
   * Extract clean product URL for Amazon
   */
  extractCleanAmazonUrl(url) {
    try {
      const parsedUrl = new URL(url);
      
      if (!parsedUrl.hostname.includes('amazon.')) {
        return url;
      }

      // Extract ASIN from URL
      const asinMatch = parsedUrl.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
      if (!asinMatch) {
        return url;
      }

      const asin = asinMatch[1];
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
      
      // Build clean URL with affiliate tag
      return `${baseUrl}/dp/${asin}?tag=${this.amazonAssociateId}`;
    } catch (error) {
      console.error('Error extracting clean Amazon URL:', error);
      return url;
    }
  }

  /**
   * Validate Amazon Associate ID format
   */
  validateAssociateId(associateId) {
    // Amazon associate IDs are typically 3-50 characters, alphanumeric with hyphens
    const regex = /^[a-zA-Z0-9-]{3,50}$/;
    return regex.test(associateId);
  }

  /**
   * Get earnings disclaimer text
   */
  getEarningsDisclaimer() {
    return "As an Amazon Associate I earn from qualifying purchases.";
  }

  /**
   * Check if URL is eligible for affiliate linking
   */
  isEligibleForAffiliate(url, retailer) {
    if (retailer !== RETAILER_TYPES.AMAZON) {
      return false;
    }

    try {
      const parsedUrl = new URL(url);
      
      // Must be Amazon domain
      if (!parsedUrl.hostname.includes('amazon.')) {
        return false;
      }

      // Must have product identifier
      const hasASIN = /\/(?:dp|gp\/product)\/[A-Z0-9]{10}/.test(parsedUrl.pathname);
      return hasASIN;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract commission rate estimate for category
   */
  getEstimatedCommissionRate(category) {
    // Amazon Associate commission rates (approximate)
    const rates = {
      'pokemon-tcg': 3.0,     // Toys category
      'one-piece-tcg': 3.0,   // Toys category
      'sports-cards': 3.0,    // Toys category
      'general': 2.5          // Average rate
    };

    return rates[category] || rates.general;
  }
}

module.exports = { AffiliateEngine };