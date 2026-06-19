const { CategoryDetector } = require('./CategoryDetector');

const HIGH_TIER_THRESHOLD = 80;
const MEDIUM_TIER_THRESHOLD = 55;

const CATEGORY_WEIGHTS = {
  collectibles: 18,
  pokemon_tcg: 18,
  one_piece_tcg: 18,
  sports_cards: 18,
  electronics: 10,
  gaming: 10,
  toys: 8,
  other: 4
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function detectCategory(signal) {
  if (signal.category) {
    return signal.category;
  }

  if (signal.metadata && signal.metadata.category) {
    return signal.metadata.category;
  }

  return CategoryDetector.detectCategory(
    signal.productName || signal.title || '',
    signal.url || '',
    signal.description || ''
  );
}

function getPriceDropPercent(signal) {
  const metadata = signal.metadata || {};
  if (typeof metadata.percentChange === 'number' && Number.isFinite(metadata.percentChange)) {
    return Math.abs(metadata.percentChange);
  }

  const currentPrice = metadata.currentPrice ?? signal.price;
  const previousPrice = metadata.previousPrice ?? signal.originalPrice;
  if (typeof currentPrice === 'number' && typeof previousPrice === 'number' && previousPrice > currentPrice && previousPrice > 0) {
    return ((previousPrice - currentPrice) / previousPrice) * 100;
  }

  return 0;
}

function getRestockDurationHours(signal) {
  const metadata = signal.metadata || {};
  const candidate = metadata.outOfStockDurationHours ?? metadata.hoursOutOfStock ?? metadata.restockDurationHours;
  if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0) {
    return candidate;
  }
  return 0;
}

function getHighValueBoost(signal) {
  const metadata = signal.metadata || {};
  const currentPrice = metadata.currentPrice ?? signal.price ?? 0;
  if (typeof currentPrice === 'number' && currentPrice >= 500) {
    return 12;
  }
  if (typeof currentPrice === 'number' && currentPrice >= 250) {
    return 6;
  }
  return 0;
}

function getCategoryWeight(category) {
  return CATEGORY_WEIGHTS[category] ?? CATEGORY_WEIGHTS.other;
}

function getTier(score) {
  if (score >= HIGH_TIER_THRESHOLD) {
    return 'HIGH';
  }
  if (score >= MEDIUM_TIER_THRESHOLD) {
    return 'MEDIUM';
  }
  return 'LOW';
}

function buildReasoning(parts) {
  return parts.filter(Boolean).join('; ');
}

function calculateConfidence(signal, category, reasoningCount) {
  let confidence = 0.6;
  if (signal.signalType === 'price-drop' && getPriceDropPercent(signal) > 0) {
    confidence += 0.15;
  }
  if (signal.signalType === 'restock') {
    confidence += 0.1;
  }
  if (category !== 'other') {
    confidence += 0.08;
  }
  confidence += Math.min(0.12, reasoningCount * 0.03);
  return Number(clamp(confidence, 0.5, 0.95).toFixed(2));
}

function enrichPriceDrop(signal, category, reasoning) {
  const priceDropPercent = getPriceDropPercent(signal);
  const categoryWeight = getCategoryWeight(category);
  const dropScore = clamp(priceDropPercent * 2.2, 0, 60);
  const valueBoost = getHighValueBoost(signal);

  reasoning.push(`price drop ${priceDropPercent.toFixed(1)}%`);
  reasoning.push(`category weight ${categoryWeight}`);
  if (valueBoost > 0) {
    reasoning.push(`high-value boost ${valueBoost}`);
  }

  return clamp(15 + dropScore + categoryWeight + valueBoost, 0, 100);
}

function enrichRestock(signal, category, reasoning) {
  const durationHours = getRestockDurationHours(signal);
  const rarityBoost = clamp(durationHours * 1.8, 0, 35);
  const categoryWeight = getCategoryWeight(category);
  const valueBoost = getHighValueBoost(signal);

  reasoning.push(durationHours > 0
    ? `out of stock for ${durationHours.toFixed(1)}h`
    : 'restock duration unavailable, using baseline');
  reasoning.push(`category weight ${categoryWeight}`);
  if (valueBoost > 0) {
    reasoning.push(`high-value boost ${valueBoost}`);
  }

  return clamp(35 + rarityBoost + categoryWeight + valueBoost, 0, 100);
}

function enrichOutOfStock(signal, category, reasoning) {
  const categoryWeight = Math.round(getCategoryWeight(category) * 0.45);
  const valueBoost = Math.round(getHighValueBoost(signal) * 0.75);

  reasoning.push('out-of-stock baseline penalty applied');
  reasoning.push(`category weight ${categoryWeight}`);
  if (valueBoost > 0) {
    reasoning.push(`high-value boost ${valueBoost}`);
  }

  return clamp(18 + categoryWeight + valueBoost, 0, 100);
}

function enrichPriceIncrease(signal, category, reasoning) {
  const categoryWeight = Math.round(getCategoryWeight(category) * 0.4);
  reasoning.push('price increase de-prioritized');
  reasoning.push(`category weight ${categoryWeight}`);
  return clamp(20 + categoryWeight, 0, 100);
}

function computeHeuristicScore(signal, category, reasoning) {
  switch (signal.signalType) {
    case 'price-drop':
      return enrichPriceDrop(signal, category, reasoning);
    case 'restock':
      return enrichRestock(signal, category, reasoning);
    case 'out-of-stock':
      return enrichOutOfStock(signal, category, reasoning);
    case 'price-increase':
      return enrichPriceIncrease(signal, category, reasoning);
    default:
      reasoning.push('unknown signal type baseline');
      return 50;
  }
}

function enrichSignal(signal, options = {}) {
  const fallbackScore = typeof options.fallbackScore === 'number' ? options.fallbackScore : 50;

  try {
    const reasoning = [];
    const category = detectCategory(signal);
    const score = Math.round(computeHeuristicScore(signal, category, reasoning));
    const tier = getTier(score);
    const confidence = calculateConfidence(signal, category, reasoning.length);

    return {
      ...signal,
      category,
      score,
      tier,
      confidence,
      reasoning: buildReasoning(reasoning),
      metadata: {
        ...(signal.metadata || {}),
        category,
        signalIntelligence: {
          score,
          tier,
          confidence,
          reasoning: buildReasoning(reasoning)
        }
      }
    };
  } catch (error) {
    return {
      ...signal,
      score: fallbackScore,
      tier: 'MEDIUM',
      confidence: 0.5,
      reasoning: `enrichment fallback: ${error.message}`,
      metadata: {
        ...(signal.metadata || {}),
        signalIntelligence: {
          score: fallbackScore,
          tier: 'MEDIUM',
          confidence: 0.5,
          reasoning: `enrichment fallback: ${error.message}`
        }
      }
    };
  }
}

function shouldCreateAlertSignal(signal) {
  return signal && signal.tier !== 'LOW';
}

module.exports = {
  enrichSignal,
  shouldCreateAlertSignal,
  getTier
};