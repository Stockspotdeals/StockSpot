/**
 * Product Intelligence Engine — Campaign B
 *
 * Transforms discovered products into high-value intelligence profiles.
 * All logic is deterministic. No AI APIs. No paid services.
 *
 * Produces:
 *   - classification (granular product type)
 *   - collectible detection + confidence
 *   - MSRP estimation + confidence
 *   - release intelligence (window, month, quarter, year, status)
 *   - demand score (0–100)
 *   - scarcity score (0–100)
 *   - flip score (0–100)
 *   - overall confidence score (0–100)
 */

// ──────────────────────────────────────────────
// PART 1 — Granular Classification
// ──────────────────────────────────────────────

const CLASSIFICATION_KEYWORDS = {
  'Pokemon': [
    'pokemon', 'pokémon', 'pokemon tcg', 'pokemon card', 'pokemon center',
    'charizard', 'pikachu', 'mewtwo', 'lugia', 'rayquaza', 'giratina',
    'arceus', 'eevee', 'umbreon', 'espeon', 'gengar', 'gyarados',
    'booster pack', 'booster box', 'elite trainer box', 'etb',
    'pokemon go', 'pokemon scarlet', 'pokemon violet', 'paldea',
    'crown zenith', 'silver tempest', 'lost origin', 'astral radiance',
    'brilliant stars', 'evolving skies', 'fusion strike', 'chilling reign',
    'battle styles', 'shining fates', 'vivid voltage', 'champions path',
    'hidden fates', 'celebrations', '151', 'obsidian flames',
    'paradox rift', 'temporal forces', 'twilight masquerade',
    'shrouded fable', 'stellar crown', 'surging sparks'
  ],
  'One Piece': [
    'one piece', 'onepiece', 'one piece tcg', 'op01', 'op02', 'op03',
    'op04', 'op05', 'op06', 'op07', 'op08', 'op09',
    'romance dawn', 'paramount war', 'pillars of strength',
    'kingdoms of intrigue', 'awakening of the new era',
    'luffy', 'zoro', 'sanji', 'ace', 'sabo', 'shanks', 'kaido',
    'big mom', 'whitebeard', 'roger', 'law', 'kid', 'yamato'
  ],
  'Lorcana': [
    'lorcana', 'disney lorcana', 'the first chapter', 'rise of the floodborn',
    'into the inklands', 'ursula\'s return', 'shimmering skies',
    'azurite sea', 'inklands', 'floodborn', 'enchanted card',
    'disney trading card', 'illumineer'
  ],
  'Sports Cards': [
    'sports cards', 'baseball cards', 'football cards', 'basketball cards',
    'hockey cards', 'soccer cards', 'topps', 'panini', 'upper deck',
    'prizm', 'select', 'chrome', 'refractor', 'hobby box',
    'rookie card', 'bowman', 'donruss', 'score', 'mosaic', 'optic',
    'national treasures', 'immaculate', 'flawless', 'contenders',
    'sports trading cards', 'sports card', 'trading cards'
  ],
  'Figures': [
    'action figure', 'action figures', 'figurine', 'articulated figure',
    '6 inch figure', '7 inch figure', 'marvel legends', 'star wars black series',
    'gi joe classified', 'power rangers lightning', 'transformers',
    'masterpiece', 'studio series', 'mcfarlane', 'neca', 'hasbro',
    'bandai', 'tamashii nations', 'sh figuarts', 'figma', 'nendoroid',
    'kaiyodo', 'mafex', 'mezco', 'one:12', '1000toys'
  ],
  'Statues': [
    'statue', 'polystone', 'resin statue', 'premium statue',
    'sideshow collectibles', 'prime 1 studio', 'queen studios',
    'iron studios', 'xm studios', 'first 4 figures', 'kotobukiya',
    'fine art statue', 'maquette', 'bust', 'life size', 'prop replica',
    'hot toys', 'threezero', 'threea', 'blitzway', 'damtoys',
    'collectible statue', 'limited edition statue'
  ],
  'LEGO': [
    'lego', 'lego set', 'lego brick', 'lego building', 'lego creator',
    'lego technic', 'lego star wars', 'lego harry potter', 'lego marvel',
    'lego dc', 'lego disney', 'lego ikea', 'lego architecture',
    'lego ideas', 'lego speed champions', 'lego city', 'lego ninjago',
    'lego friends', 'lego duplo', 'lego botanicals', 'lego 18+',
    'building blocks', 'brick set', 'construction toy'
  ],
  'Gaming Hardware': [
    'gaming pc', 'gaming laptop', 'gaming desktop', 'gaming monitor',
    'graphics card', 'gpu', 'rtx', 'gtx', 'radeon', 'nvidia', 'amd',
    'gaming chair', 'gaming desk', 'gaming mouse', 'gaming keyboard',
    'gaming headset', 'gaming microphone', 'gaming webcam',
    'gaming router', 'gaming ssd', 'gaming ram', 'gaming cpu',
    'processor', 'motherboard', 'gaming case', 'power supply',
    'liquid cooling', 'gaming accessory', 'pc gaming'
  ],
  'Consoles': [
    'playstation 5', 'ps5', 'playstation 4', 'ps4', 'playstation 3', 'ps3',
    'xbox series x', 'xbox series s', 'xbox one', 'xbox 360',
    'nintendo switch', 'nintendo switch oled', 'nintendo switch lite',
    'nintendo 3ds', 'nintendo 2ds', 'nintendo ds', 'nintendo wii',
    'steam deck', 'steam deck oled', 'rog ally', 'lenovo legion go',
    'retro console', 'mini console', 'nes classic', 'snes classic',
    'sega genesis', 'playstation portal', 'console bundle',
    'limited edition console', 'special edition console'
  ],
  'Controllers': [
    'controller', 'gamepad', 'joystick', 'fight stick', 'arcade stick',
    'racing wheel', 'throttle', 'flight stick', 'pro controller',
    'dualsense', 'dualshock', 'xbox controller', 'switch controller',
    'gamecube controller', 'n64 controller', 'retro controller',
    'controller charger', 'controller stand', 'controller skin',
    'controller grip', 'controller case', 'controller accessory'
  ],
  'Accessories': [
    'carrying case', 'travel case', 'screen protector', 'charging dock',
    'charging station', 'power bank', 'cable', 'adapter', 'hub',
    'stand', 'mount', 'grip', 'skin', 'decals', 'thumb grip',
    'analog stick', 'replacement battery', 'cooling fan',
    'headphone stand', 'controller charger', 'game case', 'game holder',
    'wall mount', 'display stand', 'collectible case', 'protective case'
  ],
  'Collector Editions': [
    'collector edition', 'collector\'s edition', 'collectors edition',
    'special edition', 'deluxe edition', 'ultimate edition',
    'premium edition', 'limited edition', 'anniversary edition',
    'legendary edition', 'mythic edition', 'master chief collection',
    'game of the year edition', 'complete edition', 'definitive edition',
    'signature edition', 'exclusive edition', 'retro edition',
    'steelbook edition', 'collector box', 'collector set'
  ],
  'Steelbooks': [
    'steelbook', 'steel book', 'metal case', 'metalpak', 'ironpack',
    'metal game case', 'limited edition steelbook', 'steelbook case',
    'steelbook edition', 'steelbook blu-ray', 'steelbook 4k',
    'steelbook game', 'steelbook collection', 'steelbook set'
  ],
  'Limited Editions': [
    'limited edition', 'limited run', 'limited quantity', 'limited stock',
    'limited release', 'limited print', 'limited production',
    'numbered edition', 'signed edition', 'artist proof',
    'first edition', 'first print', 'variant cover', 'exclusive variant',
    'limited to', 'only', 'rare edition', 'ultra rare', 'secret rare'
  ],
  'Board Games': [
    'board game', 'boardgame', 'tabletop game', 'tabletop',
    'card game', 'strategy game', 'party game', 'family game',
    'cooperative game', 'competitive game', 'deck building',
    'miniature game', 'war game', 'rpg', 'role playing game',
    'dungeons & dragons', 'd&d', 'pathfinder', 'magic the gathering',
    'mtg', 'yu-gi-oh', 'yugioh', 'digimon tcg', 'dragon ball tcg',
    'final fantasy tcg', 'star wars tcg', 'game mat', 'playmat',
    'dice set', 'dice tray', 'card sleeves', 'deck box', 'token set'
  ],
  'Toys': [
    'plush', 'plushie', 'stuffed animal', 'stuffed toy', 'soft toy',
    'doll', 'dollhouse', 'playset', 'play set', 'play house',
    'toy car', 'toy truck', 'toy train', 'hot wheels', 'matchbox',
    'diecast', 'model car', 'model kit', 'gundam', 'gunpla',
    'model building', 'scale model', 'rc car', 'remote control',
    'drone', 'quadcopter', 'kite', 'yo-yo', 'fidget', 'spinner',
    'slime', 'putty', 'play-doh', 'kinetic sand', 'water toy',
    'outdoor toy', 'ride on', 'tricycle', 'bicycle', 'scooter',
    'skateboard', 'educational toy', 'stem toy', 'science kit',
    'craft kit', 'art set', 'puzzle', 'jigsaw puzzle', 'rubik\'s cube'
  ],
  'Electronics': [
    'smartphone', 'iphone', 'samsung galaxy', 'google pixel',
    'tablet', 'ipad', 'kindle', 'ereader', 'laptop', 'macbook',
    'chromebook', 'monitor', 'display', 'tv', 'television', 'oled tv',
    'soundbar', 'speaker', 'bluetooth speaker', 'headphone',
    'earbuds', 'airpods', 'smartwatch', 'apple watch', 'fitbit',
    'camera', 'dslr', 'mirrorless', 'action camera', 'gopro',
    'drone', 'smart home', 'alexa', 'google home', 'ring doorbell',
    'security camera', 'router', 'modem', 'wifi', 'mesh network',
    'external hard drive', 'ssd', 'flash drive', 'memory card',
    'usb hub', 'charging station', 'power strip', 'surge protector',
    'printer', 'scanner', 'projector', 'vr headset', 'virtual reality',
    'meta quest', 'playstation vr', 'apple vision'
  ]
};

const CLASSIFICATION_ORDER = [
  'Pokemon', 'One Piece', 'Lorcana', 'Sports Cards',
  'Figures', 'Statues', 'LEGO',
  'Gaming Hardware', 'Consoles', 'Controllers', 'Accessories',
  'Collector Editions', 'Steelbooks', 'Limited Editions',
  'Board Games', 'Toys', 'Electronics'
];

// ──────────────────────────────────────────────
// PART 2 — Collectible Keywords
// ──────────────────────────────────────────────

const COLLECTIBLE_HIGH = [
  'collector edition', 'collector\'s edition', 'collectors edition',
  'limited edition', 'ultra premium', 'premium collection',
  'elite trainer box', 'booster box', 'display box',
  'steelbook', 'steel book', 'metalpak',
  'amiibo', 'funko pop', 'funko', 'pop vinyl',
  'hot toys', 'sideshow', 'prime 1', 'xm studios',
  'nendoroid', 'figma', 'sh figuarts',
  'first 4 figures', 'kotobukiya', 'statue',
  'signed', 'autograph', 'numbered', 'serialized',
  '1/1', 'one of one', 'one-of-one', 'unique',
  'chase card', 'chase figure', 'chase variant',
  'secret rare', 'ultra rare', 'hyper rare', 'alternate art',
  'full art', 'rainbow rare', 'gold rare', 'shiny',
  'graded', 'psa 10', 'psa 9', 'bgs 9.5', 'cgc',
  'sealed', 'factory sealed', 'shrink wrap',
  'first edition', '1st edition', 'shadowless',
  'booster pack', 'blister pack', 'booster box',
  'etb', 'upc', 'premium box', 'collection box',
  'tin', 'pokeball tin', 'great ball tin',
  'mini portfolio', 'portfolio binder', 'playmat',
  'deck box', 'card sleeves', 'energy cards',
  'damage counters', 'gx box', 'v box', 'vmax box',
  'vstar box', 'ex box', 'trainer box',
  'gift collection', 'mega collection', 'super premium',
  'collector chest', 'collector tin', 'collector set',
  'limited print', 'limited run', 'limited quantity',
  'exclusive', 'retailer exclusive', 'convention exclusive',
  'sdcc exclusive', 'nycc exclusive', 'wondercon exclusive',
  'vaulted', 'retired', 'discontinued', 'rare', 'vintage',
  'retro', 'classic', 'original', 'prototype',
  'sample', 'proof', 'display piece', 'showcase'
];

const COLLECTIBLE_MEDIUM = [
  'collectible', 'collectable', 'trading card', 'tcg',
  'action figure', 'figurine', 'model kit', 'gundam', 'gunpla',
  'scale figure', 'pvc figure', 'resin figure',
  'polystone', 'maquette', 'bust', 'prop replica',
  'replica', 'life size', 'life-size',
  'special edition', 'deluxe edition', 'ultimate edition',
  'anniversary edition', 'legendary edition',
  'variant', 'alternate', 'alternate cover',
  'foil', 'holo', 'holofoil', 'etched', 'textured',
  'promo', 'promotional', 'pre-release', 'prerelease',
  'staff', 'employee', 'sample', 'display',
  'prototype', 'test print', 'proof', 'artist proof',
  'sketch', 'original art', 'commission',
  'complete set', 'master set', 'full set',
  'sealed product', 'sealed box', 'sealed case',
  'display box', 'counter display', 'floor display',
  'booster case', 'booster display', 'booster pack',
  'sleeve', 'toploader', 'one touch', 'magnetic case',
  'screwdown', 'card saver', 'semi-rigid',
  'grading', 'slab', 'encased', 'encapsulated',
  'certified', 'authenticated', 'authentic',
  'mint', 'near mint', 'gem mint', 'pristine',
  'pack fresh', 'box fresh', 'unopened', 'unsealed',
  'new', 'sealed', 'factory', 'original packaging',
  'collector', 'collection', 'collecting',
  'display', 'showcase', 'cabinet', 'shelf',
  'limited', 'exclusive', 'rare', 'hard to find',
  'htf', 'oos', 'sold out', 'out of stock',
  'backorder', 'preorder', 'pre-order', 'pre order',
  'coming soon', 'reserve', 'waitlist', 'notify me'
];

const COLLECTIBLE_LOW = [
  'popular', 'trending', 'hot', 'demand', 'high demand',
  'sought after', 'coveted', 'desirable', 'wanted',
  'nostalgia', 'nostalgic', 'retro', 'classic',
  'iconic', 'legendary', 'famous', 'beloved',
  'fan favorite', 'cult classic', 'underground',
  'hard to get', 'hard to find', 'scarce', 'elusive',
  'premium', 'high quality', 'quality', 'detailed',
  'articulated', 'poseable', 'movable', 'interactive',
  'light up', 'sound', 'electronic', 'battery',
  'collector grade', 'display grade', 'mint condition',
  'excellent condition', 'good condition', 'used',
  'open box', 'like new', 'refurbished', 'renewed'
];

// ──────────────────────────────────────────────
// PART 3 — MSRP Estimation Patterns
// ──────────────────────────────────────────────

const MSRP_PATTERNS = {
  // TCG Products
  'booster pack': { min: 3.99, max: 5.99, confidence: 80 },
  'booster box': { min: 89.99, max: 169.99, confidence: 75 },
  'elite trainer box': { min: 39.99, max: 59.99, confidence: 85 },
  'etb': { min: 39.99, max: 59.99, confidence: 85 },
  'premium collection': { min: 49.99, max: 99.99, confidence: 70 },
  'ultra premium collection': { min: 99.99, max: 199.99, confidence: 75 },
  'upc': { min: 99.99, max: 199.99, confidence: 75 },
  'collection box': { min: 19.99, max: 39.99, confidence: 70 },
  'tin': { min: 12.99, max: 24.99, confidence: 75 },
  'blister pack': { min: 4.99, max: 12.99, confidence: 70 },
  'booster pack': { min: 3.99, max: 5.99, confidence: 80 },
  'build and battle': { min: 19.99, max: 29.99, confidence: 75 },
  'trainer toolkit': { min: 29.99, max: 39.99, confidence: 80 },
  'theme deck': { min: 11.99, max: 14.99, confidence: 80 },
  'starter deck': { min: 11.99, max: 14.99, confidence: 80 },
  'structure deck': { min: 11.99, max: 14.99, confidence: 80 },
  'playmat': { min: 14.99, max: 29.99, confidence: 70 },
  'deck box': { min: 4.99, max: 14.99, confidence: 75 },
  'card sleeves': { min: 3.99, max: 9.99, confidence: 75 },
  'portfolio binder': { min: 9.99, max: 24.99, confidence: 70 },

  // Gaming
  'nintendo switch game': { min: 39.99, max: 69.99, confidence: 85 },
  'ps5 game': { min: 49.99, max: 79.99, confidence: 85 },
  'xbox series x game': { min: 49.99, max: 79.99, confidence: 85 },
  'pc game': { min: 29.99, max: 69.99, confidence: 80 },
  'collector edition game': { min: 99.99, max: 299.99, confidence: 75 },
  'steelbook': { min: 9.99, max: 19.99, confidence: 70 },
  'controller': { min: 39.99, max: 79.99, confidence: 85 },
  'pro controller': { min: 59.99, max: 79.99, confidence: 85 },
  'console': { min: 299.99, max: 699.99, confidence: 80 },
  'limited edition console': { min: 399.99, max: 599.99, confidence: 75 },

  // Figures & Collectibles
  'action figure': { min: 19.99, max: 29.99, confidence: 75 },
  '6 inch figure': { min: 19.99, max: 24.99, confidence: 80 },
  '7 inch figure': { min: 22.99, max: 29.99, confidence: 80 },
  'marvel legends': { min: 22.99, max: 27.99, confidence: 85 },
  'star wars black series': { min: 22.99, max: 27.99, confidence: 85 },
  'funko pop': { min: 9.99, max: 14.99, confidence: 85 },
  'nendoroid': { min: 39.99, max: 69.99, confidence: 80 },
  'figma': { min: 49.99, max: 89.99, confidence: 80 },
  'sh figuarts': { min: 34.99, max: 79.99, confidence: 75 },
  'statue': { min: 99.99, max: 999.99, confidence: 60 },
  'hot toys': { min: 199.99, max: 499.99, confidence: 75 },
  'sideshow': { min: 399.99, max: 1499.99, confidence: 70 },

  // LEGO
  'lego set': { min: 9.99, max: 499.99, confidence: 70 },
  'lego technic': { min: 19.99, max: 449.99, confidence: 70 },
  'lego star wars': { min: 14.99, max: 699.99, confidence: 70 },
  'lego 18+': { min: 49.99, max: 499.99, confidence: 70 },

  // Electronics
  'graphics card': { min: 199.99, max: 1999.99, confidence: 70 },
  'gaming headset': { min: 29.99, max: 199.99, confidence: 75 },
  'gaming mouse': { min: 19.99, max: 149.99, confidence: 80 },
  'gaming keyboard': { min: 29.99, max: 199.99, confidence: 80 },
  'gaming monitor': { min: 149.99, max: 999.99, confidence: 75 },
  'gaming chair': { min: 149.99, max: 499.99, confidence: 75 },

  // Board Games
  'board game': { min: 19.99, max: 69.99, confidence: 75 },
  'card game': { min: 9.99, max: 39.99, confidence: 75 },
  'mtg booster box': { min: 89.99, max: 149.99, confidence: 80 },
  'mtg booster pack': { min: 3.99, max: 5.99, confidence: 80 },
  'yu-gi-oh booster box': { min: 59.99, max: 89.99, confidence: 75 },
  'd&d': { min: 29.99, max: 59.99, confidence: 80 }
};

// ──────────────────────────────────────────────
// PART 4 — Release Intelligence Patterns
// ──────────────────────────────────────────────

const RELEASE_KEYWORDS = {
  preorder: [
    'preorder', 'pre-order', 'pre order', 'reserve now', 'reserve yours',
    'available for preorder', 'available for pre-order', 'preorder now',
    'pre-order now', 'pre order now', 'preorder today', 'pre-order today',
    'reserve your copy', 'reserve your', 'claim yours', 'secure yours',
    'pre-purchase', 'prepurchase', 'pre purchase', 'pre-sale', 'presale',
    'pre sale', 'early bird', 'early access', 'first access'
  ],
  launch: [
    'launch', 'launches', 'launching', 'launch day', 'launch date',
    'launch edition', 'launch window', 'launching soon',
    'release', 'releases', 'releasing', 'release day', 'release date',
    'release window', 'releasing on', 'releases on', 'release today',
    'available now', 'available today', 'just released', 'new release',
    'newly released', 'out now', 'now available', 'in stores now',
    'available at', 'available from', 'available starting'
  ],
  alreadyReleased: [
    'in stock', 'in-stock', 'add to cart', 'buy now', 'buy it now',
    'add to bag', 'add to basket', 'purchase', 'order now',
    'ships now', 'ships today', 'ships immediately', 'ships within',
    'delivery', 'delivery date', 'get it by', 'arrives',
    'available for pickup', 'store pickup', 'same day delivery',
    'free shipping', 'prime shipping', 'expedited shipping'
  ]
};

// ──────────────────────────────────────────────
// PART 5 — Demand Score Factors
// ──────────────────────────────────────────────

const DEMAND_HIGH_KEYWORDS = [
  'sold out', 'sold-out', 'out of stock', 'oos', 'temporarily out',
  'backorder', 'back order', 'back-ordered', 'waitlist', 'waiting list',
  'notify me', 'notify me when available', 'email when available',
  'limit 1', 'limit 2', 'limit 3', 'limit per customer',
  'high demand', 'highly anticipated', 'most anticipated',
  'most wanted', 'most popular', 'trending', 'viral',
  'charizard', 'pikachu', 'umbreon', 'lugia', 'rayquaza',
  'luffy', 'zoro', 'ace', 'shanks', 'kaido',
  'ps5', 'playstation 5', 'xbox series x', 'nintendo switch oled',
  'steam deck', 'rtx', 'graphics card', 'gpu',
  'limited edition', 'collector edition', 'special edition',
  'exclusive', 'retailer exclusive', 'convention exclusive',
  'premium', 'ultra premium', 'super premium',
  'booster box', 'elite trainer box', 'etb', 'upc',
  'hidden fates', 'evolving skies', 'crown zenith',
  '151', 'paldea evolved', 'obsidian flames',
  'graded', 'psa 10', 'psa 9', 'bgs 9.5', 'slab',
  'sealed', 'factory sealed', 'unopened',
  'first edition', '1st edition', 'shadowless',
  'chase', 'rare', 'ultra rare', 'secret rare', 'alternate art',
  'full art', 'rainbow', 'gold', 'shiny', 'holo',
  'funko pop', 'hot toys', 'sideshow', 'statue',
  'nendoroid', 'figma', 'sh figuarts', 'amiibo',
  'steelbook', 'steel book', 'metalpak',
  'anniversary', 'anniversary edition', 'retro', 'vintage',
  'nostalgia', 'nostalgic', 'classic', 'iconic',
  'complete set', 'master set', 'full set',
  'bundle', 'bundle deal', 'value pack', 'variety pack',
  'restock', 'restocked', 'back in stock', 're-stock',
  'new', 'new release', 'newly released', 'just released',
  'preorder', 'pre-order', 'pre order', 'coming soon',
  'reserve', 'reserve now', 'reserve yours',
  'launch', 'launches', 'launching', 'release', 'releases',
  'rare', 'hard to find', 'htf', 'scarce', 'elusive',
  'coveted', 'sought after', 'desirable', 'wanted',
  'popular', 'trending', 'hot', 'hot item', 'hot product',
  'must have', 'must-have', 'essential', 'top rated',
  'best seller', 'bestseller', 'best-selling', 'popular item',
  'award winning', 'award-winning', 'critically acclaimed',
  'highly rated', 'top rated', 'customer favorite',
  'collector', 'collectible', 'collectable', 'collection',
  'display', 'showcase', 'cabinet', 'shelf',
  'gift', 'gift idea', 'gift guide', 'perfect gift',
  'holiday', 'christmas', 'birthday', 'valentine',
  'black friday', 'cyber monday', 'prime day', 'deal',
  'discount', 'sale', 'clearance', 'markdown', 'reduced',
  'price drop', 'price cut', 'lower price', 'low price',
  'free shipping', 'free delivery', 'free pickup'
];

const DEMAND_MEDIUM_KEYWORDS = [
  'queue', 'queuing', 'line', 'virtual line', 'virtual queue',
  'wait', 'waiting', 'wait time', 'estimated wait',
  'high traffic', 'high volume', 'heavy traffic',
  'popular', 'trending', 'hot', 'hot item',
  'backordered', 'back ordered', 'on backorder',
  'premium', 'high quality', 'quality', 'detailed',
  'authentic', 'genuine', 'official', 'licensed',
  'nintendo', 'playstation', 'xbox', 'sega', 'bandai',
  'pokemon', 'pokémon', 'one piece', 'disney', 'marvel',
  'dc', 'star wars', 'harry potter', 'lord of the rings',
  'lego', 'funko', 'hasbro', 'mattel', 'bandai',
  'square enix', 'capcom', 'konami', 'sega', 'nintendo',
  'sony', 'microsoft', 'valve', 'steam', 'epic',
  'limited', 'limited quantity', 'limited stock',
  'while supplies last', 'while stock lasts',
  'exclusive', 'exclusively at', 'only at',
  'special', 'special edition', 'special offer',
  'bonus', 'bonus item', 'bonus content', 'bonus feature',
  'extra', 'extra item', 'extra content',
  'free', 'free gift', 'free item', 'free bonus',
  'collector', 'collectible', 'collectable',
  'display', 'showcase', 'cabinet', 'shelf',
  'gift', 'gift idea', 'gift guide', 'perfect gift',
  'holiday', 'christmas', 'birthday', 'valentine',
  'anniversary', 'celebration', 'special occasion',
  'new', 'new release', 'newly released', 'just released',
  'latest', 'newest', 'fresh', 'brand new',
  'upgrade', 'upgraded', 'improved', 'enhanced',
  'next gen', 'next-generation', 'nextgen',
  'gen', 'generation', 'series', 'line',
  'edition', 'version', 'model', 'variant',
  'color', 'colorway', 'paint', 'finish',
  'size', 'scale', 'dimension', 'measurement',
  'weight', 'material', 'construction', 'build',
  'feature', 'featured', 'highlight', 'key feature',
  'benefit', 'advantage', 'plus', 'pro',
  'best', 'top', 'greatest', 'finest',
  'amazing', 'incredible', 'unbelievable', 'awesome',
  'perfect', 'ideal', 'excellent', 'superb',
  'outstanding', 'exceptional', 'remarkable', 'notable'
];

const DEMAND_LOW_KEYWORDS = [
  'available', 'in stock', 'in-stock', 'add to cart',
  'buy now', 'purchase', 'order', 'shop',
  'regular', 'standard', 'normal', 'basic',
  'common', 'uncommon', 'typical', 'average',
  'everyday', 'daily', 'regular use', 'standard use',
  'general', 'generic', 'universal', 'all purpose',
  'simple', 'easy', 'convenient', 'practical',
  'functional', 'utilitarian', 'pragmatic', 'sensible',
  'reliable', 'dependable', 'trustworthy', 'consistent',
  'durable', 'sturdy', 'robust', 'tough',
  'lightweight', 'portable', 'compact', 'slim',
  'ergonomic', 'comfortable', 'adjustable', 'flexible',
  'versatile', 'multi-purpose', 'multi-use', 'adaptable',
  'compatible', 'universal', 'works with', 'for use with',
  'replacement', 'spare', 'extra', 'backup',
  'accessory', 'add-on', 'attachment', 'component',
  'part', 'piece', 'kit', 'set',
  'pack', 'multi-pack', 'value pack', 'economy pack',
  'bundle', 'combo', 'combination', 'variety',
  'assorted', 'mixed', 'random', 'surprise',
  'mystery', 'blind', 'random', 'chance',
  'lot', 'bulk', 'wholesale', 'case',
  'clearance', 'sale', 'discount', 'markdown',
  'reduced', 'lowered', 'decreased', 'cut',
  'save', 'savings', 'deal', 'offer',
  'coupon', 'promo', 'promotion', 'special offer',
  'free shipping', 'free delivery', 'free pickup',
  'warranty', 'guarantee', 'return', 'exchange',
  'refund', 'policy', 'protection', 'coverage',
  'support', 'service', 'assistance', 'help',
  'guide', 'manual', 'instruction', 'directions',
  'setup', 'installation', 'assembly', 'configuration'
];

// ──────────────────────────────────────────────
// PART 6 — Scarcity Score Factors
// ──────────────────────────────────────────────

const SCARCITY_HIGH = [
  'sold out', 'sold-out', 'out of stock', 'temporarily out of stock',
  'limit 1', 'limit 2', 'limit per customer', 'limit per household',
  'limited edition', 'limited quantity', 'limited stock',
  'limited release', 'limited production', 'limited run',
  'numbered edition', 'serialized', 'individually numbered',
  '1/1', 'one of one', 'one-of-one', 'unique',
  'exclusive', 'retailer exclusive', 'store exclusive',
  'convention exclusive', 'sdcc exclusive', 'nycc exclusive',
  'while supplies last', 'while stock lasts',
  'only', 'only', 'remaining', 'last chance',
  'discontinued', 'retired', 'vaulted', 'no longer available',
  'rare', 'ultra rare', 'secret rare', 'hyper rare',
  'chase', 'chase card', 'chase figure', 'chase variant',
  'graded', 'psa', 'bgs', 'cgc', 'slab', 'encapsulated',
  'first edition', '1st edition', 'shadowless',
  'prototype', 'sample', 'proof', 'artist proof',
  'signed', 'autograph', 'autographed', 'hand signed',
  'preorder', 'pre-order', 'pre order', 'reserve now',
  'backorder', 'back order', 'back-ordered', 'waitlist',
  'notify me', 'notify me when available', 'email when available',
  'high demand', 'highly sought', 'most wanted',
  'vintage', 'retro', 'classic', 'original',
  'sealed', 'factory sealed', 'unopened', 'mint',
  'complete set', 'master set', 'full set',
  'booster box', 'elite trainer box', 'etb', 'upc',
  'hidden fates', 'evolving skies', 'crown zenith',
  '151', 'celebrations', 'shining fates',
  'hot toys', 'sideshow', 'prime 1', 'xm studios',
  'first 4 figures', 'kotobukiya', 'statue',
  'nendoroid', 'figma', 'sh figuarts', 'amiibo',
  'funko pop', 'funko', 'pop vinyl',
  'steelbook', 'steel book', 'metalpak',
  'collector edition', 'collector\'s edition', 'collectors edition',
  'special edition', 'deluxe edition', 'ultimate edition',
  'anniversary edition', 'legendary edition',
  'premium', 'ultra premium', 'super premium',
  'premium collection', 'ultra premium collection',
  'gift collection', 'mega collection', 'super collection',
  'collector chest', 'collector tin', 'collector set',
  'collector box', 'premium box', 'deluxe box',
  'tin', 'pokeball tin', 'great ball tin', 'ultra ball tin',
  'blister pack', 'blister', 'hanger', 'hanger box',
  'display box', 'counter display', 'floor display',
  'booster case', 'booster display', 'booster pack',
  'sleeve', 'toploader', 'one touch', 'magnetic case',
  'screwdown', 'card saver', 'semi-rigid',
  'grading', 'slab', 'encased', 'encapsulated',
  'certified', 'authenticated', 'authentic',
  'mint', 'near mint', 'gem mint', 'pristine',
  'pack fresh', 'box fresh', 'unopened', 'unsealed',
  'new', 'sealed', 'factory', 'original packaging'
];

const SCARCITY_MEDIUM = [
  'limited', 'limited availability', 'limited quantities',
  'while they last', 'while supplies last',
  'exclusive', 'exclusively', 'exclusive offer',
  'special', 'special edition', 'special offer',
  'collector', 'collectible', 'collectable',
  'rare', 'hard to find', 'htf', 'hard to get',
  'scarce', 'elusive', 'coveted', 'sought after',
  'popular', 'trending', 'hot', 'hot item',
  'backordered', 'back ordered', 'on backorder',
  'preorder', 'pre-order', 'pre order', 'coming soon',
  'reserve', 'reserve now', 'reserve yours',
  'waitlist', 'waiting list', 'notify me',
  'sold out', 'out of stock', 'oos',
  'temporarily', 'temporarily unavailable',
  'currently unavailable', 'currently out of stock',
  'restock', 'restocked', 'back in stock', 're-stock',
  'new', 'new release', 'newly released', 'just released',
  'launch', 'launches', 'launching', 'release', 'releases',
  'premium', 'high quality', 'quality', 'detailed',
  'authentic', 'genuine', 'official', 'licensed',
  'nintendo', 'playstation', 'xbox', 'sega', 'bandai',
  'pokemon', 'pokémon', 'one piece', 'disney', 'marvel',
  'dc', 'star wars', 'harry potter', 'lord of the rings',
  'lego', 'funko', 'hasbro', 'mattel', 'bandai',
  'square enix', 'capcom', 'konami', 'sega', 'nintendo',
  'sony', 'microsoft', 'valve', 'steam', 'epic',
  'anniversary', 'celebration', 'special occasion',
  'holiday', 'christmas', 'birthday', 'valentine',
  'black friday', 'cyber monday', 'prime day',
  'exclusive', 'exclusively at', 'only at',
  'retailer exclusive', 'store exclusive',
  'convention exclusive', 'sdcc exclusive', 'nycc exclusive',
  'wondercon exclusive', 'e3 exclusive', 'gamescom exclusive',
  'target exclusive', 'walmart exclusive', 'amazon exclusive',
  'best buy exclusive', 'gamestop exclusive',
  'limited edition', 'limited quantity', 'limited stock',
  'limited release', 'limited production', 'limited run',
  'numbered', 'serialized', 'individually numbered',
  'signed', 'autograph', 'autographed', 'hand signed',
  'graded', 'psa', 'bgs', 'cgc', 'slab', 'encapsulated',
  'first edition', '1st edition', 'shadowless',
  'vintage', 'retro', 'classic', 'original',
  'sealed', 'factory sealed', 'unopened', 'mint',
  'complete set', 'master set', 'full set',
  'display', 'showcase', 'cabinet', 'shelf',
  'gift', 'gift idea', 'gift guide', 'perfect gift'
];

const SCARCITY_LOW = [
  'in stock', 'in-stock', 'available', 'add to cart',
  'buy now', 'purchase', 'order', 'shop',
  'regular', 'standard', 'normal', 'basic',
  'common', 'uncommon', 'typical', 'average',
  'everyday', 'daily', 'regular use', 'standard use',
  'general', 'generic', 'universal', 'all purpose',
  'simple', 'easy', 'convenient', 'practical',
  'functional', 'utilitarian', 'pragmatic', 'sensible',
  'reliable', 'dependable', 'trustworthy', 'consistent',
  'durable', 'sturdy', 'robust', 'tough',
  'lightweight', 'portable', 'compact', 'slim',
  'ergonomic', 'comfortable', 'adjustable', 'flexible',
  'versatile', 'multi-purpose', 'multi-use', 'adaptable',
  'compatible', 'universal', 'works with', 'for use with',
  'replacement', 'spare', 'extra', 'backup',
  'accessory', 'add-on', 'attachment', 'component',
  'part', 'piece', 'kit', 'set',
  'pack', 'multi-pack', 'value pack', 'economy pack',
  'bundle', 'combo', 'combination', 'variety',
  'assorted', 'mixed', 'random', 'surprise',
  'mystery', 'blind', 'random', 'chance',
  'lot', 'bulk', 'wholesale', 'case',
  'clearance', 'sale', 'discount', 'markdown',
  'reduced', 'lowered', 'decreased', 'cut',
  'save', 'savings', 'deal', 'offer',
  'coupon', 'promo', 'promotion', 'special offer',
  'free shipping', 'free delivery', 'free pickup',
  'warranty', 'guarantee', 'return', 'exchange',
  'refund', 'policy', 'protection', 'coverage',
  'support', 'service', 'assistance', 'help',
  'guide', 'manual', 'instruction', 'directions',
  'setup', 'installation', 'assembly', 'configuration'
];

// ──────────────────────────────────────────────
// Product Intelligence Engine
// ──────────────────────────────────────────────

class ProductIntelligence {
  /**
   * Generate a full intelligence profile for a product.
   *
   * @param {Object} product - Product data with at minimum: title, url, retailer, category, price
   * @param {string} [pageText] - Optional full page text for richer analysis
   * @returns {Object} intelligence profile
   */
  static analyze(product, pageText = '') {
    const title = (product.title || product.name || '').toLowerCase();
    const url = (product.url || '').toLowerCase();
    const description = (product.description || '').toLowerCase();
    const retailer = (product.retailer || '').toLowerCase();
    const category = (product.category || '').toLowerCase();
    const combined = `${title} ${url} ${description} ${pageText}`.toLowerCase();

    const classification = this.classify(combined, category);
    const collectible = this.detectCollectible(combined);
    const msrp = this.estimateMSRP(combined, product.price);
    const release = this.analyzeRelease(combined);
    const demand = this.calculateDemandScore(combined);
    const scarcity = this.calculateScarcityScore(combined);
    const flip = this.calculateFlipScore(demand, scarcity, collectible, msrp, release);
    const confidence = this.calculateConfidence(classification, msrp, release, demand, scarcity, collectible);

    return {
      classification: classification.name,
      classificationConfidence: classification.confidence,

      isCollectible: collectible.isCollectible,
      collectibleConfidence: collectible.confidence,

      estimatedMSRP: msrp.estimatedMSRP,
      msrpConfidence: msrp.confidence,

      releaseWindow: release.window,
      releaseMonth: release.month,
      releaseQuarter: release.quarter,
      releaseYear: release.year,
      preorderStatus: release.preorderStatus,
      launchStatus: release.launchStatus,
      alreadyReleased: release.alreadyReleased,

      demandScore: demand,
      scarcityScore: scarcity,
      flipScore: flip,
      confidenceScore: confidence
    };
  }

  // ──────────────────────────────────────────
  // PART 1 — Classification
  // ──────────────────────────────────────────

  static classify(text, existingCategory) {
    // Map existing category to granular classification
    const categoryMap = {
      'pokemon_tcg': 'Pokemon',
      'one_piece_tcg': 'One Piece',
      'sports_cards': 'Sports Cards',
      'gaming': 'Gaming Hardware',
      'electronics': 'Electronics',
      'collectibles': 'Figures',
      'toys': 'Toys'
    };

    // Try keyword-based classification first
    let bestMatch = null;
    let bestScore = 0;

    for (const className of CLASSIFICATION_ORDER) {
      const keywords = CLASSIFICATION_KEYWORDS[className];
      if (!keywords) continue;

      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          // Weight by keyword length — longer keywords are more specific
          score += Math.min(keyword.length / 3, 10);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = className;
      }
    }

    // Fallback to existing category mapping
    if (!bestMatch || bestScore < 1) {
      if (existingCategory && categoryMap[existingCategory]) {
        return {
          name: categoryMap[existingCategory],
          confidence: 40
        };
      }
      return {
        name: 'Unknown',
        confidence: 10
      };
    }

    // Calculate confidence based on score
    const confidence = Math.min(Math.round((bestScore / 20) * 100), 95);

    return {
      name: bestMatch,
      confidence
    };
  }

  // ──────────────────────────────────────────
  // PART 2 — Collectible Detection
  // ──────────────────────────────────────────

  static detectCollectible(text) {
    let score = 0;

    // High signals (+20 each, max +60)
    for (const keyword of COLLECTIBLE_HIGH) {
      if (text.includes(keyword)) {
        score += 20;
        if (score >= 60) break;
      }
    }

    // Medium signals (+10 each, max +30)
    if (score < 60) {
      for (const keyword of COLLECTIBLE_MEDIUM) {
        if (text.includes(keyword)) {
          score += 10;
          if (score >= 60) break;
        }
      }
    }

    // Low signals (+5 each, max +15)
    if (score < 60) {
      for (const keyword of COLLECTIBLE_LOW) {
        if (text.includes(keyword)) {
          score += 5;
          if (score >= 60) break;
        }
      }
    }

    const isCollectible = score >= 20;
    const confidence = Math.min(score, 100);

    return { isCollectible, confidence };
  }

  // ──────────────────────────────────────────
  // PART 3 — MSRP Estimation
  // ──────────────────────────────────────────

  static estimateMSRP(text, currentPrice) {
    // If we have a valid retailer price, use it as the MSRP estimate
    if (currentPrice !== null && currentPrice !== undefined && currentPrice > 0) {
      return {
        estimatedMSRP: currentPrice,
        confidence: 90
      };
    }

    // Try to match known product patterns
    let bestMatch = null;
    let bestScore = 0;

    for (const [pattern, range] of Object.entries(MSRP_PATTERNS)) {
      if (text.includes(pattern)) {
        const score = pattern.length; // Longer patterns = more specific
        if (score > bestScore) {
          bestScore = score;
          bestMatch = range;
        }
      }
    }

    if (bestMatch) {
      // Use midpoint of range as estimate
      const estimated = Math.round(((bestMatch.min + bestMatch.max) / 2) * 100) / 100;
      return {
        estimatedMSRP: estimated,
        confidence: bestMatch.confidence
      };
    }

    // No pattern matched
    return {
      estimatedMSRP: null,
      confidence: 0
    };
  }

  // ──────────────────────────────────────────
  // PART 4 — Release Intelligence
  // ──────────────────────────────────────────

  static analyzeRelease(text) {
    const result = {
      window: 'unknown',
      month: null,
      quarter: null,
      year: null,
      preorderStatus: false,
      launchStatus: false,
      alreadyReleased: false
    };

    // Check preorder signals
    for (const keyword of RELEASE_KEYWORDS.preorder) {
      if (text.includes(keyword)) {
        result.preorderStatus = true;
        result.window = 'preorder';
        break;
      }
    }

    // Check launch signals
    for (const keyword of RELEASE_KEYWORDS.launch) {
      if (text.includes(keyword)) {
        result.launchStatus = true;
        if (result.window === 'unknown') {
          result.window = 'launch';
        }
        break;
      }
    }

    // Check already released signals
    for (const keyword of RELEASE_KEYWORDS.alreadyReleased) {
      if (text.includes(keyword)) {
        result.alreadyReleased = true;
        result.window = 'available';
        break;
      }
    }

    // Extract date information from text
    const dateInfo = this.extractDateInfo(text);
    if (dateInfo) {
      result.month = dateInfo.month;
      result.quarter = dateInfo.quarter;
      result.year = dateInfo.year;
      if (result.window === 'unknown' || result.window === 'preorder') {
        result.window = 'upcoming';
      }
    }

    return result;
  }

  static extractDateInfo(text) {
    // Try to find dates in various formats
    const patterns = [
      // "January 2025", "Jan 2025"
      /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i,
      // "2025 Q1", "Q1 2025"
      /(?:q[1-4])\s*(\d{4})|(\d{4})\s*(?:q[1-4])/i,
      // "2025"
      /\b(20\d{2})\b/
    ];

    const monthMap = {
      january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
      july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        if (match[1] && match[2] && monthMap[match[1].toLowerCase()]) {
          const month = monthMap[match[1].toLowerCase()];
          const year = parseInt(match[2], 10);
          const quarter = Math.ceil(month / 3);
          return { month, quarter, year };
        }
        if (match[1] && /^20\d{2}$/.test(match[1])) {
          const year = parseInt(match[1], 10);
          return { month: null, quarter: null, year };
        }
        if (match[2] && /^20\d{2}$/.test(match[2])) {
          const year = parseInt(match[2], 10);
          return { month: null, quarter: null, year };
        }
      }
    }

    return null;
  }

  // ──────────────────────────────────────────
  // PART 5 — Demand Score
  // ──────────────────────────────────────────

  static calculateDemandScore(text) {
    let score = 0;

    // High signals (+8 each, max +50)
    for (const keyword of DEMAND_HIGH_KEYWORDS) {
      if (text.includes(keyword)) {
        score += 8;
        if (score >= 50) break;
      }
    }

    // Medium signals (+4 each, max +30)
    if (score < 50) {
      for (const keyword of DEMAND_MEDIUM_KEYWORDS) {
        if (text.includes(keyword)) {
          score += 4;
          if (score >= 50) break;
        }
      }
    }

    // Low signals (+2 each, max +20)
    if (score < 50) {
      for (const keyword of DEMAND_LOW_KEYWORDS) {
        if (text.includes(keyword)) {
          score += 2;
          if (score >= 50) break;
        }
      }
    }

    return Math.min(score, 100);
  }

  // ──────────────────────────────────────────
  // PART 6 — Scarcity Score
  // ──────────────────────────────────────────

  static calculateScarcityScore(text) {
    let score = 0;

    // High signals (+10 each, max +60)
    for (const keyword of SCARCITY_HIGH) {
      if (text.includes(keyword)) {
        score += 10;
        if (score >= 60) break;
      }
    }

    // Medium signals (+5 each, max +30)
    if (score < 60) {
      for (const keyword of SCARCITY_MEDIUM) {
        if (text.includes(keyword)) {
          score += 5;
          if (score >= 60) break;
        }
      }
    }

    // Low signals (+2 each, max +10)
    if (score < 60) {
      for (const keyword of SCARCITY_LOW) {
        if (text.includes(keyword)) {
          score += 2;
          if (score >= 60) break;
        }
      }
    }

    return Math.min(score, 100);
  }

  // ──────────────────────────────────────────
  // PART 7 — Flip Score
  // ──────────────────────────────────────────

  static calculateFlipScore(demand, scarcity, collectible, msrp, release) {
    let score = 0;

    // Demand contributes up to 30 points
    score += demand * 0.30;

    // Scarcity contributes up to 25 points
    score += scarcity * 0.25;

    // Collectible contributes up to 20 points
    if (collectible.isCollectible) {
      score += collectible.confidence * 0.20;
    }

    // MSRP confidence contributes up to 10 points
    if (msrp.estimatedMSRP !== null) {
      score += msrp.confidence * 0.10;
    }

    // Preorder status contributes up to 10 points
    if (release.preorderStatus) {
      score += 10;
    } else if (release.launchStatus) {
      score += 5;
    }

    // Retailer bonus (up to 5 points)
    // (handled externally if needed)

    return Math.min(Math.round(score), 100);
  }

  // ──────────────────────────────────────────
  // PART 8 — Confidence Score
  // ──────────────────────────────────────────

  static calculateConfidence(classification, msrp, release, demand, scarcity, collectible) {
    let score = 0;
    let factors = 0;

    // Classification confidence (up to 20)
    if (classification.confidence > 0) {
      score += classification.confidence * 0.20;
      factors++;
    }

    // MSRP confidence (up to 20)
    if (msrp.confidence > 0) {
      score += msrp.confidence * 0.20;
      factors++;
    }

    // Release confidence (up to 20)
    if (release.window !== 'unknown') {
      score += 20;
      factors++;
    }

    // Demand confidence (up to 20)
    if (demand > 0) {
      score += Math.min(demand, 100) * 0.20;
      factors++;
    }

    // Scarcity confidence (up to 10)
    if (scarcity > 0) {
      score += Math.min(scarcity, 100) * 0.10;
      factors++;
    }

    // Collectible confidence (up to 10)
    if (collectible.confidence > 0) {
      score += collectible.confidence * 0.10;
      factors++;
    }

    // If no factors contributed, return 0
    if (factors === 0) return 0;

    return Math.min(Math.round(score), 100);
  }

  // ──────────────────────────────────────────
  // Utility
  // ──────────────────────────────────────────

  static getClassificationOptions() {
    return CLASSIFICATION_ORDER;
  }

  static getCollectibleKeywords() {
    return {
      high: COLLECTIBLE_HIGH,
      medium: COLLECTIBLE_MEDIUM,
      low: COLLECTIBLE_LOW
    };
  }

  static getMSRPPatterns() {
    return MSRP_PATTERNS;
  }
}

module.exports = { ProductIntelligence };