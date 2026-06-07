const cron = require('node-cron');
const crypto = require('crypto');
const Signal = require('../models/Signal');
const { processSignal } = require('./signalPipeline');

const SOURCE_NAME = 'ai_sourcer';
const MAX_SIGNALS_PER_HOUR = 50;
const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
const CATEGORY_COOLDOWN_MS = 12 * 60 * 1000;
const hourlySignalTimestamps = [];
const categoryCooldowns = new Map();
const dedupeCache = new Map();
let schedulerStarted = false;

const trendCategories = [
  'Pokémon',
  'LEGO',
  'GPUs',
  'Shoes',
  'Electronics'
];

const priceTargets = [
  { productName: 'NVIDIA GeForce RTX 4090', store: 'Best Buy', price: 1599.99 },
  { productName: 'PlayStation 5 Console', store: 'Walmart', price: 499.99 },
  { productName: 'LEGO UCS Millennium Falcon', store: 'Amazon', price: 649.99 },
  { productName: 'Pokemon 151 Booster Box', store: 'Target', price: 349.99 },
  { productName: 'Running Shoes Bundle', store: 'Nike', price: 129.99 }
];

const restockTargets = [
  { productName: 'Nintendo Switch OLED', store: 'GameStop' },
  { productName: 'LEGO Star Wars Helmet', store: 'Amazon' },
  { productName: 'RTX 4080 GPU', store: 'Best Buy' },
  { productName: 'AirPods Pro', store: 'Apple' },
  { productName: 'Pokemon TCG Elite Trainer Box', store: 'Target' }
];

function getSignalHash(payload) {
  const idString = [payload.productName || '', payload.signalType || '', SOURCE_NAME]
    .map(val => String(val).trim().toLowerCase())
    .join('|');
  return crypto.createHash('sha256').update(idString).digest('hex');
}

function cleanupOldEntries() {
  const cutoff = Date.now() - 60 * 60 * 1000;
  while (hourlySignalTimestamps.length && hourlySignalTimestamps[0] < cutoff) {
    hourlySignalTimestamps.shift();
  }

  const now = Date.now();
  for (const [category, lastTime] of categoryCooldowns.entries()) {
    if (now - lastTime > CATEGORY_COOLDOWN_MS * 3) {
      categoryCooldowns.delete(category);
    }
  }

  for (const [hash, timestamp] of dedupeCache.entries()) {
    if (Date.now() - timestamp > DEDUPE_WINDOW_MS) {
      dedupeCache.delete(hash);
    }
  }
}

function generateTrendingKeywords() {
  const suffixes = [
    'restock',
    'demand spike',
    'shortage',
    'limited drops',
    'collector alert'
  ];

  const templates = [
    (keyword) => `PS5 ${keyword}`,
    (keyword) => `Pokemon 151 ${keyword}`,
    (keyword) => `RTX 50 series ${keyword}`,
    (keyword) => `LEGO UCS ${keyword}`,
    (keyword) => `${keyword} shortage alert`
  ];

  return trendCategories.map((category, index) => {
    const suffix = suffixes[index % suffixes.length];
    const pattern = templates[index % templates.length](category);
    return `${pattern}`;
  });
}

function analyzeMarketSentiment(product) {
  // Placeholder for future AI sentiment analysis integration.
  // This function should later call OpenAI, Gemini, or an external trend API.
  return {
    sentimentScore: Math.round((Math.random() * 0.6 + 0.2) * 100) / 100,
    sentimentLabel: ['bullish', 'neutral', 'caution'][Math.floor(Math.random() * 3)],
    summary: `Market interest for ${product.productName || product.category || 'this item'} is currently ${['rising', 'stable', 'softening'][Math.floor(Math.random() * 3)]}.`
  };
}

async function aiRankSignal(signal) {
  // Future hook for AI ranking services like OpenAI or Gemini.
  // It can enrich the signal with an aiRankScore and external context.
  return {
    ...signal,
    metadata: {
      ...signal.metadata,
      aiRankScore: Math.round((signal.confidenceScore || 0.5) * 100) / 100,
      aiRankedAt: new Date().toISOString()
    }
  };
}

function getCategoryTag(signal) {
  if (!signal.productName) return 'general';
  const lower = signal.productName.toLowerCase();
  if (lower.includes('pokemon')) return 'pokemon';
  if (lower.includes('lego')) return 'lego';
  if (lower.includes('rtx') || lower.includes('gpu')) return 'gpus';
  if (lower.includes('shoes')) return 'shoes';
  return 'electronics';
}

function canSubmitSignal(category) {
  cleanupOldEntries();

  if (hourlySignalTimestamps.length >= MAX_SIGNALS_PER_HOUR) {
    return false;
  }

  const lastCategoryTime = categoryCooldowns.get(category);
  if (lastCategoryTime && Date.now() - lastCategoryTime < CATEGORY_COOLDOWN_MS) {
    return false;
  }

  return true;
}

async function hasRecentDuplicate(payload, hash) {
  if (dedupeCache.has(hash)) {
    return true;
  }

  const cutoff = new Date(Date.now() - DEDUPE_WINDOW_MS);
  const query = {
    signalType: payload.signalType,
    source: SOURCE_NAME,
    createdAt: { $gte: cutoff }
  };

  if (payload.productName) {
    query.productName = payload.productName;
  }

  const existing = await Signal.findOne(query).lean();
  if (existing) {
    dedupeCache.set(hash, Date.now());
    return true;
  }

  dedupeCache.set(hash, Date.now());
  return false;
}

function buildBaseSignal(signalData, categoryTag) {
  const confidenceScore = Math.round((Math.random() * 0.35 + 0.65) * 100) / 100;
  const baseSignal = {
    ...signalData,
    source: SOURCE_NAME,
    category: categoryTag,
    confidenceScore,
    premiumOnly: false,
    metadata: {
      ...signalData.metadata,
      sourceLayer: SOURCE_NAME,
      category: categoryTag,
      generatedAt: new Date().toISOString()
    }
  };

  if (!baseSignal.title) {
    baseSignal.title = `${signalData.signalType || 'Opportunity'}: ${signalData.productName || signalData.category || 'Product'}`;
  }

  return baseSignal;
}

function buildTrendingSignals() {
  return generateTrendingKeywords().map((keyword) => {
    const categoryTag = getCategoryTag({ productName: keyword });
    return buildBaseSignal({
      productName: keyword,
      store: 'AI Trends',
      signalType: 'demand-spike',
      title: `${keyword} alert`,
      description: `AI-generated trend signal for ${keyword}.`,
      imageUrl: 'https://images.stockspot.com/ai-trend.jpg',
      affiliateUrl: 'https://stockspot.com/ai-trends',
      priority: 2,
      metadata: {
        keyword,
        estimatedDemand: `${Math.floor(Math.random() * 40) + 60}%`,
        category: categoryTag
      }
    }, categoryTag);
  });
}

function buildPriceDropSignals() {
  return priceTargets.map((item) => {
    const categoryTag = getCategoryTag(item);
    const dropPercent = Math.round((Math.random() * 20 + 10) * 10) / 10;
    return buildBaseSignal({
      productName: item.productName,
      store: item.store,
      signalType: 'price-drop',
      title: `${item.productName} price drop`,
      description: `Simulated price movement signal with an estimated ${dropPercent}% drop.`,
      imageUrl: 'https://images.stockspot.com/price-drop.jpg',
      affiliateUrl: 'https://stockspot.com/price-drops',
      priority: dropPercent > 15 ? 2 : 1,
      metadata: {
        previousPrice: item.price,
        currentPrice: Math.max(item.price - (item.price * dropPercent / 100), 1).toFixed(2),
        percentChange: dropPercent,
        category: categoryTag
      }
    }, categoryTag);
  });
}

function buildRestockSignals() {
  return restockTargets.map((item) => {
    const categoryTag = getCategoryTag(item);
    return buildBaseSignal({
      productName: item.productName,
      store: item.store,
      signalType: 'restock',
      title: `${item.productName} restock detected`,
      description: `Simulated restock intelligence signal for ${item.productName}.`,
      imageUrl: 'https://images.stockspot.com/restock.jpg',
      affiliateUrl: 'https://stockspot.com/restocks',
      priority: 1,
      metadata: {
        stockLevel: Math.floor(Math.random() * 40) + 20,
        category: categoryTag
      }
    }, categoryTag);
  });
}

function buildSentimentSignals() {
  return restockTargets.slice(0, 3).map((item) => {
    const categoryTag = getCategoryTag(item);
    const sentiment = analyzeMarketSentiment(item);
    return buildBaseSignal({
      productName: item.productName,
      store: item.store,
      signalType: 'sentiment',
      title: `${item.productName} sentiment alert`,
      description: sentiment.summary,
      imageUrl: 'https://images.stockspot.com/sentiment.jpg',
      affiliateUrl: 'https://stockspot.com/sentiment',
      priority: sentiment.sentimentScore > 0.7 ? 2 : 1,
      metadata: {
        sentiment,
        category: categoryTag
      }
    }, categoryTag);
  });
}

async function submitSignal(rawSignal) {
  const category = rawSignal.category || getCategoryTag(rawSignal);
  if (!canSubmitSignal(category)) {
    console.warn('[SignalSourcer] Rate limit or cooldown prevents submission for category:', category);
    return false;
  }

  const hash = getSignalHash(rawSignal);
  if (await hasRecentDuplicate(rawSignal, hash)) {
    console.log('[SignalSourcer] Duplicate signal suppressed:', rawSignal.productName, rawSignal.signalType);
    return false;
  }

  const enriched = await aiRankSignal(rawSignal);
  categoryCooldowns.set(category, Date.now());
  hourlySignalTimestamps.push(Date.now());

  const result = await processSignal(enriched);
  if (result) {
    console.log('[SignalSourcer] Signal sent to pipeline:', enriched.productName, enriched.signalType);
    return true;
  }

  console.log('[SignalSourcer] Signal queued or ignored by pipeline:', enriched.productName, enriched.signalType);
  return true;
}

async function loadAIOpportunities() {
  const trending = buildTrendingSignals();
  const priceDrops = buildPriceDropSignals();
  const restocks = buildRestockSignals();
  const sentiments = buildSentimentSignals();

  return [...trending, ...priceDrops, ...restocks, ...sentiments];
}

async function runAISourcing() {
  console.log('[SignalSourcer] Running AI sourcing cycle');
  const opportunities = await loadAIOpportunities();
  let submitted = 0;

  for (const rawSignal of opportunities) {
    try {
      const accepted = await submitSignal(rawSignal);
      if (accepted) submitted += 1;
      if (submitted >= MAX_SIGNALS_PER_HOUR) {
        console.log('[SignalSourcer] Hourly AI signal quota reached');
        break;
      }
    } catch (error) {
      console.error('[SignalSourcer] Failed to submit signal:', error.message);
    }
  }

  return {
    attempted: opportunities.length,
    submitted
  };
}

function initializeAISourcingScheduler() {
  if (schedulerStarted) return;

  schedulerStarted = true;
  try {
    cron.schedule('*/15 * * * *', async () => {
      try {
        await runAISourcing();
      } catch (error) {
        console.error('[SignalSourcer] Scheduler error:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.SIGNAL_SOURCING_TZ || 'UTC'
    });

    console.log('[SignalSourcer] AI signal sourcing scheduler initialized (every 15 minutes)');
  } catch (error) {
    console.error('[SignalSourcer] Failed to initialize scheduler:', error.message);
  }
}

module.exports = {
  generateTrendingKeywords,
  analyzeMarketSentiment,
  aiRankSignal,
  loadAIOpportunities,
  runAISourcing,
  initializeAISourcingScheduler
};
