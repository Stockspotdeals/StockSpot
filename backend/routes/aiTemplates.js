const express = require("express");
const router = express.Router();

// Reuse existing premium middleware
const requirePremium = require("../middleware/requirePremium");

// Utility generator for single template strategy (pure function, no DB writes)
function generateFlipTemplate(product, strategy = 'balanced') {
  const {
    title,
    currentPrice,
    avgMarketPrice,
    category
  } = product;

  // Apply strategy-specific adjustments
  let resalePrice = avgMarketPrice;
  let strategyLabel = '';
  let strategyDescription = '';

  if (strategy === 'aggressive') {
    // Quick flip: lower price for fast liquidation
    resalePrice = avgMarketPrice * 0.92; // 8% below market
    strategyLabel = '⚡ Quick Flip (Fast Liquidation)';
    strategyDescription = 'Lower price for faster sales and reduced holding costs.';
  } else if (strategy === 'conservative') {
    // Patient approach: higher price, willing to wait
    resalePrice = avgMarketPrice * 1.08; // 8% above market
    strategyLabel = '📈 Premium Strategy (Patient)';
    strategyDescription = 'Hold for premium pricing; ideal for high-demand items.';
  } else {
    // Balanced (default)
    resalePrice = avgMarketPrice;
    strategyLabel = '⚖️ Balanced Strategy (Optimal)';
    strategyDescription = 'Suggested market price for steady demand.';
  }

  const profit = parseFloat((resalePrice - currentPrice).toFixed(2));
  const marginPercent = ((profit / currentPrice) * 100).toFixed(1);

  let urgencyLine = '';
  if (marginPercent > 40) {
    urgencyLine = '🔥 High flip margin opportunity!';
  } else if (marginPercent > 20) {
    urgencyLine = '⚡ Solid resale spread.';
  } else {
    urgencyLine = '📈 Moderate resale potential.';
  }

  return {
    strategy,
    strategyLabel,
    strategyDescription,
    suggestedResalePrice: parseFloat(resalePrice.toFixed(2)),
    estimatedProfit: profit,
    marginPercent,
    urgencyLine,
    ebayTemplate: `${title}\nCondition: Brand New\nPrice: $${resalePrice.toFixed(2)}\nDescription:\nIn-demand ${category} item. ${urgencyLine}`,
    marketplaceTemplate: `FOR SALE: ${title}\nBuy Price: $${currentPrice}\nFlip Price: $${resalePrice.toFixed(2)}\nMargin: ${marginPercent}%`,
    shortCaption: `${title} — margin ${marginPercent}%`
  };
}

// Generate multiple templates with different strategies
function generateTemplates(product, count = 3) {
  const strategies = ['aggressive', 'balanced', 'conservative'];
  const templates = [];

  for (let i = 0; i < Math.min(count, strategies.length); i++) {
    const template = generateFlipTemplate(product, strategies[i]);
    templates.push(template);
  }

  return templates;
}

router.post("/generate-flip-template", requirePremium, (req, res) => {
  const product = req.body;

  if (!product || !product.title || !product.currentPrice || !product.avgMarketPrice) {
    return res.status(400).json({ message: "Invalid product data" });
  }

  const templates = generateTemplates(product, 3);
  return res.json({
    success: true,
    templates: templates
  });
});

module.exports = router;
