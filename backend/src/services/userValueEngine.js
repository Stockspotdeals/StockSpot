const Signal = require('../models/Signal');
const UserSignalInteraction = require('../models/UserSignalInteraction');
const UserValueSummary = require('../models/UserValueSummary');

const BASE_VALUES = {
  view: 0.1,
  click: 0.5,
  save: 1.0,
  affiliateClick: 0
};

function normalizeValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 100) / 100) : 0;
}

function estimateInteractionValue(actionType, signal = null, metadata = {}) {
  const base = BASE_VALUES[actionType] || 0;
  const commission = actionType === 'affiliateClick'
    ? normalizeValue(signal?.estimatedCommission || metadata?.estimatedCommission || 0)
    : 0;
  return normalizeValue(base + commission);
}

function calculateEngagementScore(summary = {}) {
  const views = summary.totalSignalsViewed || 0;
  const clicks = summary.totalClicks || 0;
  const saves = summary.totalSaves || 0;
  const affiliateClicks = summary.totalAffiliateClicks || 0;
  const affiliateValue = summary.totalAffiliateValue || 0;

  const rawScore = (views * 0.5) + (clicks * 2) + (saves * 4) + (affiliateClicks * 8) + (affiliateValue * 1.5);
  return Math.min(100, Math.round(rawScore));
}

function calculateUserValue(interactions = []) {
  if (!Array.isArray(interactions)) {
    return 0;
  }

  return normalizeValue(interactions.reduce((total, interaction) => {
    if (!interaction || !interaction.actionType) {
      return total;
    }

    const value = estimateInteractionValue(
      interaction.actionType,
      interaction.signal || null,
      interaction.metadata || {}
    );

    return total + value;
  }, 0));
}

function buildTopSignalEntry(signal, actionType, value) {
  return {
    signalId: signal._id,
    title: signal.title || signal.productName || 'Opportunity',
    store: signal.store || 'unknown',
    actionType,
    value: normalizeValue(value),
    lastInteractedAt: new Date()
  };
}

async function getOrCreateSummary(userId) {
  return await UserValueSummary.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
}

async function recordInteraction({ userId, signalId = null, actionType, estimatedValue = 0, metadata = {} }) {
  const interactionValue = normalizeValue(estimatedValue);
  const interaction = await UserSignalInteraction.create({
    userId,
    signalId,
    actionType,
    estimatedValue: interactionValue,
    metadata,
    timestamp: new Date()
  });

  const summary = await getOrCreateSummary(userId);

  if (actionType === 'view') {
    const views = Number(metadata.signalsViewed || 1);
    summary.totalSignalsViewed += views;
    summary.totalEstimatedSavings += interactionValue;
  }

  if (actionType === 'click') {
    summary.totalClicks += 1;
    summary.totalEstimatedSavings += interactionValue;
  }

  if (actionType === 'save') {
    summary.totalSaves += 1;
    summary.totalEstimatedSavings += interactionValue;
  }

  if (actionType === 'affiliateClick') {
    summary.totalAffiliateClicks += 1;
    summary.totalAffiliateValue += interactionValue;
  }

  if (signalId && actionType !== 'view') {
    const signal = await Signal.findById(signalId).lean();
    if (signal) {
      const existingIndex = summary.topSignals.findIndex(entry => String(entry.signalId) === String(signalId));
      const entry = buildTopSignalEntry(signal, actionType, interactionValue);
      if (existingIndex >= 0) {
        summary.topSignals.splice(existingIndex, 1);
      }
      summary.topSignals.unshift(entry);
      summary.topSignals = summary.topSignals
        .sort((a, b) => (b.value || 0) - (a.value || 0) || new Date(b.lastInteractedAt) - new Date(a.lastInteractedAt))
        .slice(0, 5);
    }
  }

  summary.engagementScore = calculateEngagementScore(summary);
  await summary.save();

  return interaction;
}

async function recordSignalView(userId, signals = []) {
  if (!userId || !Array.isArray(signals)) {
    return null;
  }

  const estimatedValue = normalizeValue((signals.length || 0) * BASE_VALUES.view);
  return recordInteraction({
    userId,
    actionType: 'view',
    estimatedValue,
    metadata: { signalsViewed: signals.length }
  });
}

async function getUserValueSummary(userId) {
  const summary = await UserValueSummary.findOne({ userId }).lean();
  if (!summary) {
    return {
      totalEstimatedSavings: 0,
      totalAffiliateValue: 0,
      totalSignalsViewed: 0,
      totalClicks: 0,
      totalSaves: 0,
      totalAffiliateClicks: 0,
      engagementScore: 0,
      topSignals: []
    };
  }
  return summary;
}

module.exports = {
  estimateInteractionValue,
  calculateUserValue,
  calculateEngagementScore,
  recordInteraction,
  recordSignalView,
  getUserValueSummary
};
