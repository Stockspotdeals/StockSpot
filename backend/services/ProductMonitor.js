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
    this.minRequestDelayMs = Number(process.env.UNIVERSAL_MONITOR_DELAY_MS) || 1500;
    this.maxRetries = Number(process.env.UNIVERSAL_MONITOR_MAX_RETRIES) || 2;
    this.lastRequestAt = 0;
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
      const productData = await this.scrapeProduct(trackedProduct, retailerConfig);
      
      const changes = this.detectChanges(trackedProduct, productData);
      
      // Update product with new data
      const updateData = {
        title: productData.title || trackedProduct.title,
        lastCheckedAt: new Date(),
        price: productData.price,
        availability: productData.availability,
        isAvailable: productData.inStock,
        category: productData.category || trackedProduct.category,
        affiliateLink: productData.affiliateLink || trackedProduct.affiliateLink,
        errorCount: 0, // Reset on successful check
        lastError: null,
        nextCheck: this.calculateNextCheck(trackedProduct, true),
        // carry forward any new flags, defaulting to existing values or false
        flags: {
          restock: (productData.flags && productData.flags.restock) || (trackedProduct.flags && trackedProduct.flags.restock) || false,
          highDemand: (productData.flags && productData.flags.highDemand) || (trackedProduct.flags && trackedProduct.flags.highDemand) || false
        }
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
  async scrapeProduct(trackedProduct, config) {
    try {
      const url = RetailerDetector.normalizeUrl(trackedProduct.url, trackedProduct.retailer);

      // Return mock data in dry-run mode
      if (this.isDryRun) {
        return this.buildNormalizedSnapshot(trackedProduct, {
          title: 'Mock Product (Dry-Run)',
          price: 49.99,
          availability: 'In Stock',
          inStock: true,
          category: 'electronics',
          affiliateLink: url,
          lastChecked: new Date()
        });
      }

      const response = await this.fetchHtmlWithRetry(url, config);
      const cheerioLib = getCheerio();
      if (!cheerioLib) {
        throw new Error('cheerio HTML parser is not available');
      }

      const $ = cheerioLib.load(response.data);
      const pageText = $('body').text().replace(/\s+/g, ' ').trim();
      const title = this.extractTitle($, trackedProduct, config);
      const price = this.extractPrice($, pageText, config);
      const availabilityText = this.extractAvailability($, pageText, config);
      const inStock = this.parseAvailability(availabilityText || pageText, config.selectors?.outOfStock || []);
      const category = CategoryDetector.detectCategory(title || trackedProduct.title || '', url, pageText);

      let affiliateLink = url;
      if (trackedProduct.retailer === RETAILER_TYPES.AMAZON) {
        affiliateLink = this.affiliateEngine.generateAffiliateLink(url, trackedProduct.retailer);
      }

      return this.buildNormalizedSnapshot(trackedProduct, {
        title: title || trackedProduct.title || 'Unknown Product',
        price,
        availability: availabilityText || (inStock ? 'Available' : 'Unavailable'),
        inStock,
        category,
        affiliateLink,
        lastChecked: new Date()
      });

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

  async fetchHtmlWithRetry(url, config) {
    if (!this.axiosInstance) {
      throw new Error('HTTP client is not available');
    }

    let lastError = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        await this.enforceRequestDelay();

        const response = await this.axiosInstance.get(url, {
          timeout: config.timeout,
          headers: {
            'User-Agent': config.userAgent,
            ...config.headers
          }
        });

        this.lastRequestAt = Date.now();

        if (response.status === 404) {
          return {
            status: 404,
            data: '',
            statusText: 'Not Found'
          };
        }

        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response;
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < this.maxRetries && this.isRetryableError(error);
        if (!shouldRetry) {
          throw error;
        }

        const backoffMs = this.computeBackoffMs(attempt);
        console.warn(`[ProductMonitor] Retry ${attempt + 1}/${this.maxRetries} in ${backoffMs}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError || new Error('HTML fetch failed');
  }

  async enforceRequestDelay() {
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < this.minRequestDelayMs) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestDelayMs - elapsed));
    }
  }

  computeBackoffMs(attempt) {
    return Math.min(1000 * Math.pow(2, attempt), 5000);
  }

  isRetryableError(error) {
    if (!error) return false;
    if (error.response && [429, 500, 502, 503, 504].includes(error.response.status)) {
      return true;
    }
    return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code);
  }

  buildNormalizedSnapshot(trackedProduct, data) {
    return {
      url: RetailerDetector.normalizeUrl(trackedProduct.url, trackedProduct.retailer),
      title: data.title || trackedProduct.title || 'Unknown Product',
      price: data.price !== undefined ? data.price : trackedProduct.price || null,
      inStock: !!data.inStock,
      previousPrice: trackedProduct.price || null,
      lastChecked: data.lastChecked || new Date(),
      availability: data.availability || (data.inStock ? 'Available' : 'Unavailable'),
      category: data.category || CategoryDetector.detectCategory(data.title || trackedProduct.title || '', trackedProduct.url, ''),
      affiliateLink: data.affiliateLink || trackedProduct.affiliateLink || trackedProduct.url
    };
  }

  extractTitle($, trackedProduct, config) {
    const selectorCandidates = [
      config.selectors && config.selectors.title,
      'meta[property="og:title"]',
      'meta[name="twitter:title"]',
      'title',
      'h1',
      '[itemprop="name"]',
      '[data-testid*="title"]',
      '[class*="title"]'
    ].filter(Boolean);

    for (const candidate of selectorCandidates) {
      const text = this.extractTextOrMeta($, candidate);
      if (text) {
        return text;
      }
    }

    return trackedProduct.title || null;
  }

  extractPrice($, pageText, config) {
    const selectorCandidates = [
      config.selectors && config.selectors.price,
      'meta[property="product:price:amount"]',
      'meta[property="og:price:amount"]',
      '[itemprop="price"]',
      '[data-testid*="price"]',
      '[class*="price"]'
    ].filter(Boolean);

    for (const candidate of selectorCandidates) {
      const text = this.extractTextOrMeta($, candidate);
      const price = this.parsePrice(text);
      if (price !== null) {
        return price;
      }
    }

    const fallbackPrice = this.parsePrice(pageText);
    return fallbackPrice !== null ? fallbackPrice : null;
  }

  extractAvailability($, pageText, config) {
    const selectorCandidates = [
      config.selectors && config.selectors.availability,
      '[data-testid*="availability"]',
      '[class*="availability"]',
      '[class*="stock"]',
      '[id*="availability"]'
    ].filter(Boolean);

    for (const candidate of selectorCandidates) {
      const text = this.extractTextOrMeta($, candidate);
      if (text) {
        return text;
      }
    }

    return pageText;
  }

  extractTextOrMeta($, selector) {
    const element = $(selector).first();
    if (!element.length) {
      return null;
    }

    const tagName = String(element.get(0).tagName || '').toLowerCase();
    if (tagName === 'meta') {
      return element.attr('content') || element.attr('value') || null;
    }

    return element.text().trim() || element.attr('content') || element.attr('value') || null;
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

    if (trackedProduct.title && newData.title && trackedProduct.title !== newData.title) {
      changes.push({
        type: 'title_change',
        oldValue: trackedProduct.title,
        newValue: newData.title,
        description: `Title changed from "${trackedProduct.title}" to "${newData.title}"`
      });
    }
    
    // Stock status change
    if (trackedProduct.isAvailable !== newData.inStock) {
      changes.push({
        type: newData.inStock ? 'restock' : 'out_of_stock',
        oldValue: trackedProduct.isAvailable,
        newValue: newData.inStock,
        description: newData.inStock ? 'Product is back in stock!' : 'Product went out of stock'
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
    
    const events = changes
      .filter(change => change.type !== 'title_change')
      .map(change => ({
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

    if (events.length > 0) {
      await ProductEvent.insertMany(events);
    }

    const titleChange = changes.find(change => change.type === 'title_change');
    if (titleChange) {
      console.log(`[ProductMonitor] Title change detected for ${trackedProduct._id}: ${titleChange.oldValue} -> ${titleChange.newValue}`);
    }
    
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

        if (!eventType) {
          continue;
        }
        
        // Note: Event notifications (email, RSS) can be implemented here
      } catch (error) {
        console.error(`Failed to send notification for change ${change.type}:`, error);
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