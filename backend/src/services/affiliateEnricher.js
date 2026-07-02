const { AffiliateEngine } = require('./AffiliateEngine');

const affiliateEngine = new AffiliateEngine();

function normalizeFloat(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.round(numeric * 100) / 100) : 0;
}

function buildAffiliateUrl(payload) {
  if (payload.affiliateUrl && typeof payload.affiliateUrl === 'string' && payload.affiliateUrl.trim()) {
    return affiliateEngine.generateAffiliateLink(payload.affiliateUrl, payload.store || payload.retailer || '');
  }

  const sourceUrl = payload.url || payload.productUrl || payload.metadata?.productUrl || payload.metadata?.url;
  if (sourceUrl && typeof sourceUrl === 'string') {
    return affiliateEngine.generateAffiliateLink(sourceUrl, payload.store || payload.retailer || '');
  }

  return '';
}

function estimateCommission(payload) {
  const price = normalizeFloat(payload.price || payload.metadata?.currentPrice || payload.metadata?.price || payload.metadata?.originalPrice);
  if (!price) return 0;

  const categoryLabel = (payload.metadata?.category || payload.productName || payload.store || 'general')
    .toString()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .trim();

  const commissionRate = affiliateEngine.getEstimatedCommissionRate(categoryLabel);
  return Math.round(price * (commissionRate / 100) * 100) / 100;
}

function calculateMonetizationScore(commission) {
  if (!commission || commission <= 0) return 0;
  return Math.min(10, Math.max(0, Math.round(commission)));
}

function calculateMonetizationBoost(commission) {
  if (!commission || commission <= 0) return 0;
  return Math.min(8, Math.max(0, Math.round(commission / 5)));
}

function enrichSignalWithAffiliateData(payload) {
  const affiliateUrl = buildAffiliateUrl(payload);
  const estimatedCommission = estimateCommission({
    ...payload,
    affiliateUrl
  });
  const monetizationScore = calculateMonetizationScore(estimatedCommission);

  return {
    ...payload,
    affiliateUrl: affiliateUrl || payload.affiliateUrl,
    estimatedCommission,
    monetizationScore,
    metadata: {
      ...payload.metadata,
      affiliate: {
        affiliateUrl: affiliateUrl || payload.affiliateUrl,
        commissionRate: affiliateEngine.getEstimatedCommissionRate(payload.metadata?.category || payload.productName || payload.store || 'general')
      }
    }
  };
}

module.exports = {
  enrichSignalWithAffiliateData,
  calculateMonetizationScore,
  calculateMonetizationBoost
};
