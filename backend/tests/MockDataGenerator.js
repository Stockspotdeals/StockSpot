/**
 * Mock Data Generator
 * Generates realistic mock data for dry-run testing
 */

class MockDataGenerator {
  static generateMockItems() {
    const now = new Date();

    return [
      // Amazon - Restock (HIGH PRIORITY)
      {
        id: 'mock-amazon-pokemon-1',
        name: 'Pokémon Scarlet & Violet Base Set Booster Box',
        retailer: 'amazon',
        category: 'pokemon-tcg',
        asin: 'B0CX1Y2K9J',
        price: 129.99,
        originalPrice: 159.99,
        discountPercent: 18.75,
        link: 'https://amazon.com/dp/B0CX1Y2K9J',
        inStock: true,
        isRestock: true, // Just came back in stock
        isLimitedEdition: false,
        isHypeItem: true,
        detectedAt: new Date(now.getTime() - 2 * 60000), // 2 min ago
        image: 'https://via.placeholder.com/300x300?text=Pokemon+Booster+Box',
        description: 'Authentic Pokémon TCG booster box - just restocked',
        retailerLogo: 'https://via.placeholder.com/50x50?text=Amazon',
        stockLevel: 'low',
        demandIndicator: 'high',
        reviewCount: 245,
        rating: 4.8,
      },

      // Walmart - Discount Item
      {
        id: 'mock-walmart-sports-1',
        name: 'Elite Series Football Card Collection - Limited Edition',
        retailer: 'walmart',
        category: 'sports-cards',
        productId: 'WMT-SPORTS-001',
        price: 34.99,
        originalPrice: 49.99,
        discountPercent: 30,
        link: 'https://walmart.com/ip/sports-cards-elite',
        inStock: true,
        isRestock: false,
        isLimitedEdition: true,
        isHypeItem: true,
        detectedAt: new Date(now.getTime() - 5 * 60000), // 5 min ago
        image: 'https://via.placeholder.com/300x300?text=Sports+Cards',
        description: 'Limited edition football card collection with exclusive cards',
        retailerLogo: 'https://via.placeholder.com/50x50?text=Walmart',
        stockLevel: 'medium',
        demandIndicator: 'high',
        reviewCount: 89,
        rating: 4.5,
      },

      // Target - Hype Item
      {
        id: 'mock-target-one-piece-1',
        name: 'One Piece Card Game Tournament Deck Set',
        retailer: 'target',
        category: 'one-piece-tcg',
        productId: 'TGT-OP-001',
        price: 44.99,
        originalPrice: 44.99,
        discountPercent: 0,
        link: 'https://target.com/p/one-piece-deck-set/-/A-12345',
        inStock: true,
        isRestock: false,
        isLimitedEdition: false,
        isHypeItem: true,
        detectedAt: new Date(now.getTime() - 8 * 60000), // 8 min ago
        image: 'https://via.placeholder.com/300x300?text=One+Piece+TCG',
        description: 'Official One Piece Card Game tournament legal deck set',
        retailerLogo: 'https://via.placeholder.com/50x50?text=Target',
        stockLevel: 'low',
        demandIndicator: 'very-high',
        reviewCount: 156,
        rating: 4.9,
      },

      // Best Buy - Price Drop
      {
        id: 'mock-bestbuy-gaming-1',
        name: 'PlayStation 5 Console - Marvel Spider-Man 2 Bundle',
        retailer: 'bestbuy',
        category: 'hype-items',
        productId: 'BB-PS5-001',
        price: 499.99,
        originalPrice: 599.99,
        discountPercent: 16.67,
        link: 'https://bestbuy.com/site/6428220',
        inStock: true,
        isRestock: false,
        isLimitedEdition: false,
        isHypeItem: true,
        detectedAt: new Date(now.getTime() - 3 * 60000), // 3 min ago
        image: 'https://via.placeholder.com/300x300?text=PS5+Bundle',
        description: 'PlayStation 5 with Marvel Spider-Man 2 game included',
        retailerLogo: 'https://via.placeholder.com/50x50?text=Best+Buy',
        stockLevel: 'low',
        demandIndicator: 'very-high',
        reviewCount: 512,
        rating: 4.7,
      },

      // GameStop - Limited Edition
      {
        id: 'mock-gamestop-collectible-1',
        name: 'Limited Edition Gaming Collectible Statue - Signed',
        retailer: 'gamestop',
        category: 'limited-exclusive',
        productId: 'GS-LIMIT-001',
        price: 89.99,
        originalPrice: 89.99,
        discountPercent: 0,
        link: 'https://gamestop.com/products/limited-statue',
        inStock: true,
        isRestock: false,
        isLimitedEdition: true,
        isHypeItem: true,
        detectedAt: new Date(now.getTime() - 10 * 60000), // 10 min ago
        image: 'https://via.placeholder.com/300x300?text=Collectible+Statue',
        description: 'Highly collectible statue - limited to 500 units worldwide',
        retailerLogo: 'https://via.placeholder.com/50x50?text=GameStop',
        stockLevel: 'very-low',
        demandIndicator: 'high',
        reviewCount: 78,
        rating: 5.0,
      },

      // Amazon - Non-Affiliate Item
      {
        id: 'mock-amazon-books-1',
        name: 'The Art of Pokémon Trading Card Game Book - Collector\'s Edition',
        retailer: 'amazon',
        category: 'pokemon-tcg',
        asin: 'B0D4K9M2L5',
        price: 39.99,
        originalPrice: 39.99,
        discountPercent: 0,
        link: 'https://amazon.com/dp/B0D4K9M2L5',
        inStock: true,
        isRestock: false,
        isLimitedEdition: true,
        isHypeItem: false,
        detectedAt: new Date(now.getTime() - 12 * 60000), // 12 min ago
        image: 'https://via.placeholder.com/300x300?text=TCG+Book',
        description: 'Official Pokémon TCG art book with behind-the-scenes content',
        retailerLogo: 'https://via.placeholder.com/50x50?text=Amazon',
        stockLevel: 'medium',
        demandIndicator: 'medium',
        reviewCount: 312,
        rating: 4.6,
      },

      // Out of stock item (should not appear in free tier immediate feed)
      {
        id: 'mock-target-outofstock-1',
        name: 'Nintendo Switch OLED - Out of Stock Monitor',
        retailer: 'target',
        category: 'hype-items',
        productId: 'TGT-SWITCH-001',
        price: 349.99,
        originalPrice: 349.99,
        discountPercent: 0,
        link: 'https://target.com/p/switch-oled/-/A-99999',
        inStock: false,
        isRestock: false,
        isLimitedEdition: false,
        isHypeItem: true,
        detectedAt: new Date(now.getTime() - 15 * 60000), // 15 min ago
        image: 'https://via.placeholder.com/300x300?text=Switch+OLED',
        description: 'Nintendo Switch OLED model - currently out of stock',
        retailerLogo: 'https://via.placeholder.com/50x50?text=Target',
        stockLevel: 'out-of-stock',
        demandIndicator: 'very-high',
        reviewCount: 689,
        rating: 4.9,
      },
    ];
  }

  /**
   * Generate mock user data
   */
  static generateMockUsers() {
    return [
      {
        id: 'user-free-1',
        username: 'free_user_demo',
        tier: 'free',
        email: 'free@demo.local',
        createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'user-paid-1',
        username: 'paid_user_demo',
        tier: 'paid',
        email: 'paid@demo.local',
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      },
      {
        id: 'user-yearly-1',
        username: 'yearly_user_demo',
        tier: 'yearly',
        email: 'yearly@demo.local',
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        manualItems: [
          {
            id: 'manual-item-1',
            retailer: 'amazon',
            url: 'https://amazon.com/s?k=pokemon+booster',
            name: 'Pokémon Booster - Custom Monitor',
            createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
          {
            id: 'manual-item-2',
            retailer: 'walmart',
            url: 'https://walmart.com/search/?query=rare+cards',
            name: 'Rare Cards - Custom Monitor',
            createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          },
        ],
      },
    ];
  }

  /**
   * Generate mock retailer config
   */
  static getRetailerConfig() {
    return {
      amazon: {
        name: 'Amazon',
        logo: 'https://via.placeholder.com/50x50?text=Amazon',
        color: '#FF9900',
      },
      walmart: {
        name: 'Walmart',
        logo: 'https://via.placeholder.com/50x50?text=Walmart',
        color: '#0071CE',
      },
      target: {
        name: 'Target',
        logo: 'https://via.placeholder.com/50x50?text=Target',
        color: '#CC0000',
      },
      bestbuy: {
        name: 'Best Buy',
        logo: 'https://via.placeholder.com/50x50?text=Best+Buy',
        color: '#FFCE00',
      },
      gamestop: {
        name: 'GameStop',
        logo: 'https://via.placeholder.com/50x50?text=GameStop',
        color: '#000000',
      },
      ebay: {
        name: 'eBay',
        logo: 'https://via.placeholder.com/50x50?text=eBay',
        color: '#E53238',
      },
    };
  }
}

module.exports = MockDataGenerator;
