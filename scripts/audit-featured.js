const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').resolve(__dirname, '..', 'backend', '.env') });

async function audit() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stockspot');
  const db = mongoose.connection.db;

  const p = await db.collection('products').countDocuments();
  const s = await db.collection('signals').countDocuments();
  const f = await db.collection('featured_products').countDocuments();
  const pi = await db.collection('products').countDocuments({ inStock: true });
  const si = await db.collection('signals').countDocuments({ status: 'active' });

  console.log('=== MongoDB Counts ===');
  console.log('Products total:', p);
  console.log('Products inStock:', pi);
  console.log('Signals total:', s);
  console.log('Signals active:', si);
  console.log('FeaturedProducts:', f);

  // Sample products
  const ps = await db.collection('products').find().limit(3).toArray();
  console.log('\n=== Sample Products ===');
  for (const prod of ps) {
    console.log({
      _id: prod._id,
      name: prod.name,
      title: prod.title,
      retailer: prod.retailer,
      price: prod.price,
      inStock: prod.inStock,
      url: prod.url ? prod.url.substring(0, 80) : null,
      affiliateLink: prod.affiliateLink ? prod.affiliateLink.substring(0, 80) : null,
      category: prod.category,
      demandScore: prod.demandScore,
      flipScore: prod.flipScore,
      estimatedMSRP: prod.estimatedMSRP,
      image: prod.image ? prod.image.substring(0, 60) : null
    });
  }

  // Check for intelligence fields
  const pi2 = await db.collection('products').findOne({ demandScore: { $gt: 0 } });
  if (pi2) {
    console.log('\nHas intelligence fields populated:', {
      demandScore: pi2.demandScore,
      flipScore: pi2.flipScore,
      scarcityScore: pi2.scarcityScore,
      confidenceScore: pi2.confidenceScore,
      isCollectible: pi2.isCollectible
    });
  } else {
    console.log('\nNo products with intelligence fields > 0');
  }

  // Sample active signals
  const ss = await db.collection('signals').find({ status: 'active' }).limit(3).toArray();
  console.log('\n=== Sample Active Signals ===');
  for (const sig of ss) {
    console.log({
      _id: sig._id,
      productId: sig.productId,
      productName: sig.productName,
      signalType: sig.signalType,
      status: sig.status,
      score: sig.score,
      tier: sig.tier
    });
  }

  // Check featured products
  if (f > 0) {
    const fs = await db.collection('featured_products').find().sort({ featuredScore: -1 }).limit(5).toArray();
    console.log('\n=== Top 5 FeaturedProducts ===');
    for (const fp of fs) {
      console.log({
        productId: fp.productId,
        name: fp.name,
        retailer: fp.retailer,
        price: fp.price,
        featuredScore: fp.featuredScore,
        sections: fp.sections,
        badges: fp.badges,
        affiliateUrl: fp.affiliateUrl ? fp.affiliateUrl.substring(0, 100) : null,
        hasTag: fp.affiliateUrl ? fp.affiliateUrl.includes('tag=') : false,
        correctTag: fp.affiliateUrl ? fp.affiliateUrl.includes('tag=stockspotde02-20') : false
      });
    }

    // Count by section
    const sections = await db.collection('featured_products').aggregate([
      { $unwind: '$sections' },
      { $group: { _id: '$sections', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();
    console.log('\n=== FeaturedProducts by Section ===');
    for (const sec of sections) {
      console.log('  ' + sec._id + ': ' + sec.count);
    }
  } else {
    console.log('\nNo featured products found');
  }

  await mongoose.disconnect();
}

audit().catch(err => { console.error('Audit failed:', err); process.exit(1); });