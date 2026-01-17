/**
 * Retailer Monitor System
 * Handles detection of items across multiple retailers
 */

class RetailerMonitor {
  // Supported retailers
  static RETAILERS = {
    AMAZON: 'amazon',
    WALMART: 'walmart',
    TARGET: 'target',
    BEST_BUY: 'bestbuy',
    GAMESTOP: 'gamestop',
    EBAY: 'ebay',
  };

  // Item categories
  static CATEGORIES = {
    POKEMON_TCG: 'pokemon-tcg',
    ONE_PIECE_TCG: 'one-piece-tcg',
    SPORTS_CARDS: 'sports-cards',
    LIMITED_EXCLUSIVE: 'limited-exclusive',
    HYPE_ITEMS: 'hype-items',
  };

  /**
   * Classify item priority based on characteristics
   */
  static classifyPriority(item) {
    let priority = 0;
    let classification = [];

    // Restock gets highest priority
    if (item.isRestock) {
      priority += 100;
      classification.push('RESTOCK');
    }

    // Hype/limited edition
    if (item.isLimitedEdition || item.isHypeItem) {
      priority += 50;
      classification.push('HYPE');
    }

    // High discount
    if (item.discountPercent && item.discountPercent >= 20) {
      priority += 30;
      classification.push('HIGH_DISCOUNT');
    } else if (item.discountPercent && item.discountPercent >= 10) {
      priority += 15;
      classification.push('DISCOUNT');
    }

    // Confidence scoring
    let confidence = 50; // Base confidence
    if (item.reviewCount && item.reviewCount > 100) confidence += 15;
    if (item.stockLevel === 'low') confidence += 10;
    if (item.demandIndicator === 'high') confidence += 20;

    return {
      priority,
      classification: classification.join(','),
      confidence: Math.min(confidence, 100),
    };
  }

  /**
   * Check if item is restock
   */
  static isRestock(currentItem, previousItem) {
    if (!previousItem) return false;
    // Item was out of stock, now in stock
    return (
      previousItem.inStock === false &&
      currentItem.inStock === true
    );
  }

  /**
   * Check if Amazon item is affiliate-eligible
   */
  static isAmazonAffiliateEligible(item) {
    // Mock logic: assume eligible if product type is standard
    // In production, this would check actual Amazon Product API
    const eligibleCategories = [
      'pokemon-tcg',
      'one-piece-tcg',
      'sports-cards',
      'toys',
      'collectibles',
      'electronics',
    ];
    return (
      item.retailer === this.RETAILERS.AMAZON &&
      eligibleCategories.some((cat) => item.category.includes(cat))
    );
  }

  /**
   * Validate retailer
   */
  static isValidRetailer(retailer) {
    return Object.values(this.RETAILERS).includes(retailer.toLowerCase());
  }

  /**
   * Validate category
   */
  static isValidCategory(category) {
    return Object.values(this.CATEGORIES).includes(category.toLowerCase());
  }
}

module.exports = RetailerMonitor;
