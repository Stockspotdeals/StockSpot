// Retailer constants
const RETAILER_TYPES = {
  AMAZON: 'amazon',
  BESTBUY: 'bestbuy',
  WALMART: 'walmart',
  TARGET: 'target',
  GAMESTOP: 'gamestop',
  POKEMONCENTER: 'pokemoncenter',
  OTHER: 'other',
  UNKNOWN: 'unknown'
};

class RetailerDetector {
  /**
   * Detect retailer from product URL
   */
  static detectRetailer(url) {
    try {
      const parsedUrl = new URL(url.toLowerCase());
      const hostname = parsedUrl.hostname.replace('www.', '');
      
      // Amazon detection
      if (hostname.includes('amazon.')) {
        return RETAILER_TYPES.AMAZON;
      }
      
      // Walmart detection
      if (hostname.includes('walmart.com')) {
        return RETAILER_TYPES.WALMART;
      }
      
      // Target detection
      if (hostname.includes('target.com')) {
        return RETAILER_TYPES.TARGET;
      }
      
      // Best Buy detection
      if (hostname.includes('bestbuy.com')) {
        return RETAILER_TYPES.BESTBUY;
      }
      
      return RETAILER_TYPES.UNKNOWN;
    } catch (error) {
      return RETAILER_TYPES.UNKNOWN;
    }
  }

  /**
   * Extract product ID from URL
   */
  static extractProductId(url, retailer) {
    try {
      const parsedUrl = new URL(url);
      
      switch (retailer) {
        case RETAILER_TYPES.AMAZON:
          return this.extractAmazonProductId(parsedUrl);
        case RETAILER_TYPES.WALMART:
          return this.extractWalmartProductId(parsedUrl);
        case RETAILER_TYPES.TARGET:
          return this.extractTargetProductId(parsedUrl);
        case RETAILER_TYPES.BESTBUY:
          return this.extractBestBuyProductId(parsedUrl);
        default:
          return null;
      }
    } catch (error) {
      return null;
    }
  }

  static extractAmazonProductId(parsedUrl) {
    // Extract ASIN from Amazon URL patterns
    const pathname = parsedUrl.pathname;
    
    // Pattern: /dp/ASIN or /gp/product/ASIN
    const dpMatch = pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
    if (dpMatch) return dpMatch[1];
    
    // Pattern: /product/ASIN
    const productMatch = pathname.match(/\/product\/([A-Z0-9]{10})/);
    if (productMatch) return productMatch[1];
    
    return null;
  }

  static extractWalmartProductId(parsedUrl) {
    // Extract product ID from Walmart URL
    const pathname = parsedUrl.pathname;
    
    // Pattern: /ip/product-name/ID
    const match = pathname.match(/\/ip\/[^\/]+\/(\d+)/);
    return match ? match[1] : null;
  }

  static extractTargetProductId(parsedUrl) {
    // Extract DPCI or product ID from Target URL
    const pathname = parsedUrl.pathname;
    
    // Pattern: /p/product-name/-/A-ID
    const match = pathname.match(/\/p\/[^\/]+\/-\/A-(\d+)/);
    return match ? match[1] : null;
  }

  static extractBestBuyProductId(parsedUrl) {
    // Extract SKU from Best Buy URL
    const pathname = parsedUrl.pathname;
    
    // Pattern: /site/product-name/SKU.p
    const match = pathname.match(/\/site\/[^\/]+\/(\d+)\.p/);
    return match ? match[1] : null;
  }

  /**
   * Normalize product URL (remove tracking parameters, etc.)
   */
  static normalizeUrl(url, retailer) {
    try {
      const parsedUrl = new URL(url);
      
      switch (retailer) {
        case RETAILER_TYPES.AMAZON:
          return this.normalizeAmazonUrl(parsedUrl);
        case RETAILER_TYPES.WALMART:
          return this.normalizeWalmartUrl(parsedUrl);
        case RETAILER_TYPES.TARGET:
          return this.normalizeTargetUrl(parsedUrl);
        case RETAILER_TYPES.BESTBUY:
          return this.normalizeBestBuyUrl(parsedUrl);
        default:
          // Generic normalization - remove common tracking parameters
          parsedUrl.searchParams.delete('utm_source');
          parsedUrl.searchParams.delete('utm_medium');
          parsedUrl.searchParams.delete('utm_campaign');
          parsedUrl.searchParams.delete('utm_content');
          parsedUrl.searchParams.delete('utm_term');
          parsedUrl.searchParams.delete('ref');
          parsedUrl.searchParams.delete('tag');
          return parsedUrl.toString();
      }
    } catch (error) {
      return url;
    }
  }

  static normalizeAmazonUrl(parsedUrl) {
    // Keep only essential parameters for Amazon
    const productId = this.extractAmazonProductId(parsedUrl);
    if (!productId) return parsedUrl.toString();
    
    // Build clean Amazon URL
    const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;
    return `${baseUrl}/dp/${productId}`;
  }

  static normalizeWalmartUrl(parsedUrl) {
    // Remove tracking parameters but keep essential ones
    const keepParams = ['selected'];
    const newParams = new URLSearchParams();
    
    keepParams.forEach(param => {
      if (parsedUrl.searchParams.has(param)) {
        newParams.set(param, parsedUrl.searchParams.get(param));
      }
    });
    
    parsedUrl.search = newParams.toString();
    return parsedUrl.toString();
  }

  static normalizeTargetUrl(parsedUrl) {
    // Target URLs are generally clean, just remove tracking
    const trackingParams = [
      'clkid', 'lnm', 'afid', 'ref', 'euid', 'Lnm', 'CPO',
      'utm_source', 'utm_medium', 'utm_campaign'
    ];
    
    trackingParams.forEach(param => {
      parsedUrl.searchParams.delete(param);
    });
    
    return parsedUrl.toString();
  }

  static normalizeBestBuyUrl(parsedUrl) {
    // Remove Best Buy tracking parameters
    const trackingParams = [
      'skuId', 'ref', 'loc', 'acampID', 'irclickid',
      'utm_source', 'utm_medium', 'utm_campaign'
    ];
    
    trackingParams.forEach(param => {
      parsedUrl.searchParams.delete(param);
    });
    
    return parsedUrl.toString();
  }

  /**
   * Get retailer-specific configuration
   */
  static getRetailerConfig(retailer) {
    const configs = {
      [RETAILER_TYPES.AMAZON]: {
        name: 'Amazon',
        baseDelay: 2000,      // Minimum delay between requests
        maxDelay: 10000,      // Maximum delay with backoff
        timeout: 30000,       // Request timeout
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        selectors: {
          title: '#productTitle, [data-automation-id="product-title"]',
          price: '.a-price-whole, .a-price .a-offscreen, [data-automation-id="product-price"]',
          availability: '#availability span, .a-size-medium',
          outOfStock: [
            'currently unavailable',
            'temporarily out of stock',
            'this item is not available'
          ]
        }
      },
      
      [RETAILER_TYPES.WALMART]: {
        name: 'Walmart',
        baseDelay: 1500,
        maxDelay: 8000,
        timeout: 25000,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        selectors: {
          title: '[data-automation-id="product-title"], h1',
          price: '[itemprop="price"], [data-automation-id="product-price"]',
          availability: '[data-automation-id="fulfillment-summary"]',
          outOfStock: [
            'out of stock',
            'not available',
            'sold out'
          ]
        }
      },
      
      [RETAILER_TYPES.TARGET]: {
        name: 'Target',
        baseDelay: 1000,
        maxDelay: 6000,
        timeout: 20000,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        selectors: {
          title: '[data-test="product-title"], h1',
          price: '[data-test="product-price"]',
          availability: '[data-test="stockLevelStatus"]',
          outOfStock: [
            'out of stock',
            'not sold in stores',
            'unavailable'
          ]
        }
      },
      
      [RETAILER_TYPES.BESTBUY]: {
        name: 'Best Buy',
        baseDelay: 1200,
        maxDelay: 7000,
        timeout: 25000,
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        },
        selectors: {
          title: '.sr-only, h1',
          price: '.sr-only, [data-testid="customer-price"]',
          availability: '[data-testid="fulfillment-add-to-cart-button"]',
          outOfStock: [
            'sold out',
            'coming soon',
            'unavailable nearby'
          ]
        }
      }
    };
    
    return configs[retailer] || configs[RETAILER_TYPES.UNKNOWN] || {
      name: 'Unknown',
      baseDelay: 2000,
      maxDelay: 10000,
      timeout: 30000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      headers: {},
      selectors: {
        title: 'h1, .title',
        price: '.price',
        availability: '.stock, .availability',
        outOfStock: ['out of stock', 'sold out', 'unavailable']
      }
    };
  }

  /**
   * Validate product URL format
   */
  static isValidProductUrl(url, retailer) {
    try {
      const parsedUrl = new URL(url);
      const productId = this.extractProductId(url, retailer);
      
      // Must have a valid product ID
      if (!productId) return false;
      
      // Retailer-specific validation
      switch (retailer) {
        case RETAILER_TYPES.AMAZON:
          return /amazon\./i.test(parsedUrl.hostname) && /[A-Z0-9]{10}/.test(productId);
        case RETAILER_TYPES.WALMART:
          return /walmart\.com/i.test(parsedUrl.hostname) && /^\d+$/.test(productId);
        case RETAILER_TYPES.TARGET:
          return /target\.com/i.test(parsedUrl.hostname) && /^\d+$/.test(productId);
        case RETAILER_TYPES.BESTBUY:
          return /bestbuy\.com/i.test(parsedUrl.hostname) && /^\d+$/.test(productId);
        default:
          return true; // Allow unknown retailers
      }
    } catch (error) {
      return false;
    }
  }

  /**
   * Get list of supported retailers
   */
  static getSupportedRetailers() {
    return [
      'amazon',
      'bestbuy', 
      'walmart',
      'target',
      'gamestop',
      'pokemoncenter',
      'other'
    ];
  }
}

module.exports = { RetailerDetector, RETAILER_TYPES };