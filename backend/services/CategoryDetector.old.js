class CategoryDetector {
  static detectCategory(productName, url, description = '') {
    const text = `${productName} ${url} ${description}`.toLowerCase();
    
    // Pokemon TCG detection
    if (this.isPokemonTCG(text)) {
      return 'pokemon_tcg';
    }
    
    // One Piece TCG detection
    if (this.isOnePieceTCG(text)) {
      return 'one_piece_tcg';
    }
    
    // Sports Cards detection
    if (this.isSportsCards(text)) {
      return 'sports_cards';
    }
    
    return 'other';
  }

  static isPokemonTCG(text) {
    const pokemonKeywords = [
      'pokemon',
      'pokémon',
      'tcg',
      'trading card game',
      'booster pack',
      'booster box',
      'elite trainer box',
      'etb',
      'charizard',
      'pikachu',
      'pokemon card',
      'paldea evolved',
      'scarlet violet',
      'crown zenith',
      'silver tempest',
      'lost origin',
      'astral radiance',
      'brilliant stars',
      'fusion strike',
      'evolving skies',
      'chilling reign',
      'battle styles',
      'shining fates',
      'vivid voltage',
      'champions path',
      'darkness ablaze',
      'rebel clash',
      'sword shield',
      'cosmic eclipse',
      'hidden fates',
      'unified minds',
      'unbroken bonds',
      'team up',
      'lost thunder',
      'dragon majesty',
      'celestial storm',
      'forbidden light',
      'ultra prism',
      'crimson invasion',
      'burning shadows',
      'guardians rising',
      'sun moon'
    ];
    
    return pokemonKeywords.some(keyword => text.includes(keyword));
  }

  static isOnePieceTCG(text) {
    const onePieceKeywords = [
      'one piece',
      'onepiece',
      'op01',
      'op02',
      'op03',
      'op04',
      'op05',
      'romance dawn',
      'paramount war',
      'pillars of strength',
      'kingdoms of intrigue',
      'awakening of the new era',
      'luffy',
      'zoro',
      'nami',
      'sanji',
      'chopper',
      'robin',
      'franky',
      'brook',
      'jinbe',
      'ace',
      'shanks',
      'whitebeard',
      'kaido',
      'big mom',
      'crocodile',
      'doflamingo',
      'one piece card game',
      'one piece tcg',
      'bandai'
    ];
    
    return onePieceKeywords.some(keyword => text.includes(keyword));
  }

  static isSportsCards(text) {
    const sportsKeywords = [
      'baseball card',
      'basketball card',
      'football card',
      'hockey card',
      'soccer card',
      'topps',
      'panini',
      'upper deck',
      'bowman',
      'donruss',
      'fleer',
      'score',
      'leaf',
      'prizm',
      'mosaic',
      'chronicles',
      'select',
      'optic',
      'contenders',
      'rookie card',
      'autograph',
      'memorabilia',
      'game used',
      'patch card',
      'serial numbered',
      'refractor',
      'chrome',
      'heritage',
      'tribute',
      'diamond kings',
      'gypsy queen',
      'allen ginter',
      'stadium club',
      'finest',
      'bowman chrome',
      'topps chrome',
      'panini prizm',
      'panini mosaic',
      'panini select',
      'panini contenders',
      'upper deck mvp',
      'upper deck series',
      'o-pee-chee',
      'sp authentic',
      'sp game used',
      'artifacts',
      'black diamond',
      'ice',
      'synergy',
      'ultimate collection',
      'exquisite collection',
      'national treasures',
      'immaculate collection',
      'flawless',
      'noir',
      'gold standard',
      'totally certified',
      'preferred',
      'crown royale',
      'limited',
      'classics',
      'americana',
      'certified',
      'playoff',
      'playoff contenders',
      'absolute',
      'phoenix',
      'revolution',
      'origins',
      'cornerstones',
      'encased',
      'impeccable',
      'spectra',
      'majestic',
      'luminance',
      'one',
      'elements',
      'kaboom',
      'illusions',
      'nba hoops',
      'nba jam',
      'clearly authentic',
      'clearly donruss',
      'court kings',
      'status',
      'threads',
      'timeless treasures'
    ];
    
    return sportsKeywords.some(keyword => text.includes(keyword));
  }

  static getCategoryEmoji(category) {
    const emojiMap = {
      [CATEGORY_TYPES.POKEMON_TCG]: '⚡️',
      [CATEGORY_TYPES.ONE_PIECE_TCG]: '🏴‍☠️',
      [CATEGORY_TYPES.SPORTS_CARDS]: '🏈',
      [CATEGORY_TYPES.GENERAL]: '🛍️'
  // Add other category detection methods
  static isGaming(text) {
    const gamingKeywords = [
      'gaming', 'video game', 'console', 'xbox', 'playstation', 'nintendo', 
      'steam deck', 'gaming pc', 'gpu', 'graphics card', 'gaming laptop'
    ];
    return gamingKeywords.some(keyword => text.includes(keyword));
  }

  static isElectronics(text) {
    const electronicsKeywords = [
      'iphone', 'android', 'samsung', 'apple', 'phone', 'smartphone',
      'tablet', 'ipad', 'laptop', 'computer', 'headphones', 'earbuds'
    ];
    return electronicsKeywords.some(keyword => text.includes(keyword));
  }

  static isCollectibles(text) {
    const collectiblesKeywords = [
      'collectible', 'limited edition', 'exclusive', 'rare', 'vintage',
      'figurine', 'statue', 'action figure', 'funko pop'
    ];
    return collectiblesKeywords.some(keyword => text.includes(keyword));
  }

  static isToys(text) {
    const toysKeywords = [
      'toy', 'lego', 'playset', 'doll', 'stuffed animal', 'plush',
      'kids toy', 'children toy', 'educational toy'
    ];
    return toysKeywords.some(keyword => text.includes(keyword));
  }

  static getCategoryEmoji(category) {
    const emojiMap = {
      'pokemon_tcg': '⚡',
      'one_piece_tcg': '🏴‍☠️',
      'sports_cards': '🏈',
      'gaming': '🎮',
      'electronics': '📱',
      'collectibles': '🎯',
      'toys': '🧸',
      'other': '🛍️'
    };
    
    return emojiMap[category] || '🛍️';
  }

  static getCategoryHashtag(category) {
    const hashtagMap = {
      'pokemon_tcg': '#PokemonTCG',
      'one_piece_tcg': '#OnePieceTCG',
      'sports_cards': '#SportsCards',
      'gaming': '#Gaming',
      'electronics': '#Electronics',
      'collectibles': '#Collectibles',
      'toys': '#Toys',
      'other': '#Deals'
    };
    
    return hashtagMap[category] || '#Deals';
  }

  static getSupportedCategories() {
    return [
      'pokemon_tcg',
      'one_piece_tcg', 
      'sports_cards',
      'gaming',
      'electronics',
      'collectibles',
      'toys',
      'other'
    ];
  }

  // Expose category keywords for testing
  static get categoryKeywords() {
    return {
      pokemon_tcg: [
        'pokemon', 'pokémon', 'tcg', 'trading card game', 'booster pack',
        'booster box', 'elite trainer box', 'etb', 'charizard', 'pikachu',
        'pokemon card', 'paldea evolved', 'scarlet violet', 'crown zenith',
        'silver tempest', 'lost origin', 'astral radiance', 'brilliant stars'
      ],
      one_piece_tcg: [
        'one piece', 'onepiece', 'tcg', 'romance dawn', 'booster box',
        'starter deck', 'luffy', 'zoro', 'sanji', 'nami', 'chopper',
        'usopp', 'robin', 'franky', 'brook', 'jinbe', 'ace', 'sabo'
      ],
      sports_cards: [
        'baseball cards', 'football cards', 'basketball cards', 'soccer cards',
        'topps', 'panini', 'upper deck', 'prizm', 'select', 'chrome',
        'hobby box', 'trading cards', 'sports cards', 'rookie card'
      ]
    };
  }
}

module.exports = { CategoryDetector };