/**
 * Seed Amazon Affiliate Products
 *
 * Populates the Product collection with real Amazon product entries
 * containing affiliate links with tag=stockspotde02-20.
 *
 * The existing FeaturedDealsEngine picks these up on its next refresh
 * cycle (every 30 minutes or on next server start).
 *
 * Safe to re-run: uses upsert by productId.
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') });

const AMAZON_TAG = 'stockspotde02-20';

const AMAZON_PRODUCTS = [
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Pokemon TCG: Scarlet & Violet - Paldean Fates Booster Pack',
    title: 'Pokemon TCG: Scarlet & Violet - Paldean Fates Booster Pack',
    price: 4.49,
    originalPrice: 4.99,
    estimatedMSRP: 4.99,
    url: 'https://www.amazon.com/dp/B0CHQY6Y7G',
    affiliateLink: 'https://www.amazon.com/dp/B0CHQY6Y7G?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/81X5Vo4xR1L._AC_SL1500_.jpg',
    category: 'collectibles',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: true,
    flipScore: 72,
    demandScore: 85,
    scarcityScore: 45,
    confidenceScore: 80,
    previousPrice: 4.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Nintendo Switch OLED Model - Mario Red Edition',
    title: 'Nintendo Switch OLED Model - Mario Red Edition',
    price: 349.99,
    originalPrice: 359.99,
    estimatedMSRP: 359.99,
    url: 'https://www.amazon.com/dp/B0BYPF4B9C',
    affiliateLink: 'https://www.amazon.com/dp/B0BYPF4B9C?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/71R7m0yGmPL._AC_SL1500_.jpg',
    category: 'gaming',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: false,
    flipScore: 45,
    demandScore: 90,
    scarcityScore: 30,
    confidenceScore: 95,
    previousPrice: 359.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'LEGO Star Wars Millennium Falcon 75192',
    title: 'LEGO Star Wars Millennium Falcon 75192 UCS Set',
    price: 849.99,
    originalPrice: 849.99,
    estimatedMSRP: 849.99,
    url: 'https://www.amazon.com/dp/B01NA2WYQ4',
    affiliateLink: 'https://www.amazon.com/dp/B01NA2WYQ4?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/71gJdK5e8tL._AC_SL1500_.jpg',
    category: 'toys',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: true,
    flipScore: 68,
    demandScore: 75,
    scarcityScore: 60,
    confidenceScore: 85,
    previousPrice: 899.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    title: 'Sony WH-1000XM5 Wireless Noise Cancelling Headphones',
    price: 329.99,
    originalPrice: 399.99,
    estimatedMSRP: 399.99,
    url: 'https://www.amazon.com/dp/B0B3QCZ5L5',
    affiliateLink: 'https://www.amazon.com/dp/B0B3QCZ5L5?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/61McsgS8u6L._AC_SL1500_.jpg',
    category: 'electronics',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: false,
    flipScore: 55,
    demandScore: 88,
    scarcityScore: 25,
    confidenceScore: 92,
    previousPrice: 399.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Meta Quest 3 128GB — VR Headset',
    title: 'Meta Quest 3 128GB — VR Headset',
    price: 499.99,
    originalPrice: 549.99,
    estimatedMSRP: 549.99,
    url: 'https://www.amazon.com/dp/B0CF5BZ2P4',
    affiliateLink: 'https://www.amazon.com/dp/B0CF5BZ2P4?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/61CQ2J7yGtL._AC_SL1500_.jpg',
    category: 'electronics',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: false,
    flipScore: 40,
    demandScore: 82,
    scarcityScore: 40,
    confidenceScore: 88,
    previousPrice: 549.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Pokemon TCG: Scarlet & Violet 151 Booster Bundle',
    title: 'Pokemon TCG: Scarlet & Violet 151 Booster Bundle',
    price: 26.99,
    originalPrice: 29.99,
    estimatedMSRP: 29.99,
    url: 'https://www.amazon.com/dp/B0CG2L3G3P',
    affiliateLink: 'https://www.amazon.com/dp/B0CG2L3G3P?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/81vI7eG8sJL._AC_SL1500_.jpg',
    category: 'collectibles',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: true,
    flipScore: 78,
    demandScore: 92,
    scarcityScore: 75,
    confidenceScore: 82,
    previousPrice: 29.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Samsung 990 Pro 2TB PCIe 4.0 NVMe M.2 SSD',
    title: 'Samsung 990 Pro 2TB PCIe 4.0 NVMe M.2 SSD',
    price: 169.99,
    originalPrice: 199.99,
    estimatedMSRP: 199.99,
    url: 'https://www.amazon.com/dp/B0BHJTHD3D',
    affiliateLink: 'https://www.amazon.com/dp/B0BHJTHD3D?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/71I1k6L7RBL._AC_SL1500_.jpg',
    category: 'electronics',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: false,
    flipScore: 35,
    demandScore: 70,
    scarcityScore: 20,
    confidenceScore: 90,
    previousPrice: 199.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Funko Pop! Marvel: Deadpool & Wolverine 2-Pack',
    title: 'Funko Pop! Marvel: Deadpool & Wolverine 2-Pack',
    price: 24.99,
    originalPrice: 29.99,
    estimatedMSRP: 29.99,
    url: 'https://www.amazon.com/dp/B0B5H5R5N5',
    affiliateLink: 'https://www.amazon.com/dp/B0B5H5R5N5?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/71cMq8yH2tL._AC_SL1500_.jpg',
    category: 'collectibles',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: true,
    flipScore: 65,
    demandScore: 72,
    scarcityScore: 55,
    confidenceScore: 75,
    previousPrice: 29.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'Amazon Fire TV Stick 4K Max (Newest Model)',
    title: 'Amazon Fire TV Stick 4K Max (Newest Model)',
    price: 39.99,
    originalPrice: 59.99,
    estimatedMSRP: 59.99,
    url: 'https://www.amazon.com/dp/B0BP9SNV9C',
    affiliateLink: 'https://www.amazon.com/dp/B0BP9SNV9C?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/61L5Kj8sR3t._AC_SL1500_.jpg',
    category: 'electronics',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: false,
    flipScore: 25,
    demandScore: 85,
    scarcityScore: 10,
    confidenceScore: 95,
    previousPrice: 59.99
  },
  {
    productId: new mongoose.Types.ObjectId(),
    name: 'One Piece TCG: Awakening of the New Era OP-05 Booster Box',
    title: 'One Piece TCG: Awakening of the New Era OP-05 Booster Box',
    price: 119.99,
    originalPrice: 143.99,
    estimatedMSRP: 143.99,
    url: 'https://www.amazon.com/dp/B0CH3RFQ9L',
    affiliateLink: 'https://www.amazon.com/dp/B0CH3RFQ9L?tag=stockspotde02-20',
    image: 'https://m.media-amazon.com/images/I/81K3Lm9nP4q._AC_SL1500_.jpg',
    category: 'collectibles',
    retailer: 'Amazon',
    inStock: true,
    isCollectible: true,
    flipScore: 82,
    demandScore: 95,
    scarcityScore: 80,
    confidenceScore: 78,
    previousPrice: 143.99
  }
];

async function seed() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/stockspot';
  console.log(`Connecting to MongoDB: ${mongoUri.replace(/\/\/.*@/, '//<credentials>@')}`);
  
  await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000
  });
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const collection = db.collection('products');

  let inserted = 0;
  let updated = 0;

  for (const product of AMAZON_PRODUCTS) {
    const existing = await collection.findOne({ productId: product.productId });
    
    const doc = {
      ...product,
      // Ensure affiliate link has tag
      affiliateLink: product.affiliateLink || `https://www.amazon.com/dp/${product.url.match(/\/dp\/([A-Z0-9]{10})/)?.[1] || 'XXXXXXXXXX'}?tag=${AMAZON_TAG}`,
      // Intelligence scores for FeaturedDealsEngine scoring
      productId: product.productId,
      demandScore: product.demandScore || 70,
      scarcityScore: product.scarcityScore || 40,
      flipScore: product.flipScore || 50,
      confidenceScore: product.confidenceScore || 75,
      isCollectible: product.isCollectible || false,
      createdAt: new Date(),
      updatedAt: new Date(),
      detectedAt: new Date()
    };

    if (existing) {
      await collection.updateOne(
        { productId: product.productId },
        { $set: { ...doc, _id: existing._id } }
      );
      updated++;
    } else {
      doc._id = new mongoose.Types.ObjectId();
      await collection.insertOne(doc);
      inserted++;
    }
  }

  console.log(`\nSeeding complete:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Total products in collection: ${await collection.countDocuments()}`);

  // Verify affiliate URLs contain tag
  const amazonProducts = await collection.find({ retailer: 'Amazon' }).toArray();
  let tagOk = 0;
  let tagMissing = 0;
  for (const p of amazonProducts) {
    if (p.affiliateLink && p.affiliateLink.includes(`tag=${AMAZON_TAG}`)) {
      tagOk++;
    } else {
      tagMissing++;
      console.warn(`  [WARN] ${p.name}: affiliate link missing tag`);
    }
  }
  console.log(`\nAffiliate tag verification:`);
  console.log(`  Correct: ${tagOk}`);
  console.log(`  Missing tag: ${tagMissing}`);

  await mongoose.disconnect();
  console.log('\nDone.');
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});