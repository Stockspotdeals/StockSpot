const axios = require('axios');
const { RetailerDetector, RETAILER_TYPES } = require('./RetailerDetector');
const { CategoryDetector } = require('./CategoryDetector');
const { AffiliateEngine } = require('./AffiliateEngine');
const { SmartFetchRouter } = require('./SmartFetchRouter');

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
    this.requestJitterMs = Number(process.env.UNIVERSAL_MONITOR_JITTER_MS) || 600;
    this.maxRetries = Number(process.env.UNIVERSAL_MONITOR_MAX_RETRIES) || 2;
    this.lastRequestAt = 0;
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    ];
    this.axiosInstance = this.isDryRun ? null : axios.create({
      timeout: 30000,
      maxRedirects: 3,
      validateStatus: (status) => status < 600
    });
    this.affiliateEngine = new AffiliateEngine();
    this.fetchRouter = new SmartFetchRouter({
      httpFetch: async (url, config) => this.fetchHtmlWithRetry(url, config),
      classifyPage: (url, response, config) => this.classifyPageResponse(url, response, config),
      headlessCooldownMs: Number(process.env.HEADLESS_FETCH_COOLDOWN_MS) || 5000,
      headlessTimeoutMs: Number(process.env.HEADLESS_FETCH_TIMEOUT_MS) || 45000,
      headlessEnabled: process.env.HEADLESS_FETCH_ENABLED !== 'false'
    });
  }

  /**
   * Monitor a single product
   */
  async monitorProduct(trackedProduct) {
    try {
      const retailerConfig = RetailerDetector.getRetailerConfig(trackedProduct.retailer);
      const productData = await this.scrapeProduct(trackedProduct, retailerConfig);

      const restrictedPage = productData.restricted || ['blocked', 'bot_interstitial'].includes(productData.pageType);
      const shouldPersistProduct = !restrictedPage && ['product_page', 'redirect'].includes(productData.pageType);

      if (restrictedPage) {
        await trackedProduct.updateOne({
          monitoringState: 'restricted',
          lastPageType: productData.pageType,
          lastFetchStatus: productData.fetchStatus,
          lastFetchReason: productData.extractionReason,
          lastError: productData.extractionReason,
          lastCheckedAt: new Date(),
          nextCheck: this.calculateNextCheck(trackedProduct, false, (trackedProduct.errorCount || 0) + 1)
        });

        console.warn(`[ProductMonitor] restricted url=${productData.url} pageType=${productData.pageType} status=${productData.fetchStatus} reason=${productData.extractionReason}`);
        return {
          success: true,
          restricted: true,
          pageType: productData.pageType,
          changes: [],
          productData,
          trackedProduct: { ...trackedProduct.toObject(), monitoringState: 'restricted' }
        };
      }

      const productUpdate = {
        title: productData.title || trackedProduct.title,
        lastCheckedAt: new Date(),
        price: productData.price,
        availability: productData.availability,
        isAvailable: productData.inStock,
        category: productData.category || trackedProduct.category,
        affiliateLink: productData.affiliateLink || trackedProduct.affiliateLink,
        errorCount: 0,
        lastError: null,
        monitoringState: 'active',
        lastPageType: productData.pageType,
        lastFetchStatus: productData.fetchStatus,
        lastFetchReason: productData.extractionReason,
        nextCheck: this.calculateNextCheck(trackedProduct, true),
        flags: {
          restock: (productData.flags && productData.flags.restock) || (trackedProduct.flags && trackedProduct.flags.restock) || false,
          highDemand: (productData.flags && productData.flags.highDemand) || (trackedProduct.flags && trackedProduct.flags.highDemand) || false
        }
      };

      if (shouldPersistProduct) {
        await trackedProduct.updateOne(productUpdate);
      } else {
        productUpdate.monitoringState = 'active';
        productUpdate.lastPageType = productData.pageType;
      }
      
      const changes = this.detectChanges(trackedProduct, productData);
      
      // Create events for significant changes
      if (changes.length > 0 && shouldPersistProduct) {
        await this.createChangeEvents(trackedProduct._id, changes, productData, trackedProduct);
      }
      
      return {
        success: true,
        restricted: false,
        pageType: productData.pageType,
        changes,
        productData,
        trackedProduct: { ...trackedProduct.toObject(), ...productUpdate }
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
          lastChecked: new Date(),
          pageType: 'product_page',
          fetchStatus: 200,
          extractionReason: 'dry-run mock payload',
          restricted: false
        });
      }

      const page = await this.fetchRouter.fetchDocument(url, config);
      console.info(`[ProductMonitor] url=${page.url} mode=${page.fetchMode || 'http'} pageType=${page.pageType} status=${page.fetchStatus} reason=${page.extractionReason}`);

      if (['blocked', 'bot_interstitial'].includes(page.pageType)) {
        return this.buildNormalizedSnapshot(trackedProduct, {
          title: trackedProduct.title || 'Restricted Page',
          price: null,
          availability: 'Restricted',
          inStock: false,
          category: trackedProduct.category,
          affiliateLink: trackedProduct.affiliateLink || url,
          lastChecked: new Date(),
          pageType: page.pageType,
          fetchStatus: page.fetchStatus,
          extractionReason: page.extractionReason,
          restricted: true,
          fetchMode: page.fetchMode || 'http'
        });
      }

      const cheerioLib = getCheerio();
      if (!cheerioLib) {
        throw new Error('cheerio HTML parser is not available');
      }

      if (page.pageType === 'not_found' || page.pageType === 'unknown') {
        return this.buildNormalizedSnapshot(trackedProduct, {
          title: trackedProduct.title || 'Unknown Product',
          price: null,
          availability: page.pageType === 'not_found' ? 'Not Found' : 'Unknown',
          inStock: false,
          category: trackedProduct.category,
          affiliateLink: trackedProduct.affiliateLink || url,
          lastChecked: new Date(),
          pageType: page.pageType,
          fetchStatus: page.fetchStatus,
          extractionReason: page.extractionReason,
          restricted: false,
          fetchMode: page.fetchMode || 'http'
        });
      }

      const $ = cheerioLib.load(page.html);
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

      const normalizedSnapshot = this.buildNormalizedSnapshot(trackedProduct, {
        title: title || trackedProduct.title || 'Unknown Product',
        price,
        availability: availabilityText || (inStock ? 'Available' : 'Unavailable'),
        inStock,
        category,
        affiliateLink,
        lastChecked: new Date(),
        pageType: page.pageType,
        fetchStatus: page.fetchStatus,
        extractionReason: title || price !== null || availabilityText ? 'extracted product page' : 'missing product signals',
        restricted: false,
        fetchMode: page.fetchMode || 'http'
      });

      if (normalizedSnapshot.pageType === 'redirect') {
        normalizedSnapshot.extractionReason = page.extractionReason || 'redirected product page';
      }

      return normalizedSnapshot;

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
        await this.enforceRequestDelay(attempt);

        const response = await this.axiosInstance.get(url, {
          timeout: config.timeout,
          maxRedirects: config.maxRedirects || 3,
          headers: {
            ...this.buildBrowserHeaders(url, attempt, config),
            ...config.headers
          }
        });

        this.lastRequestAt = Date.now();
        const classified = this.classifyPageResponse(url, response, config);
        console.info(`[ProductMonitor] url=${classified.url} pageType=${classified.pageType} status=${classified.fetchStatus} reason=${classified.extractionReason}`);

        const shouldRetry = attempt < this.maxRetries && this.shouldRetryPage(classified);
        if (shouldRetry) {
          const backoffMs = this.computeBackoffMs(attempt, classified);
          console.warn(`[ProductMonitor] Retry ${attempt + 1}/${this.maxRetries} in ${backoffMs}ms: url=${url} pageType=${classified.pageType} status=${classified.fetchStatus}`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        return classified;
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < this.maxRetries && this.isRetryableError(error);
        if (!shouldRetry) {
          throw error;
        }

        const backoffMs = this.computeBackoffMs(attempt, null);
        console.warn(`[ProductMonitor] Retry ${attempt + 1}/${this.maxRetries} in ${backoffMs}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError || new Error('HTML fetch failed');
  }

  async enforceRequestDelay(attempt = 0) {
    const elapsed = Date.now() - this.lastRequestAt;
    const jitter = this.computeJitterMs(attempt);
    const targetDelay = this.minRequestDelayMs + jitter;
    if (elapsed < targetDelay) {
      await new Promise(resolve => setTimeout(resolve, targetDelay - elapsed));
    }
  }

  computeJitterMs(attempt = 0) {
    const baseJitter = Math.floor(Math.random() * this.requestJitterMs);
    return Math.min(this.requestJitterMs, baseJitter + attempt * 150);
  }

  computeBackoffMs(attempt, page = null) {
    const base = Math.min(1000 * Math.pow(2, attempt), 5000);
    const pagePenalty = page && ['blocked', 'bot_interstitial'].includes(page.pageType) ? 500 : 0;
    return base + pagePenalty + this.computeJitterMs(attempt);
  }

  isRetryableError(error) {
    if (!error) return false;
    if (error.response && [429, 500, 502, 503, 504].includes(error.response.status)) {
      return true;
    }
    return ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN'].includes(error.code);
  }

  shouldRetryPage(page) {
    return page && ['blocked', 'bot_interstitial'].includes(page.pageType);
  }

  getRandomUserAgent(attempt = 0) {
    const index = (Date.now() + attempt) % this.userAgents.length;
    return this.userAgents[index];
  }

  buildBrowserHeaders(url, attempt = 0, config = {}) {
    const parsedUrl = new URL(url);
    const referer = config.referer || `${parsedUrl.protocol}//${parsedUrl.host}/`;

    return {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
      Referer: referer,
      'User-Agent': this.getRandomUserAgent(attempt)
    };
  }

  classifyPageResponse(requestedUrl, response, config = {}) {
    const html = typeof response.data === 'string' ? response.data : '';
    const statusCode = response.status;
    const finalUrl = this.getFinalResponseUrl(response) || requestedUrl;
    const normalizedFinalUrl = String(finalUrl).trim();
    const normalizedRequestedUrl = String(requestedUrl).trim();
    const bodyText = html.replace(/\s+/g, ' ').trim();
    const pageSignals = this.inspectPageSignals(html, bodyText, config);
    const redirectDetected = normalizedFinalUrl && normalizedRequestedUrl && normalizedFinalUrl !== normalizedRequestedUrl;

    let pageType = 'unknown';
    let extractionReason = 'no page signals matched';

    if ([403, 429, 503].includes(statusCode) || pageSignals.blocked) {
      pageType = 'blocked';
      extractionReason = pageSignals.blockReason || `HTTP ${statusCode}`;
    } else if (statusCode === 404 || pageSignals.notFound) {
      pageType = 'not_found';
      extractionReason = pageSignals.notFoundReason || `HTTP ${statusCode}`;
    } else if (pageSignals.botInterstitial) {
      pageType = 'bot_interstitial';
      extractionReason = pageSignals.botReason || 'bot protection interstitial detected';
    } else if (redirectDetected) {
      pageType = 'redirect';
      extractionReason = `redirected to ${normalizedFinalUrl}`;
    } else if (pageSignals.productSignals) {
      pageType = 'product_page';
      extractionReason = pageSignals.productReason || 'product signals detected';
    }

    return {
      url: normalizedFinalUrl,
      requestedUrl: normalizedRequestedUrl,
      fetchStatus: statusCode,
      status: statusCode,
      finalUrl: normalizedFinalUrl,
      pageType,
      extractionReason,
      html,
      responseHeaders: response.headers || {},
      restricted: ['blocked', 'bot_interstitial'].includes(pageType)
    };
  }

  inspectPageSignals(html, bodyText, config = {}) {
    const lowerHtml = String(html || '').toLowerCase();
    const lowerText = String(bodyText || '').toLowerCase();
    const combined = `${lowerHtml} ${lowerText}`;
    const titleMatch = /<title[^>]*>(.*?)<\/title>/i.exec(html || '');
    const titleText = titleMatch ? titleMatch[1].toLowerCase() : '';

    const blockedPatterns = [
      'access denied',
      'request denied',
      'forbidden',
      'not authorized',
      'temporarily unavailable',
      'service unavailable'
    ];

    const botPatterns = [
      'pardon our interruption',
      'verify you are human',
      'are you a robot',
      'robot check',
      'captcha',
      'cloudflare',
      'just a moment',
      'please stand by',
      'enable javascript',
      'bot protection',
      'incapsula'
    ];

    const notFoundPatterns = [
      'page not found',
      '404',
      'not found',
      'product not found',
      'item not found'
    ];

    const productPatterns = [
      'add to cart',
      'out of stock',
      'sold out',
      'in stock',
      'available now',
      'price'
    ];

    const blocked = blockedPatterns.some(pattern => combined.includes(pattern));
    const botInterstitial = botPatterns.some(pattern => combined.includes(pattern) || titleText.includes(pattern));
    const notFound = notFoundPatterns.some(pattern => combined.includes(pattern) || titleText.includes(pattern));
    const productSignals = productPatterns.some(pattern => combined.includes(pattern));

    return {
      blocked,
      blockReason: blocked ? 'blocked response content detected' : null,
      botInterstitial,
      botReason: botInterstitial ? 'bot interstitial content detected' : null,
      notFound,
      notFoundReason: notFound ? 'not found content detected' : null,
      productSignals,
      productReason: productSignals ? 'product keywords detected' : null
    };
  }

  getFinalResponseUrl(response) {
    return response?.request?.res?.responseUrl || response?.config?.url || response?.request?.responseURL || null;
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
      affiliateLink: data.affiliateLink || trackedProduct.affiliateLink || trackedProduct.url,
      pageType: data.pageType || 'unknown',
      fetchStatus: data.fetchStatus || null,
      extractionReason: data.extractionReason || 'unknown',
      restricted: !!data.restricted,
      fetchMode: data.fetchMode || 'http'
    };
  }

  getFetchRouterStats() {
    return this.fetchRouter.getStats();
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
      lastCheckedAt: new Date(),
      monitoringState: trackedProduct.monitoringState || 'active'
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