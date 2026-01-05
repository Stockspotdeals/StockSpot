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

    // Gaming detection
    if (this.isGaming(text)) {
      return 'gaming';
    }

    // Electronics detection
    if (this.isElectronics(text)) {
      return 'electronics';
    }

    // General collectibles
    if (this.isCollectibles(text)) {
      return 'collectibles';
    }

    // Toys detection
    if (this.isToys(text)) {
      return 'toys';
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
      'unified minds',
      'unbroken bonds',
      'team up',
      'lost thunder',
      'celestial storm',
      'forbidden light',
      'ultra prism',
      'crimson invasion',
      'burning shadows',
      'guardians rising',
      'sun moon',
      'evolutions',
      'steam siege',
      'fates collide',
      'breakpoint',
      'breakthrough',
      'ancient origins',
      'roaring skies',
      'double crisis',
      'primal clash',
      'phantom forces',
      'furious fists',
      'flashfire',
      'xy base',
      'boundaries crossed',
      'dragons exalted',
      'dark explorers',
      'next destinies',
      'noble victories',
      'emerging powers',
      'black white',
      'call of legends',
      'triumphant',
      'undaunted',
      'unleashed',
      'heartgold soulsilver',
      'arceus',
      'supreme victors',
      'rising rivals',
      'platinum',
      'stormfront',
      'legends awakened',
      'majestic dawn',
      'great encounters',
      'secret wonders',
      'mysterious treasures',
      'power keepers',
      'dragon frontiers',
      'crystal guardians',
      'holon phantoms',
      'legend maker',
      'delta species',
      'unseen forces',
      'emerald',
      'deoxys',
      'fire red leaf green',
      'team rocket returns',
      'hidden legends',
      'skyridge',
      'aquapolis',
      'expedition'
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
      'sanji',
      'nami',
      'usopp',
      'chopper',
      'robin',
      'franky',
      'brook',
      'jinbe',
      'ace',
      'sabo',
      'whitebeard',
      'shanks',
      'kaido',
      'big mom',
      'blackbeard',
      'doflamingo',
      'crocodile',
      'enel',
      'akainu',
      'kizaru',
      'aokiji',
      'garp',
      'sengoku',
      'dragon',
      'law',
      'kid',
      'hancock',
      'mihawk',
      'buggy',
      'alvida',
      'arlong',
      'don krieg',
      'kuro',
      'smoker',
      'tashigi',
      'hina',
      'koby',
      'helmeppo'
    ];
    
    return onePieceKeywords.some(keyword => text.includes(keyword));
  }

  static isSportsCards(text) {
    const sportsKeywords = [
      'baseball cards',
      'football cards',
      'basketball cards',
      'soccer cards',
      'hockey cards',
      'topps',
      'panini',
      'upper deck',
      'leaf',
      'prizm',
      'select',
      'chrome',
      'refractor',
      'hobby box',
      'trading cards',
      'sports cards',
      'rookie card',
      'autograph',
      'jersey card',
      'patch card',
      'numbered card',
      'parallel',
      'insert',
      'base set',
      'flagship',
      'heritage',
      'allen ginter',
      'gypsy queen',
      'archives',
      'finest',
      'bowman',
      'donruss',
      'score',
      'certified',
      'absolute',
      'elite',
      'limited',
      'national treasures',
      'immaculate',
      'flawless',
      'noir',
      'origins',
      'contenders',
      'chronicles',
      'mosaic',
      'optic',
      'spectra',
      'revolution',
      'phoenix',
      'status',
      'clearly',
      'illusions',
      'nba hoops',
      'court kings',
      'threads',
      'timeless treasures'
    ];
    
    return sportsKeywords.some(keyword => text.includes(keyword));
  }

  static isGaming(text) {
    const gamingKeywords = [
      'gaming',
      'video game',
      'console',
      'xbox',
      'playstation',
      'nintendo',
      'steam deck',
      'gaming pc',
      'gpu',
      'graphics card',
      'gaming laptop',
      'controller',
      'gaming headset',
      'gaming mouse',
      'gaming keyboard',
      'ps5',
      'xbox series',
      'nintendo switch',
      'steam',
      'epic games',
      'battlenet'
    ];
    
    return gamingKeywords.some(keyword => text.includes(keyword));
  }

  static isElectronics(text) {
    const electronicsKeywords = [
      'iphone',
      'android',
      'samsung',
      'apple',
      'phone',
      'smartphone',
      'tablet',
      'ipad',
      'laptop',
      'computer',
      'headphones',
      'earbuds',
      'airpods',
      'smartwatch',
      'apple watch',
      'monitor',
      'tv',
      'speaker',
      'bluetooth',
      'wireless'
    ];
    
    return electronicsKeywords.some(keyword => text.includes(keyword));
  }

  static isCollectibles(text) {
    const collectiblesKeywords = [
      'collectible',
      'limited edition',
      'exclusive',
      'rare',
      'vintage',
      'figurine',
      'statue',
      'action figure',
      'funko pop',
      'hot toys',
      'sideshow',
      'first4figures',
      'kotobukiya',
      'good smile',
      'nendoroid',
      'figma',
      'scale figure'
    ];
    
    return collectiblesKeywords.some(keyword => text.includes(keyword));
  }

  static isToys(text) {
    const toysKeywords = [
      'toy',
      'lego',
      'playset',
      'doll',
      'stuffed animal',
      'plush',
      'kids toy',
      'children toy',
      'educational toy',
      'building blocks',
      'puzzle',
      'board game',
      'card game'
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