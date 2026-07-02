class SmartFetchRouter {
  static headlessQueue = Promise.resolve();

  static lastHeadlessAt = 0;

  constructor(options = {}) {
    this.httpFetch = options.httpFetch;
    this.classifyPage = options.classifyPage;
    this.headlessCooldownMs = options.headlessCooldownMs || 5000;
    this.headlessTimeoutMs = options.headlessTimeoutMs || 45000;
    this.headlessEnabled = options.headlessEnabled !== false;
    this.browser = null;
    this.stats = {
      httpRequests: 0,
      httpWins: 0,
      headlessRequests: 0,
      headlessWins: 0,
      headlessFallbacks: 0,
      failures: 0
    };
  }

  async fetchDocument(url, config = {}) {
    if (typeof this.httpFetch !== 'function') {
      throw new Error('SmartFetchRouter requires an httpFetch function');
    }

    const httpPage = await this.httpFetch(url, config);
    this.stats.httpRequests += 1;

    if (!this.shouldUseHeadless(httpPage)) {
      this.stats.httpWins += 1;
      return {
        ...httpPage,
        fetchMode: 'http'
      };
    }

    this.stats.headlessFallbacks += 1;

    if (!this.headlessEnabled) {
      return {
        ...httpPage,
        fetchMode: 'http',
        extractionReason: `${httpPage.extractionReason}; headless disabled`
      };
    }

    try {
      const headlessPage = await this.withHeadlessSlot(async () => {
        this.stats.headlessRequests += 1;
        return await this.fetchWithHeadless(url, config);
      });

      if (this.isImprovedResult(httpPage, headlessPage)) {
        this.stats.headlessWins += 1;
        return {
          ...headlessPage,
          fetchMode: 'headless'
        };
      }

      this.stats.httpWins += 1;
      return {
        ...httpPage,
        fetchMode: 'http',
        extractionReason: `${httpPage.extractionReason}; headless no better`
      };
    } catch (error) {
      this.stats.failures += 1;
      return {
        ...httpPage,
        fetchMode: 'http',
        extractionReason: `${httpPage.extractionReason}; headless failed: ${error.message}`
      };
    }
  }

  shouldUseHeadless(page) {
    return !!page && ['blocked', 'bot_interstitial', 'redirect'].includes(page.pageType);
  }

  isImprovedResult(httpPage, headlessPage) {
    if (!headlessPage) {
      return false;
    }

    if (headlessPage.pageType === 'product_page' && httpPage.pageType !== 'product_page') {
      return true;
    }

    if (headlessPage.pageType === 'product_page' && headlessPage.fetchStatus === 200 && httpPage.fetchStatus !== 200) {
      return true;
    }

    return false;
  }

  async withHeadlessSlot(task) {
    const queued = SmartFetchRouter.headlessQueue.then(async () => {
      const waitMs = this.headlessCooldownMs - (Date.now() - SmartFetchRouter.lastHeadlessAt);
      if (waitMs > 0) {
        await this.sleep(waitMs);
      }

      try {
        return await task();
      } finally {
        SmartFetchRouter.lastHeadlessAt = Date.now();
      }
    });

    SmartFetchRouter.headlessQueue = queued.catch(() => null);
    return await queued;
  }

  async fetchWithHeadless(url, config = {}) {
    const playwright = require('playwright');
    const browser = await this.getBrowser(playwright);
    const context = await browser.newContext({
      userAgent: config.userAgent || undefined,
      locale: 'en-US',
      extraHTTPHeaders: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    const page = await context.newPage();
    try {
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: this.headlessTimeoutMs,
        referer: config.referer || undefined
      });

      try {
        await page.waitForLoadState('networkidle', { timeout: Math.min(5000, this.headlessTimeoutMs) });
      } catch (error) {
        // networkidle is optional for heavily scripted retail sites
      }

      const html = await page.content();
      const finalUrl = page.url();
      const pseudoResponse = {
        status: response ? response.status() : 200,
        data: html,
        headers: response ? await response.allHeaders() : {},
        config: { url },
        request: { res: { responseUrl: finalUrl } }
      };

      const classified = this.classifyPage(url, pseudoResponse, config);
      return {
        ...classified,
        html,
        finalUrl,
        requestedUrl: url
      };
    } finally {
      await page.close().catch(() => null);
      await context.close().catch(() => null);
    }
  }

  async getBrowser(playwright) {
    if (!this.browser) {
      this.browser = await playwright.chromium.launch({
        headless: true
      });
    }

    return this.browser;
  }

  getStats() {
    const totalHandled = this.stats.httpWins + this.stats.headlessWins;
    return {
      ...this.stats,
      totalHandled,
      httpHandledPercent: totalHandled ? Math.round((this.stats.httpWins / totalHandled) * 100) : 0,
      headlessHandledPercent: totalHandled ? Math.round((this.stats.headlessWins / totalHandled) * 100) : 0
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => null);
      this.browser = null;
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = { SmartFetchRouter };