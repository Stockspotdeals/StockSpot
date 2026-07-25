/**
 * Product Intelligence Backfill Script
 *
 * Runs all existing Product documents through ProductIntelligence.analyze()
 * and updates them with computed scores. Also fixes affiliate URLs.
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') });

const { ProductIntelligence } = require('../backend/src/services/ProductIntelligence');
const { AmazonAffiliateEngine } = require('../backend/src/services/AmazonAffiliateEngine');

const amazonEngine = new AmazonAffiliateEngine();

// ASIN mapping for products sold AT Amazon that need proper Amazon URLs
const URL_MAP = {
  'MacBook Pro 14-inch': { asin: 'B09DFCB66S', retailer: 'Amazon' }
};

// Image mappings for products missing images
const IMAGE_MAP = {
  'MacBook Pro 14-inch': 'https://m.media-amazon.com/images/I/61lwY1JzGUL._AC_SL1500_.jpg',
  'Pokemon 151': 'https://m.media-amazon.com/images/I/81pOnOj1bPL._AC_SL1500_.jpg',
  'Pokemon Elite Trainer Box': 'https://m.media-amazon.com/images/I/71xjVkgNKaL._AC_SL1500_.jpg',
  'PS5 Console': 'https://m.media-amazon.com/images/I/51xwGVNnJ2L._AC_SL1500_.jpg',
  'Pokemon 151 Booster Bundle': 'https://m.media-amazon.com/images/I/91NUnvXftWL._AC_SL1500_.jpg'
};

async function backfill() {
  // Connect via mongoose
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stockspot', {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000
  });
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}).toArray();
  console.log(`Found ${products.length} products to process`);

  let enriched = 0;
  let urlsFixed = 0;
  let imagesAdded = 0;

  for (const product of products) {
    try {
      const pageText = `${product.title || product.name || ''} ${product.category || ''} ${product.retailer || ''}`;

      // Run through ProductIntelligence
      const intelligence = ProductIntelligence.analyze({
        title: product.title || product.name,
        name: product.name,
        url: product.url,
        retailer: product.retailer,
        category: product.category,
        price: product.price,
        description: product.name
      }, pageText);

      // Build update document
      const $set = {
        classification: intelligence.classification,
        classificationConfidence: intelligence.classificationConfidence,
        isCollectible: intelligence.isCollectible,
        collectibleConfidence: intelligence.collectibleConfidence,
        estimatedMSRP: intelligence.estimatedMSRP,
        msrpConfidence: intelligence.msrpConfidence,
        releaseWindow: intelligence.releaseWindow,
        preorderStatus: intelligence.preorderStatus,
        launchStatus: intelligence.launchStatus,
        alreadyReleased: intelligence.alreadyReleased,
        demandScore: intelligence.demandScore,
        scarcityScore: intelligence.scarcityScore,
        flipScore: intelligence.flipScore,
        confidenceScore: intelligence.confidenceScore,
        inStock: product.inStock !== false
      };

      // Fix Amazon affiliate URL
      const retailer = (product.retailer || '').toLowerCase();
      if (retailer.includes('amazon')) {
        const name = product.name || '';
        const mapped = URL_MAP[name];
        let newUrl = product.url;

        if (mapped && mapped.retailer.toLowerCase().includes('amazon')) {
          newUrl = `https://www.amazon.com/dp/${mapped.asin}`;
        }

        const affiliateUrl = amazonEngine.generateAffiliateUrl(newUrl || product.url);
        if (affiliateUrl && affiliateUrl.includes('tag=')) {
          $set.url = newUrl || product.url;
          $set.affiliateLink = affiliateUrl;
          urlsFixed++;
        }
      }

      // Add image if missing
      const imageKey = product.title || product.name || '';
      if (!product.image && IMAGE_MAP[imageKey]) {
        $set.image = IMAGE_MAP[imageKey];
        imagesAdded++;
      }

      await db.collection('products').updateOne(
        { _id: product._id },
        { $set }
      );

      console.log(`  ✅ Enriched: ${product.name || product.title} (demand=${intelligence.demandScore}, flip=${intelligence.flipScore}, collectible=${intelligence.isCollectible})`);
      enriched++;

    } catch (err) {
      console.error(`  ❌ Failed to enrich ${product.name || product.title}: ${err.message}`);
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Products enriched: ${enriched}/${products.length}`);
  console.log(`Amazon URLs fixed: ${urlsFixed}`);
  console.log(`Images added: ${imagesAdded}`);

  // Verify enrichment
  const verified = await db.collection('products').countDocuments({ demandScore: { $gt: 0 } });
  console.log(`Products with demandScore > 0: ${verified}`);

  // Trigger FeaturedDealsEngine refresh
  console.log('\nTriggering FeaturedDealsEngine refresh...');
  const { getFeaturedDealsEngine } = require('../backend/src/services/FeaturedDealsEngine');
  const engine = getFeaturedDealsEngine();
  const featuredCount = await engine.refreshFeaturedFeed();
  console.log(`Featured feed refreshed: ${featuredCount} products`);

  await mongoose.disconnect();
  console.log('Done.');
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});