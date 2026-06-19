const { EventEmitter } = require('events');
const crypto = require('crypto');
const Signal = require('../models/Signal');
const { processSignalWatchlistAlerts } = require('./watchlistAlertMatcher');
const { calculateSignalScore } = require('./signalScoring');
const { enrichSignalWithAffiliateData, calculateMonetizationBoost } = require('./affiliateEnricher');
const { upsertAlertSignalFromSignal } = require('./signalToAlertBridge');
const { enrichSignal, shouldCreateAlertSignal } = require('./SignalEnricher');

const signalEmitter = new EventEmitter();
const duplicateCache = new Map();
const liveSignalCache = [];
const delayedQueue = [];

const DEDUPE_WINDOW_MS = 30 * 60 * 1000;
const LIVE_CACHE_LIMIT = 100;
const LOW_SCORE_THRESHOLD = 60;
const DELAYED_PROCESS_INTERVAL_MS = 30 * 1000;
let delayedQueueTimer = null;

function getSignalHash(payload) {
  const idString = [payload.productId || '', payload.productName || '', payload.signalType || '', payload.store || '']
    .map(val => String(val).trim().toLowerCase())
    .join('|');
  return crypto.createHash('sha256').update(idString).digest('hex');
}

async function isDuplicate(payload, hash) {
  if (duplicateCache.has(hash)) {
    const age = Date.now() - duplicateCache.get(hash);
    if (age < DEDUPE_WINDOW_MS) {
      return true;
    }
  }

  const query = {
    signalType: payload.signalType,
    store: payload.store,
    createdAt: { $gte: new Date(Date.now() - DEDUPE_WINDOW_MS) }
  };

  if (payload.productId) {
    query.productId = payload.productId;
  } else if (payload.productName) {
    query.productName = payload.productName;
  }

  const existingSignal = await Signal.findOne(query).lean();
  if (existingSignal) {
    return true;
  }

  duplicateCache.set(hash, Date.now());
  return false;
}

function addLiveSignal(signal, matchedCount = 0) {
  const liveSignal = {
    id: signal._id,
    productId: signal.productId,
    productName: signal.productName,
    title: signal.title,
    description: signal.description,
    store: signal.store,
    affiliateUrl: signal.affiliateUrl,
    estimatedCommission: signal.estimatedCommission || 0,
    monetizationScore: signal.monetizationScore || 0,
    imageUrl: signal.imageUrl,
    signalType: signal.signalType,
    premiumOnly: signal.premiumOnly,
    score: signal.score,
    tier: signal.tier,
    confidence: signal.confidence,
    reasoning: signal.reasoning,
    priority: signal.priority,
    status: signal.status,
    matchStatus: matchedCount > 0,
    createdAt: signal.createdAt,
    updatedAt: signal.updatedAt
  };

  liveSignalCache.unshift(liveSignal);
  if (liveSignalCache.length > LIVE_CACHE_LIMIT) {
    liveSignalCache.pop();
  }
}

function startDelayedProcessing() {
  if (delayedQueueTimer) {
    return;
  }

  delayedQueueTimer = setInterval(async () => {
    if (!delayedQueue.length) {
      return;
    }

    const queue = delayedQueue.splice(0, delayedQueue.length);
    console.log(`[SignalPipeline] Processing ${queue.length} queued low-priority signals`);

    for (const payload of queue) {
      try {
        await saveSignal(payload);
      } catch (error) {
        console.error('[SignalPipeline] Delayed signal processing error:', error.message);
      }
    }
  }, DELAYED_PROCESS_INTERVAL_MS);
}

async function saveSignal(payload) {
  const signal = await Signal.create(payload);

  // Keep dashboard-facing alert signals in sync with core signals.
  if (shouldCreateAlertSignal(signal)) {
    try {
      await upsertAlertSignalFromSignal(signal);
    } catch (error) {
      console.error('[SignalPipeline] AlertSignal bridge failed:', error.message);
    }
  } else {
    console.log(`[SignalPipeline] AlertSignal suppressed for LOW tier signal ${signal._id}`);
  }

  signalEmitter.emit('signal:created', signal.toObject ? signal.toObject() : signal);
  signalEmitter.emit('signal:scored', {
    signalId: signal._id,
    score: signal.score,
    priority: signal.priority,
    tier: signal.tier,
    confidence: signal.confidence
  });

  let matchedCount = 0;
  try {
    matchedCount = await processSignalWatchlistAlerts(signal);
    if (matchedCount > 0) {
      signalEmitter.emit('signal:matched', {
        signalId: signal._id,
        matchCount: matchedCount
      });
      signalEmitter.emit('signal:alerted', {
        signalId: signal._id,
        alertCount: matchedCount
      });
    }
  } catch (error) {
    console.error('[SignalPipeline] Watchlist matching failed for signal:', error.message);
  }

  addLiveSignal(signal, matchedCount);
  console.log(`[SignalPipeline] Completed pipeline for signal ${signal._id}. matchedCount=${matchedCount}`);
  return signal;
}

async function processSignal(payload) {
  const signalLabel = payload.productName || payload.title || payload.signalType || 'unknown signal';
  console.log(`[SignalPipeline] Starting pipeline for ${signalLabel}`);

  try {
    const hash = getSignalHash(payload);
    if (await isDuplicate(payload, hash)) {
      console.log(`[SignalPipeline] Duplicate signal ignored: ${signalLabel}`);
      return null;
    }

    const enrichedPayload = enrichSignalWithAffiliateData(payload);
    const monetizationBoost = calculateMonetizationBoost(enrichedPayload.estimatedCommission);
    const fallbackScore = Math.min(100, Math.max(0, calculateSignalScore(enrichedPayload) + monetizationBoost));
    const intelligentSignal = enrichSignal({
      ...enrichedPayload,
      monetizationScore: enrichedPayload.monetizationScore || monetizationBoost,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    }, { fallbackScore });

    const scoredSignal = {
      ...intelligentSignal,
      score: typeof intelligentSignal.score === 'number' ? intelligentSignal.score : fallbackScore,
      tier: intelligentSignal.tier || 'MEDIUM',
      confidence: typeof intelligentSignal.confidence === 'number' ? intelligentSignal.confidence : 0.5,
      reasoning: intelligentSignal.reasoning || 'enrichment fallback',
      monetizationScore: intelligentSignal.monetizationScore || monetizationBoost,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    if (scoredSignal.tier === 'HIGH') {
      console.log(`[SignalPipeline] Processing HIGH tier signal immediately: ${signalLabel}`);
      return await saveSignal(scoredSignal);
    }

    if (scoredSignal.tier === 'MEDIUM') {
      console.log(`[SignalPipeline] Processing MEDIUM tier signal through normal alert path: ${signalLabel}`);
      return await saveSignal(scoredSignal);
    }

    console.log(`[SignalPipeline] Queuing LOW tier signal for storage without default alerting: ${signalLabel}`);
    delayedQueue.push(scoredSignal);
    startDelayedProcessing();
    return null;
  } catch (error) {
    console.error('[SignalPipeline] Pipeline error:', error.message);
    return null;
  }
}

async function getLiveSignals(isPremium = false, limit = 50) {
  try {
    const matchStage = {
      status: 'active'
    };

    if (!isPremium) {
      matchStage.premiumOnly = false;
    }

    const signals = await Signal.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: 'alerts',
          localField: '_id',
          foreignField: 'signalId',
          as: 'alerts'
        }
      },
      {
        $addFields: {
          matchStatus: { $gt: [{ $size: '$alerts' }, 0] }
        }
      },
      { $sort: { score: -1, createdAt: -1 } },
      { $limit: limit },
      {
        $project: {
          alerts: 0
        }
      }
    ]);

    return signals.map(signal => ({
      id: signal._id,
      productId: signal.productId,
      productName: signal.productName,
      title: signal.title,
      description: signal.description,
      store: signal.store,
      affiliateUrl: signal.affiliateUrl,
      imageUrl: signal.imageUrl,
      signalType: signal.signalType,
      premiumOnly: signal.premiumOnly,
      score: signal.score,
      tier: signal.tier,
      confidence: signal.confidence,
      reasoning: signal.reasoning,
      priority: signal.priority,
      estimatedCommission: signal.estimatedCommission || 0,
      monetizationScore: signal.monetizationScore || 0,
      status: signal.status,
      matchStatus: signal.matchStatus,
      createdAt: signal.createdAt,
      updatedAt: signal.updatedAt
    }));
  } catch (error) {
    console.error('[SignalPipeline] Live signal query failed:', error.message);
    return liveSignalCache.slice(0, limit);
  }
}

module.exports = {
  signalEmitter,
  processSignal,
  getLiveSignals
};
