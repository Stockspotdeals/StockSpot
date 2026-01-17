const axios = require('axios');
const { RetailerDetector, RETAILER_TYPES } = require('./RetailerDetector');
const { CategoryDetector } = require('./CategoryDetector');
const { AffiliateEngine } = require('./AffiliateEngine');

// Lazy load cheerio - only loaded when actually needed
let cheerio = null;
function getCheerio() {
  if (!cheerio) {
    try {
      cheerio = require('cheerio');
    } catch (e) {
      console.warn('cheerio not available - HTML parsing disabled');
      return null;
    }
  }
  return cheerio;
}

class ProductMonitor {
  constructor() {
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.axiosInstance = this.isDryRun ? null : axios.create({
      timeout: 30000,
      maxRedirects: 3,
      validateStatus: (status) => status < 500 // Accept 4xx errors but not 5xx
    });
    this.affiliateEngine = new AffiliateEngine();
  }

  /**
   * Monitor a single product
   */
  async monitorProduct(trackedProduct) {
    try {
      const retailerConfig = RetailerDetector.getRetailerConfig(trackedProduct.retailer);
      const productData = await this.scrapeProduct(trackedProduct.url, retailerConfig);
      
      const changes = this.detectChanges(trackedProduct, productData);
      
      // Update product with new data
      const updateData = {
        lastCheckedAt: new Date(),
        price: productData.price,
        availability: productData.availability,
        isAvailable: productData.isAvailable,
        category: productData.category || trackedProduct.category,
        affiliateLink: productData.affiliateLink || trackedProduct.affiliateLink,
        errorCount: 0, // Reset on successful check
        lastError: null,
        nextCheck: this.calculateNextCheck(trackedProduct, true)
      };
      
      await trackedProduct.updateOne(updateData);
      
      // Create events for significant changes
      if (changes.length > 0) {
        await this.createChangeEvents(trackedProduct._id, changes, productData, trackedProduct);
      }
      
      return {
        success: true,
        changes,
        productData,
        trackedProduct: { ...trackedProduct.toObject(), ...updateData }
      };
      
    } catch (error) {
      await this.handleMonitorError(trackedProduct, error);
      throw error;
    }
  }

  /**
   * Scrape product data from retailer website
   */
  async scrapeProduct(url, config) {
    try {
      // Return mock data in dry-run mode
      if (this.isDryRun) {
        return {
          title: 'Mock Product (Dry-Run)',
          price: 49.99,
          availability: 'In Stock',
          isAvailable: true,
          category: 'Electronics',
          affiliateLink: url
        };
      }

      const response = await this.axiosInstance.get(url, {
        timeout: config.timeout,
        headers: {
          'User-Agent': config.userAgent,
          ...config.headers
        }
      });

      if (response.status === 404) {
        return {
          title: null,
          price: null,
          availability: 'Product not found',
          isAvailable: false,
          error: 'Product page not found'
        };
      }

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const cheerioLib = getCheerio();
      if (!cheerioLib) {
        throw new Error('cheerio HTML parser is not available');
      }
      
      const $ = cheerioLib.load(response.data);
      
      // Extract product data using selectors
      const title = this.extractText($, config.selectors.title);
      const priceText = this.extractText($, config.selectors.price);
      const availabilityText = this.extractText($, config.selectors.availability);
      
      const price = this.parsePrice(priceText);
      const isAvailable = this.parseAvailability(availabilityText, config.selectors.outOfStock);
      
      // Detect product category
      const category = CategoryDetector.detectCategory(title || '', url, '');
      
      // Generate affiliate link if it's Amazon
      let affiliateLink = url;
      if (trackedProduct.retailer === RETAILER_TYPES.AMAZON) {
        affiliateLink = this.affiliateEngine.generateAffiliateLink(url, trackedProduct.retailer);
      }
      
      return {
        title: title || 'Unknown Product',
        price,
        availability: availabilityText || 'Unknown',
        isAvailable,
        category,
        affiliateLink,
        scrapedAt: new Date()
      };
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        throw new Error('Request timeout - website took too long to respond');
      } else if (error.code === 'ENOTFOUND') {
        throw new Error('Network error - could not reach website');
      } else if (error.response && error.response.status === 429) {
        throw new Error('Rate limited - too many requests');
      } else {
        throw new Error(`Scraping failed: ${error.message}`);
      }
    }
  }

  /**
   * Extract text from DOM using multiple selectors
   */
  extractText($, selectors) {
    if (!selectors) return null;
    
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    
    for (const selector of selectorList) {
      const element = $(selector).first();
      if (element.length) {
        return element.text().trim();
      }
    }
    
    return null;
  }

  /**
   * Parse price from text
   */
  parsePrice(priceText) {
    if (!priceText) return null;
    
    // Remove currency symbols and extract numeric value
    const cleanPrice = priceText.replace(/[$,\s]/g, '');
    const match = cleanPrice.match(/(\d+\.?\d*)/);
    
    if (match) {
      return parseFloat(match[1]);
    }
    
    return null;
  }

  /**
   * Determine if product is available based on availability text
   */
  parseAvailability(availabilityText, outOfStockPhrases) {
    if (!availabilityText) return false;
    
    const text = availabilityText.toLowerCase();
    
    // Check for out of stock phrases
    for (const phrase of outOfStockPhrases || []) {
      if (text.includes(phrase.toLowerCase())) {
        return false;
      }
    }
    
    // Positive availability indicators
    const inStockPhrases = [
      'in stock',
      'available',
      'add to cart',
      'buy now',
      'ships',
      'delivery',
      'pickup'
    ];
    
    for (const phrase of inStockPhrases) {
      if (text.includes(phrase)) {
        return true;
      }
    }
    
    // Default to unavailable if unclear
    return false;
  }

  /**
   * Detect changes between current and new product data
   */
  detectChanges(trackedProduct, newData) {
    const changes = [];
    
    // Stock status change
    if (trackedProduct.isAvailable !== newData.isAvailable) {
      changes.push({
        type: newData.isAvailable ? 'restock' : 'out_of_stock',
        oldValue: trackedProduct.isAvailable,
        newValue: newData.isAvailable,
        description: newData.isAvailable ? 'Product is back in stock!' : 'Product went out of stock'
      });
    }
    
    // Price change
    if (trackedProduct.price && newData.price && trackedProduct.price !== newData.price) {
      const priceDiff = newData.price - trackedProduct.price;
      const percentChange = ((priceDiff / trackedProduct.price) * 100).toFixed(1);
      
      changes.push({
        type: 'price_change',
        oldValue: trackedProduct.price,
        newValue: newData.price,
        description: `Price ${priceDiff > 0 ? 'increased' : 'decreased'} by $${Math.abs(priceDiff).toFixed(2)} (${Math.abs(percentChange)}%)`
      });
    }
    
    // Significant price drop (target price reached)
    if (trackedProduct.targetPrice && newData.price && newData.price <= trackedProduct.targetPrice) {
      changes.push({
        type: 'target_price_reached',
        oldValue: trackedProduct.price,
        newValue: newData.price,
        description: `Target price of $${trackedProduct.targetPrice} reached! Current price: $${newData.price}`
      });
    }
    
    return changes;
  }

  /**
   * Create events for product changes and send notifications
   */
  async createChangeEvents(productId, changes, productData, trackedProduct) {
    const { ProductEvent } = require('../models/TrackedProduct');
    const RedditPoster = require('./RedditPoster');
    
    const events = changes.map(change => ({
      productId,
      eventType: change.type,
      oldValue: change.oldValue,
      newValue: change.newValue,
      description: change.description,
      metadata: {
        availability: productData.availability,
        scrapedAt: productData.scrapedAt,
        category: productData.category
      }
    }));
    
    await ProductEvent.insertMany(events);
    
    // Send Reddit notifications for significant events
    const redditPoster = new RedditPoster();
    
    for (const change of changes) {
      try {
        let eventType = null;
        let eventData = {};
        
        switch (change.type) {
          case 'restock':
            eventType = 'restock';
            eventData = { productData };
            break;
          
          case 'price_change':
            // Only notify for price drops or significant changes
            if (change.newValue < change.oldValue) {
              const percentChange = ((change.oldValue - change.newValue) / change.oldValue) * 100;
              // Only notify for drops of $5+ or 10%+
              if ((change.oldValue - change.newValue) >= 5 || percentChange >= 10) {
                eventType = 'price_drop';
                eventData = {
                  oldPrice: change.oldValue,
                  newPrice: change.newValue,
                  productData
                };
              }
            }
            break;
          
          case 'target_price_reached':
            eventType = 'target_price';
            eventData = {
              targetPrice: trackedProduct.targetPrice,
              currentPrice: change.newValue,
              productData
            };
            break;
        }
        
        if (eventType) {
          await redditPoster.postDeal(trackedProduct, eventType);
        }
      } catch (error) {
        console.error(`Failed to send Telegram notification for change ${change.type}:`, error);
      }
    }
    
    return events;
  }

  /**
   * Handle monitoring errors with backoff
   */
  async handleMonitorError(trackedProduct, error) {
    const errorCount = (trackedProduct.errorCount || 0) + 1;
    const nextCheck = this.calculateNextCheck(trackedProduct, false, errorCount);
    
    const updateData = {
      errorCount,
      lastError: error.message,
      nextCheck,
      lastCheckedAt: new Date()
    };
    
    // If too many errors, mark as inactive
    if (errorCount >= 10) {
      updateData.isActive = false;
    }
    
    await trackedProduct.updateOne(updateData);
    
    // Create error event
    const { ProductEvent } = require('../models/TrackedProduct');
    await ProductEvent.create({
      productId: trackedProduct._id,
      eventType: 'error',
      description: `Monitoring error: ${error.message}`,
      metadata: {
        errorCount,
        nextCheck
      }
    });
  }

  /**
   * Calculate next check time with backoff
   */
  calculateNextCheck(trackedProduct, success, errorCount = 0) {
    const baseInterval = trackedProduct.checkInterval || 60; // minutes
    let actualInterval = baseInterval;
    
    if (!success) {
      // Exponential backoff for errors: 2^errorCount * baseInterval, max 24 hours
      const backoffMultiplier = Math.min(Math.pow(2, errorCount), 24 * 60 / baseInterval);
      actualInterval = Math.min(baseInterval * backoffMultiplier, 24 * 60);
    }
    
    return new Date(Date.now() + actualInterval * 60 * 1000);
  }

  /**
   * Batch monitor multiple products
   */
  async monitorProducts(trackedProducts) {
    const results = [];
    const BATCH_SIZE = 5; // Process 5 products at a time
    const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches
    
    for (let i = 0; i < trackedProducts.length; i += BATCH_SIZE) {
      const batch = trackedProducts.slice(i, i + BATCH_SIZE);
      
      const batchPromises = batch.map(async (product) => {
        try {
          // Add random delay to avoid detection
          const delay = Math.random() * 1000 + 500; // 0.5-1.5 seconds
          await new Promise(resolve => setTimeout(resolve, delay));
          
          const result = await this.monitorProduct(product);
          return { productId: product._id, success: true, result };
        } catch (error) {
          return { productId: product._id, success: false, error: error.message };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Delay between batches
      if (i + BATCH_SIZE < trackedProducts.length) {
        await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
      }
    }
    
    return results;
  }

  /**
   * Get products due for checking
   */
  async getProductsDueForCheck() {
    const { TrackedProduct } = require('../models/TrackedProduct');
    
    return await TrackedProduct.find({
      isActive: true,
      $or: [
        { nextCheck: { $lte: new Date() } },
        { nextCheck: { $exists: false } } // Include products without nextCheck set
      ]
    });
  }
}

module.exports = { ProductMonitor };