const https = require('https');

const WALMART_API_BASE = 'https://developer.api.walmart.com/api-proxy/service/affil/product/v2/items';
const DEFAULT_MAX_PRODUCTS = 50;
const REQUEST_DELAY_MS = 1200;
const MAX_RETRIES = 2;
const REQUEST_TIMEOUT_MS = 15000;

let requestQueue = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getMaxProductsPerRun() {
  const parsed = Number(process.env.WALMART_MAX_PRODUCTS);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed);
  }
  return DEFAULT_MAX_PRODUCTS;
}

function getWalmartAdapterStatus() {
  return {
    enabled: !!process.env.WALMART_API_KEY,
    hasApiKey: !!process.env.WALMART_API_KEY,
    maxProducts: getMaxProductsPerRun(),
    requestDelayMs: REQUEST_DELAY_MS,
    maxRetries: MAX_RETRIES,
    endpoint: WALMART_API_BASE
  };
}

function runWithRateLimit(task) {
  requestQueue = requestQueue
    .catch(() => null)
    .then(async () => {
      const elapsed = Date.now() - lastRequestAt;
      if (elapsed < REQUEST_DELAY_MS) {
        await sleep(REQUEST_DELAY_MS - elapsed);
      }

      const result = await task();
      lastRequestAt = Date.now();
      return result;
    });

  return requestQueue;
}

function httpsGetJson(url, apiKey) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        Accept: 'application/json',
        'WM_CONSUMER.ID': apiKey,
        'WM_SEC.ACCESS_TOKEN': apiKey
      }
    }, (res) => {
      let body = '';

      res.on('data', chunk => {
        body += chunk;
      });

      res.on('end', () => {
        if (res.statusCode >= 400) {
          const err = new Error(`[WalmartConnector] HTTP ${res.statusCode}`);
          err.statusCode = res.statusCode;
          err.body = body;
          return reject(err);
        }

        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (error) {
          reject(new Error('[WalmartConnector] Invalid JSON response from Walmart API'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error('[WalmartConnector] Request timed out'));
    });
  });
}

function isRetryable(error) {
  if (!error) return false;
  if (error.statusCode === 429) return true;
  if (typeof error.statusCode === 'number' && error.statusCode >= 500) return true;
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'EAI_AGAIN') return true;
  return false;
}

async function fetchWithRetry(url, apiKey) {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await httpsGetJson(url, apiKey);
    } catch (error) {
      const retry = attempt < MAX_RETRIES && isRetryable(error);
      if (!retry) {
        throw error;
      }

      const backoffMs = (attempt + 1) * 1000;
      console.warn(`[WalmartConnector] Retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms: ${error.message}`);
      await sleep(backoffMs);
    }
  }

  throw new Error('[WalmartConnector] Unexpected retry loop exit');
}

function normalizeWalmartProduct(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const title = payload.name || payload.productName || payload.title || '';
  const salePrice = Number(payload.salePrice);
  const listPrice = Number(payload.msrp || payload.listPrice);
  const price = Number.isFinite(salePrice) ? salePrice : (Number.isFinite(listPrice) ? listPrice : null);

  const availabilityText =
    payload.stock ||
    payload.availabilityStatus ||
    payload.availability ||
    payload.onlineAvailabilityText ||
    '';

  const availabilityLower = String(availabilityText).toLowerCase();
  const isAvailable =
    payload.availableOnline === true ||
    payload.inStock === true ||
    payload.onlineAvailability === true ||
    (!!availabilityLower && !availabilityLower.includes('out of stock') && !availabilityLower.includes('unavailable'));

  return {
    title,
    price,
    availability: availabilityText || (isAvailable ? 'In Stock' : 'Out of Stock'),
    isAvailable,
    category: payload.categoryPath || payload.category || null,
    image: payload.largeImage || payload.mediumImage || payload.thumbnailImage || ''
  };
}

async function fetchWalmartProduct(itemId, apiKey) {
  if (!apiKey) {
    return null;
  }

  if (!itemId) {
    throw new Error('[WalmartConnector] itemId is required');
  }

  const url = `${WALMART_API_BASE}/${encodeURIComponent(itemId)}?format=json&apiKey=${encodeURIComponent(apiKey)}`;

  return runWithRateLimit(async () => {
    const response = await fetchWithRetry(url, apiKey);
    const normalized = normalizeWalmartProduct(response);

    if (!normalized) {
      console.warn('[WalmartConnector] Walmart API response could not be normalized for item', itemId);
      return null;
    }

    return {
      ...normalized,
      source: 'walmart_api',
      raw: response
    };
  });
}

module.exports = {
  fetchWalmartProduct,
  getWalmartAdapterStatus,
  getMaxProductsPerRun
};
