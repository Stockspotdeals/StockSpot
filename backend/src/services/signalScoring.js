function getDiscountPercent(signal) {
  let discountPercent = 0;

  if (signal.metadata && typeof signal.metadata.percentChange === 'number') {
    discountPercent = Math.abs(signal.metadata.percentChange);
  }

  if (!discountPercent && signal.originalPrice && signal.price && signal.originalPrice > 0) {
    discountPercent = ((signal.originalPrice - signal.price) / signal.originalPrice) * 100;
  }

  if (!Number.isFinite(discountPercent) || discountPercent < 0) {
    discountPercent = 0;
  }

  return discountPercent;
}

function getFreshnessPoints(signal) {
  const createdAt = signal.createdAt ? new Date(signal.createdAt) : new Date();
  const ageHours = Math.max(0, (Date.now() - createdAt.getTime()) / (1000 * 60 * 60));
  return Math.max(0, 30 - ageHours * 1.5);
}

function getTypeBonus(signalType) {
  switch ((signalType || '').toLowerCase()) {
    case 'restock':
      return 10;
    case 'price-drop':
      return 15;
    default:
      return 0;
  }
}

function getPremiumBonus(premiumOnly) {
  return premiumOnly ? 5 : 0;
}

function normalizeScore(rawScore) {
  return Math.round(Math.min(100, Math.max(0, rawScore)));
}

function calculateSignalScore(signal) {
  const discountPercent = getDiscountPercent(signal);
  const freshnessPoints = getFreshnessPoints(signal);
  const typeBonus = getTypeBonus(signal.signalType);
  const premiumBonus = getPremiumBonus(signal.premiumOnly);

  const rawScore = (discountPercent * 2) + freshnessPoints + typeBonus + premiumBonus;
  return normalizeScore(rawScore);
}

module.exports = {
  calculateSignalScore
};
