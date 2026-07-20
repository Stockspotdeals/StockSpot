const cron = require('node-cron');
const crypto = require('crypto');
const { processSignal } = require('./signalPipeline');
const { generateTrendingKeywords } = require('./signalSourcer');

const SOURCE_LABEL = 'connector';
const MAX_SIGNALS_PER_HOUR = 50;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const CATEGORY_COOLDOWN_MS = 12 * 60 * 1000;

const connectorHistory = [];
const connectorCooldowns = new Map();
const connectorHashes = new Map();
let schedulerStarted = false;

function isMockConnectorEnabled() {
  return process.env.CONNECTOR_ENABLE_MOCKS === 'true';
}

function cleanupConnectorState() {
  const oldestAllowed = Date.now() - 60 * 60 * 1000;
  while (connectorHistory.length && connectorHistory[0] < oldestAllowed) {
    connectorHistory.shift();
  }

  const now = Date.now();
  for (const [key, timestamp] of connectorHashes.entries()) {
    if (now - timestamp > DEDUPE_WINDOW_MS) {
      connectorHashes.delete(key);
    }
  }

  for (const [category, timestamp] of connectorCooldowns.entries()) {
    if (now - timestamp > CATEGORY_COOLDOWN_MS * 3) {
      connectorCooldowns.delete(category);
    }
  }
}

function hashConnectorSignal(signal) {
  const priceBucket = signal.price != null ? `${Math.round(signal.price / 5) * 5}` : 'none';
  const normalized = [signal.product || '', signal.store || '', signal.type || '', priceBucket].map(v => String(v).trim().toLowerCase()).join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function isCategoryOnCooldown(category) {
  const lastEmit = connectorCooldowns.get(category);
  return lastEmit && (Date.now() - lastEmit) < CATEGORY_COOLDOWN_MS;
}

async function submitConnectorSignal(rawSignal) {
  cleanupConnectorState();

  const category = rawSignal.category || (rawSignal.product || '').toLowerCase();
  if (connectorHistory.length >= MAX_SIGNALS_PER_HOUR) {
    console.warn('[DataConnectors] hourly connector quota reached');
    return false;
  }

  if (isCategoryOnCooldown(category)) {
    console.warn('[DataConnectors] category cooldown active', category);
    return false;
  }

  const signalHash = hashConnectorSignal(rawSignal);
  if (connectorHashes.has(signalHash)) {
    console.log('[DataConnectors] duplicate connector signal skipped', rawSignal.product, rawSignal.store, rawSignal.type);
    return false;
  }

  connectorHashes.set(signalHash, Date.now());
  connectorHistory.push(Date.now());
  connectorCooldowns.set(category, Date.now());

  const normalizedSignal = {
    product: rawSignal.product,
    productName: rawSignal.product,
    store: rawSignal.store,
    price: rawSignal.price,
    originalPrice: rawSignal.originalPrice,
    signalType: rawSignal.type,
    type: rawSignal.type,
    source: SOURCE_LABEL,
    confidenceScore: rawSignal.confidenceScore || 0.75,
    timestamp: rawSignal.timestamp || new Date().toISOString(),
    title: rawSignal.title || `${rawSignal.product} ${rawSignal.type}`,
    description: rawSignal.description,
    premiumOnly: rawSignal.premiumOnly || false,
    priority: rawSignal.priority != null ? rawSignal.priority : 3,
    metadata: {
      ...rawSignal.metadata,
      connector: SOURCE_LABEL,
      generatedAt: new Date().toISOString()
    }
  };

  try {
    const result = await processSignal(normalizedSignal);
    console.log('[DataConnectors] Connector signal processed', normalizedSignal.product, normalizedSignal.type, 'result=', result ? 'saved' : 'queued');
    return true;
  } catch (error) {
    console.error('[DataConnectors] Connector pipeline error:', error.message);
    return false;
  }
}

function productSearchConnector() {
  return [
    {
      product: 'Nintendo Switch OLED',
      store: 'MockMarket',
      price: 319.99,
      originalPrice: 349.99,
      type: 'search-scan',
      confidenceScore: 0.88,
      title: 'Nintendo Switch OLED availability scan',
      description: 'Simulated marketplace search connector result showing availability and pricing.',
      timestamp: new Date().toISOString(),
      priority: 3,
      metadata: { marketplace: 'MockMarket', category: 'electronics' }
    },
    {
      product: 'Apple AirPods Pro',
      store: 'MockMarket',
      price: 219.99,
      originalPrice: 249.99,
      type: 'search-scan',
      confidenceScore: 0.82,
      title: 'AirPods Pro price and availability detected',
      description: 'Mock product search connector returned the latest seller listing and price data.',
      timestamp: new Date().toISOString(),
      priority: 3,
      metadata: { marketplace: 'MockMarket', category: 'electronics' }
    }
  ];
}

function priceTrackingConnector() {
  const items = [
    { product: 'NVIDIA GeForce RTX 4080', store: 'PriceTrackAPI', base: 1049.99 },
    { product: 'LEGO Star Wars UCS', store: 'PriceTrackAPI', base: 699.99 },
    { product: 'Pokemon TCG Booster', store: 'PriceTrackAPI', base: 129.99 }
  ];

  return items.map(item => {
    const drop = Math.round((Math.random() * 18 + 7) * 10) / 10;
    const currentPrice = Math.round((item.base * (1 - drop / 100)) * 100) / 100;
    return {
      product: item.product,
      store: item.store,
      price: currentPrice,
      originalPrice: item.base,
      type: 'price-drop',
      confidenceScore: 0.9,
      title: `${item.product} price drop detected`,
      description: `Simulated price tracker detected a ${drop}% drop for ${item.product}.`,
      timestamp: new Date().toISOString(),
      priority: 3,
      metadata: { dropPercent: drop, category: 'electronics' }
    };
  });
}

function restockSignalConnector() {
  const restockItems = [
    { product: 'PlayStation 5 Console', store: 'RestockWatch', category: 'electronics' },
    { product: 'LEGO UCS Millennium Falcon', store: 'RestockWatch', category: 'lego' },
    { product: 'Nike Air Zoom Shoes', store: 'RestockWatch', category: 'shoes' }
  ];

  return restockItems.map(item => ({
    product: item.product,
    store: item.store,
    price: Math.round((Math.random() * 80 + 120) * 100) / 100,
    originalPrice: null,
    type: 'restock',
    confidenceScore: 0.86,
    title: `${item.product} restock signal`,
    description: `Simulated restock connector detected inventory replenishment for ${item.product}.`,
    timestamp: new Date().toISOString(),
    priority: 3,
    metadata: { category: item.category, restockVolume: Math.floor(Math.random() * 50 + 20) }
  }));
}

function trendFeedConnector() {
  const keywords = generateTrendingKeywords();
  return keywords.map((keyword, index) => ({
    product: keyword,
    store: 'TrendFeed',
    price: Math.round((Math.random() * 400 + 80) * 100) / 100,
    originalPrice: null,
    type: 'trend',
    confidenceScore: 0.8,
    title: `Trend signal: ${keyword}`,
    description: `Connector trend feed combines AI and external signals for ${keyword}.`,
    timestamp: new Date().toISOString(),
    priority: 3,
    metadata: { source: 'trendFeed', index, category: keyword.toLowerCase().includes('lego') ? 'lego' : 'electronics' }
  }));
}

async function fetchConnectorSignals() {
  if (!isMockConnectorEnabled()) {
    console.log('[DataConnectors] Mock connector outputs disabled; skipping synthetic signal generation');
    return [];
  }

  const connectors = [
    productSearchConnector,
    priceTrackingConnector,
    restockSignalConnector,
    trendFeedConnector
  ];

  let results = [];
  for (const connector of connectors) {
    try {
      const output = await connector();
      if (Array.isArray(output)) {
        results = results.concat(output);
      }
    } catch (error) {
      console.error('[DataConnectors] Connector failed:', error.message);
    }
  }

  return results;
}

async function runConnectorCycle() {
  console.log('[DataConnectors] Running connector ingestion cycle');
  const signals = await fetchConnectorSignals();
  let accepted = 0;

  for (const signal of signals) {
    try {
      const stored = await submitConnectorSignal(signal);
      if (stored) accepted += 1;
    } catch (error) {
      console.error('[DataConnectors] Failed to submit connector signal:', error.message);
    }
  }

  console.log(`[DataConnectors] Connector cycle completed. signals=${signals.length}, accepted=${accepted}`);
  return { attempted: signals.length, accepted };
}

function initializeConnectorScheduler() {
  if (schedulerStarted) return;
  schedulerStarted = true;

  try {
    cron.schedule('*/15 * * * *', async () => {
      try {
        await runConnectorCycle();
      } catch (error) {
        console.error('[DataConnectors] Scheduler error:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.CONNECTOR_SCHEDULER_TZ || 'UTC'
    });

    console.log('[DataConnectors] External data connector scheduler initialized (every 15 minutes)');
  } catch (error) {
    console.error('[DataConnectors] Failed to initialize connector scheduler:', error.message);
  }
}

module.exports = {
  initializeConnectorScheduler,
  runConnectorCycle,
  fetchConnectorSignals,
  hashConnectorSignal
};
