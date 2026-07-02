const AlertSignal = require('../models/AlertSignal');
const { shouldCreateAlertSignal } = require('./SignalEnricher');
const { AlertDispatcher, getAlertDispatcher } = require('./AlertDispatcher');

const WINDOW_MS = 15 * 60 * 1000;

// Only map Signal types that are valid AlertSignal enum values.
// 'price-increase' and 'out-of-stock' have no AlertSignal equivalent — skip them.
const SIGNAL_TYPE_MAP = {
  restock: 'restock',
  'price-drop': 'price-drop'
};

const STORE_NAME_MAP = {
  amazon: 'Amazon',
  'best buy': 'Best Buy',
  bestbuy: 'Best Buy',
  target: 'Target',
  walmart: 'Walmart',
  newegg: 'Newegg',
  'micro center': 'Micro Center',
  microcenter: 'Micro Center'
};

function normalizeStoreName(store) {
  const raw = String(store || '').trim();
  if (!raw) return 'Other';

  const mapped = STORE_NAME_MAP[raw.toLowerCase()];
  if (mapped) {
    return mapped;
  }

  // Keep known casing for common names and safely fallback.
  return raw.length > 1 ? raw[0].toUpperCase() + raw.slice(1) : 'Other';
}

function toWindowStart(dateLike) {
  const ts = new Date(dateLike || Date.now()).getTime();
  const rounded = Math.floor(ts / WINDOW_MS) * WINDOW_MS;
  return new Date(rounded);
}

function toPrice(signal) {
  const metadata = signal.metadata || {};
  const candidates = [
    metadata.currentPrice,
    signal.price,
    signal.threshold,
    metadata.previousPrice,
    0
  ];

  for (const val of candidates) {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      return val;
    }
  }

  return 0;
}

function toOriginalPrice(signal, currentPrice) {
  const metadata = signal.metadata || {};
  const prev = metadata.previousPrice;

  if (typeof prev === 'number' && Number.isFinite(prev) && prev >= currentPrice) {
    return prev;
  }

  return currentPrice;
}

async function upsertAlertSignalFromSignal(signal) {
  if (!signal) {
    return null;
  }

  if (!shouldCreateAlertSignal(signal)) {
    return null;
  }

  // Skip signal types that have no valid AlertSignal mapping.
  const normalizedSignalType = SIGNAL_TYPE_MAP[signal.signalType];
  if (!normalizedSignalType) {
    return null;
  }

  const normalizedStore = normalizeStoreName(signal.store);
  const productName = String(signal.productName || signal.title || 'Unknown Product').trim();
  const dedupeWindowStart = toWindowStart(signal.createdAt);
  const price = toPrice(signal);
  const originalPrice = toOriginalPrice(signal, price);

  const filter = {
    productName,
    store: normalizedStore,
    signalType: normalizedSignalType,
    dedupeWindowStart
  };

  const update = {
    $set: {
      sourceSignalId: signal._id,
      productName,
      store: normalizedStore,
      signalType: normalizedSignalType,
      price,
      originalPrice,
      affiliateUrl: signal.affiliateUrl || '',
      premiumOnly: !!signal.premiumOnly,
      description: signal.description || '',
      score: typeof signal.score === 'number' ? signal.score : 50,
      tier: signal.tier || 'MEDIUM',
      confidence: typeof signal.confidence === 'number' ? signal.confidence : 0.5,
      reasoning: signal.reasoning || '',
      userId: signal.userId || null,
      plan: AlertDispatcher.normalizePlan(signal.plan, signal.subscriptionStatus),
      imageUrl: signal.imageUrl || '',
      expiresAt: signal.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
      updatedAt: new Date()
    },
    $setOnInsert: {
      dedupeWindowStart,
      ...AlertDispatcher.getInitialDeliveryState({
        tier: signal.tier || 'MEDIUM',
        premiumOnly: !!signal.premiumOnly,
        userId: signal.userId || null,
        plan: AlertDispatcher.normalizePlan(signal.plan, signal.subscriptionStatus)
      }),
      createdAt: signal.createdAt || new Date()
    }
  };

  const alertSignal = await AlertSignal.findOneAndUpdate(filter, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true
  });

  try {
    await getAlertDispatcher().handleNewAlertSignal(alertSignal);
  } catch (error) {
    console.error('[signalToAlertBridge] Alert dispatch failed:', error.message);
  }

  return alertSignal;
}

module.exports = {
  upsertAlertSignalFromSignal
};
