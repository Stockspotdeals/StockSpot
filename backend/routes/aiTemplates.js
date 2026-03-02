const express = require("express");
const router = express.Router();

// Reuse existing premium middleware
const requirePremium = require("../middleware/requirePremium");

// Utility generator (pure function, no DB writes)
function generateFlipTemplate(product) {
  const {
    title,
    currentPrice,
    avgMarketPrice,
    category
  } = product;

  const profit = avgMarketPrice - currentPrice;
  const marginPercent = ((profit / currentPrice) * 100).toFixed(1);

  let urgencyLine = "";
  if (marginPercent > 40) {
    urgencyLine = "🔥 High flip margin opportunity!";
  } else if (marginPercent > 20) {
    urgencyLine = "⚡ Solid resale spread.";
  } else {
    urgencyLine = "📈 Moderate resale potential.";
  }

  return {
    suggestedResalePrice: avgMarketPrice,
    estimatedProfit: profit,
    marginPercent,
    urgencyLine,
    ebayTemplate: `\n${title}\nCondition: Brand New\nPrice: $${avgMarketPrice}\nDescription:\nIn-demand ${category} item currently hard to find in stock.\nSecure it now before supply tightens again.\n`,
    marketplaceTemplate: `\nFOR SALE: ${title}\nRetail Arbitrage Opportunity\nBuy Price: $${currentPrice}\nSuggested Flip: $${avgMarketPrice}\nEstimated Margin: ${marginPercent}%\n`,
    shortCaption: `${title} — flip spread ~${marginPercent}%`
  };
}

router.post("/generate-flip-template", requirePremium, (req, res) => {
  const product = req.body;

  if (!product || !product.title || !product.currentPrice || !product.avgMarketPrice) {
    return res.status(400).json({ message: "Invalid product data" });
  }

  const template = generateFlipTemplate(product);
  return res.json(template);
});

module.exports = router;
