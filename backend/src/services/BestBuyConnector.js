/**
 * BestBuyConnector — Real retailer integration using the Best Buy Products API.
 *
 * Official API docs: https://developer.bestbuy.com/documentation/products-api
 *
 * Required env var:  BESTBUY_API_KEY
 * Optional env var:  BESTBUY_MAX_PRODUCTS  (default 10 — products checked per run)
 *
 * If BESTBUY_API_KEY is not set this module degrades gracefully.
 *
 * The primary integration path is now ProductMonitor for Best Buy tracked
 * products. This module supplies the official API client used by that path.
 */

const https = require('https');
const { TrackedProduct } = require('../models/TrackedProduct');
const { RetailerDetector, RETAILER_TYPES } = require('./RetailerDetector');

const BB_API_BASE = 'https://api.bestbuy.com/v1/products';
const BB_SHOW_FIELDS = 'sku,name,salePrice,regularPrice,onlineAvailability,onlineAvailabilityText';
const REQUEST_DELAY_MS = 250;     // 4 req/sec  (free tier allows 5 req/sec)
const MAX_PRODUCTS_PER_RUN = Number(process.env.BESTBUY_MAX_PRODUCTS) || 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Simple HTTPS GET that returns parsed JSON.
 * Uses the built-in https module to avoid any additional dependencies.
 */
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 429) {
          return reject(new Error('Best Buy API rate limited (429)'));
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Best Buy API HTTP ${res.statusCode}`));
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Best Buy API returned invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Best Buy API request timeout'));
    });
  });
}

/**
 * Fetch one product from the Best Buy Products API by SKU.
 * Returns null if the product is not found or on error.
 */
async function fetchBestBuyProduct(sku, apiKey) {
  const url = `${BB_API_BASE}(sku=${encodeURIComponent(sku)})?apiKey=${encodeURIComponent(apiKey)}&format=json&show=${BB_SHOW_FIELDS}`;
  const data = await httpsGet(url);
  if (!data.products || !data.products.length) return null;
  return data.products[0];
}

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Called by signalIngestion every 15 minutes.
 * Reads active Best Buy TrackedProducts, queries the Best Buy API,
 * and returns signal payloads for restock and price-drop events.
 */
async function loadBestBuySignals() {
  const apiKey = process.env.BESTBUY_API_KEY;

  if (!apiKey) {
    // Silently skip — no key configured, no log spam
    return [];
  }

  let trackedProducts;
  try {
    trackedProducts = await TrackedProduct.find({
      retailer: RETAILER_TYPES.BESTBUY,
      isActive: true
    })
      .sort({ lastCheckedAt: 1 })   // oldest-checked first
      .limit(MAX_PRODUCTS_PER_RUN)
      .lean();
  } catch (err) {
    console.error('[BestBuyConnector] Failed to load TrackedProducts:', err.message);
    return [];
  }

  if (!trackedProducts.length) {
    return [];
  }

  console.log(`[BestBuyConnector] Checking ${trackedProducts.length} Best Buy product(s) via API`);

  const signals = [];

  for (const tp of trackedProducts) {
    try {
      const sku = RetailerDetector.extractProductId(tp.url, RETAILER_TYPES.BESTBUY);
      if (!sku) {
        console.warn('[BestBuyConnector] Could not extract SKU from URL:', tp.url);
        continue;
      }

      const product = await fetchBestBuyProduct(sku, apiKey);
      if (!product) {
        console.warn(`[BestBuyConnector] SKU ${sku} not found in Best Buy API`);
        continue;
      }

      const currentPrice = product.salePrice || product.regularPrice || null;
      const regularPrice = product.regularPrice || currentPrice;
      const isOnline = !!product.onlineAvailability;
      const previousPrice = tp.price || null;
      const wasAvailable = tp.isAvailable || false;

      // ── Restock signal ─────────────────────────────────────────
      if (isOnline && !wasAvailable) {
        signals.push({
          productName: product.name || tp.title,
          store: 'Best Buy',
          signalType: 'restock',
          premiumOnly: false,
          title: `${product.name || tp.title} — Back in Stock`,
          description: `${product.name || tp.title} is now available online at Best Buy.`,
          affiliateUrl: tp.affiliateLink || tp.url,
          imageUrl: tp.image || '',
          priority: 2,
          source: 'bestbuy_api',
          metadata: {
            sku,
            currentPrice,
            previousPrice,
            onlineAvailabilityText: product.onlineAvailabilityText || 'Available'
          }
        });
        console.log(`[BestBuyConnector] Restock signal: ${product.name} (SKU ${sku})`);
      }

      // ── Price-drop signal ──────────────────────────────────────
      if (
        currentPrice !== null &&
        previousPrice !== null &&
        currentPrice < previousPrice
      ) {
        const dropPct = Math.round(((previousPrice - currentPrice) / previousPrice) * 100);
        if (dropPct >= 5) {
          signals.push({
            productName: product.name || tp.title,
            store: 'Best Buy',
            signalType: 'price-drop',
            premiumOnly: dropPct < 10,   // small drops are premium-only
            title: `${product.name || tp.title} — ${dropPct}% Off`,
            description: `Price dropped from $${previousPrice.toFixed(2)} to $${currentPrice.toFixed(2)} on Best Buy.`,
            affiliateUrl: tp.affiliateLink || tp.url,
            imageUrl: tp.image || '',
            priority: dropPct >= 20 ? 1 : dropPct >= 10 ? 2 : 3,
            source: 'bestbuy_api',
            metadata: {
              sku,
              currentPrice,
              previousPrice,
              percentChange: -dropPct
            }
          });
          console.log(`[BestBuyConnector] Price-drop signal: ${product.name} (SKU ${sku}) ${dropPct}% off`);
        }
      }

      // Update TrackedProduct with latest price/availability so future
      // runs can detect changes. Non-fatal if this fails.
      try {
        await TrackedProduct.findByIdAndUpdate(tp._id, {
          $set: {
            price: currentPrice,
            isAvailable: isOnline,
            lastCheckedAt: new Date()
          }
        });
      } catch (updateErr) {
        console.warn('[BestBuyConnector] Failed to update TrackedProduct state:', updateErr.message);
      }

    } catch (err) {
      console.error(`[BestBuyConnector] Error processing tracked product ${tp._id}:`, err.message);
    }

    // Respect Best Buy's rate limit between each product
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[BestBuyConnector] Done. ${signals.length} signal(s) generated.`);
  return signals;
}

module.exports = {
  loadBestBuySignals,
  fetchBestBuyProduct
};
