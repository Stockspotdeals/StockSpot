/**
 * Tier Monetization System
 * Manages Free, Paid ($9.99/mo), and Yearly ($99/yr) tiers
 */

class TierManager {
  // Tier definitions
  static TIERS = {
    FREE: {
      name: 'free',
      price: 0,
      features: {
        instantAmazonAffiliate: true,
        delayedNonAmazon: 600000, // 10 minutes in milliseconds
        instantAll: false,
        emailNotifications: false,
        manualInput: false,
        priorityRanking: false,
      },
    },
    PAID: {
      name: 'paid',
      price: 9.99,
      billingCycle: 'monthly',
      features: {
        instantAmazonAffiliate: true,
        delayedNonAmazon: 0, // No delay
        instantAll: true,
        emailNotifications: true, // Placeholder
        manualInput: false,
        priorityRanking: true,
      },
    },
    YEARLY: {
      name: 'yearly',
      price: 99.0,
      billingCycle: 'yearly',
      features: {
        instantAmazonAffiliate: true,
        delayedNonAmazon: 0, // No delay
        instantAll: true,
        emailNotifications: true,
        manualInput: true, // ONLY for yearly
        priorityRanking: true,
      },
    },
  };

  /**
   * Get tier by name
   */
  static getTier(tierName) {
    const normalized = tierName.toUpperCase();
    return this.TIERS[normalized] || this.TIERS.FREE;
  }

  /**
   * Get feed delay for item based on tier and retailer
   */
  static getFeedDelay(userTier, itemRetailer) {
    const tier = this.getTier(userTier);
    
    // If instant for all, no delay
    if (tier.features.instantAll) {
      return 0;
    }

    // If Amazon affiliate and instant enabled
    if (itemRetailer.toLowerCase() === 'amazon' && tier.features.instantAmazonAffiliate) {
      return 0;
    }

    // Otherwise, apply delay for non-Amazon items
    return tier.features.delayedNonAmazon || 0;
  }

  /**
   * Check if user can access feature
   */
  static canAccess(userTier, feature) {
    const tier = this.getTier(userTier);
    return tier.features[feature] === true;
  }

  /**
   * Check if user can access manual input
   */
  static canManualInput(userTier) {
    return this.canAccess(userTier, 'manualInput');
  }

  /**
   * Validate tier
   */
  static isValidTier(tierName) {
    return Object.values(this.TIERS).some((t) => t.name === tierName.toLowerCase());
  }
}

module.exports = TierManager;
