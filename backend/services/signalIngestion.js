const cron = require('node-cron');
const Signal = require('../models/Signal');
const Product = require('../models/Product');

const sources = {};
let schedulerStarted = false;
let defaultSourcesRegistered = false;

function addSource(name, handler) {
  if (!name || typeof handler !== 'function') {
    throw new Error('addSource requires a source name and a handler function');
  }

  sources[name] = handler;
  return handler;
}

async function loadTemplateSource() {
  const templates = [
    {
      productName: 'Pokémon TCG Elite Trainer Box',
      store: 'Target',
      price: 79.99,
      originalPrice: 99.99,
      signalType: 'restock',
      premiumOnly: false,
      affiliateUrl: 'https://target.com/pokemon-elite-trainer-box',
      title: 'Pokémon Booster Bundle Restock',
      description: 'A fresh shipment of Pokémon booster boxes is back in stock.',
      imageUrl: 'https://images.stockspot.com/pokemon-elite.jpg',
      priority: 1,
      source: 'template'
    },
    {
      productName: 'PlayStation 5 Console',
      store: 'Walmart',
      price: 499.99,
      originalPrice: 499.99,
      signalType: 'restock',
      premiumOnly: true,
      affiliateUrl: 'https://walmart.com/playstation-5',
      title: 'PS5 Console Restock',
      description: 'Limited PS5 inventory has become available at Walmart. Premium members get early notice.',
      imageUrl: 'https://images.stockspot.com/ps5-restock.jpg',
      priority: 2,
      source: 'template'
    },
    {
      productName: 'LEGO UCS Star Wars Millennium Falcon',
      store: 'Amazon',
      price: 599.99,
      originalPrice: 799.99,
      signalType: 'price-drop',
      premiumOnly: false,
      affiliateUrl: 'https://amazon.com/lego-millennium-falcon',
      title: 'LEGO UCS Set Price Drop',
      description: 'The Millennium Falcon set is now discounted on Amazon.',
      imageUrl: 'https://images.stockspot.com/lego-millennium.jpg',
      priority: 2,
      source: 'template'
    },
    {
      productName: 'NVIDIA GeForce RTX 4080',
      store: 'Best Buy',
      price: 849.99,
      originalPrice: 1049.99,
      signalType: 'price-drop',
      premiumOnly: true,
      affiliateUrl: 'https://bestbuy.com/rtx-4080',
      title: 'Graphics Card Price Drop',
      description: 'Premium-only deal on the latest RTX 4080 cards at Best Buy.',
      imageUrl: 'https://images.stockspot.com/rtx-4080.jpg',
      priority: 3,
      source: 'template'
    },
    {
      productName: 'Magic: The Gathering Trading Card Bundle',
      store: 'GameStop',
      price: 124.99,
      originalPrice: 124.99,
      signalType: 'restock',
      premiumOnly: false,
      affiliateUrl: 'https://gamestop.com/mtg-trading-card-bundle',
      title: 'Trading Card Product Restock',
      description: 'A hot trading card bundle has returned to GameStop inventory.',
      imageUrl: 'https://images.stockspot.com/mtg-bundle.jpg',
      priority: 1,
      source: 'template'
    }
  ];

  const productLookup = new Map();
  const products = await Product.find().lean();
  products.forEach(product => {
    if (product.name) {
      productLookup.set(product.name.toLowerCase(), product);
    }
  });

  return templates.map((template) => {
    const matchedProduct = productLookup.get((template.productName || '').toLowerCase());
    return {
      productId: matchedProduct ? matchedProduct._id : null,
      productName: template.productName,
      store: template.store,
      affiliateUrl: template.affiliateUrl,
      signalType: template.signalType,
      premiumOnly: template.premiumOnly,
      title: template.title,
      description: template.description,
      imageUrl: template.imageUrl,
      source: template.source,
      priority: template.priority,
      metadata: {
        previousPrice: template.originalPrice,
        currentPrice: template.price,
        percentChange: template.originalPrice && template.originalPrice > 0
          ? Math.round(((template.originalPrice - template.price) / template.originalPrice) * 100)
          : 0
      }
    };
  });
}

async function registerDefaultSources() {
  if (defaultSourcesRegistered) return;
  defaultSourcesRegistered = true;

  addSource('template', async () => {
    return loadTemplateSource();
  });

  addSource('placeholder', async () => {
    // Future placeholder for external ingestion sources like API, scraper, or affiliate feeds.
    return [];
  });
}

async function createSignalIfNeeded(payload) {
  const query = {
    signalType: payload.signalType,
    store: payload.store,
    status: 'active'
  };

  if (payload.productId) {
    query.productId = payload.productId;
  } else if (payload.productName) {
    query.productName = payload.productName;
  }

  const duplicateExists = await Signal.exists(query);
  if (duplicateExists) {
    console.log(`Duplicate skipped: ${payload.productName || payload.title} | ${payload.store} | ${payload.signalType}`);
    return null;
  }

  const signal = await Signal.create({
    ...payload,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  console.log(`Signal inserted: ${payload.title} | ${payload.store} | ${payload.signalType}`);
  return signal;
}

async function ingestSignals() {
  console.log('Signal ingestion started');
  await registerDefaultSources();

  const sourceNames = Object.keys(sources);
  if (!sourceNames.length) {
    console.log('No signal sources registered, skipping ingestion');
    return { inserted: 0, skipped: 0 };
  }

  let inserted = 0;
  let skipped = 0;
  const created = [];

  for (const sourceName of sourceNames) {
    try {
      const sourceSignals = await sources[sourceName]();
      if (!Array.isArray(sourceSignals)) {
        console.warn(`Source ${sourceName} did not return an array, skipping`);
        continue;
      }

      for (const signalData of sourceSignals) {
        try {
          const signal = await createSignalIfNeeded(signalData);
          if (signal) {
            inserted += 1;
            created.push(signal);
          } else {
            skipped += 1;
          }
        } catch (innerError) {
          console.error(`Failed to create signal from source ${sourceName}:`, innerError.message);
        }
      }
    } catch (error) {
      console.error(`Source ${sourceName} failed during ingestion:`, error.message);
    }
  }

  console.log(`Signal ingestion complete — inserted: ${inserted}, duplicate skipped: ${skipped}`);
  return {
    inserted,
    skipped,
    created
  };
}

function initializeSignalScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  try {
    cron.schedule('*/15 * * * *', async () => {
      try {
        console.log('Automated signal ingestion scheduler triggered');
        await ingestSignals();
      } catch (error) {
        console.error('Signal ingestion scheduler error:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.SIGNAL_INGESTION_TZ || 'UTC'
    });

    console.log('Signal ingestion scheduler initialized (every 15 minutes)');
  } catch (error) {
    console.error('Failed to initialize signal ingestion scheduler:', error.message);
  }
}

module.exports = {
  ingestSignals,
  initializeSignalScheduler,
  addSource
};
