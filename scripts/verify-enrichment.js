const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') });

async function verify() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stockspot');
  const db = mongoose.connection.db;

  // Check signals
  const signals = await db.collection('signals').find({}).limit(3).toArray();
  console.log('=== Signals ===');
  for (const s of signals) {
    console.log({
      productId: s.productId,
      signalType: s.signalType,
      status: s.status,
      expiresAt: s.expiresAt,
      score: s.score,
      tier: s.tier
    });
  }

  // Check MacBook enrichment
  const macbook = await db.collection('products').findOne({ name: 'MacBook Pro 14-inch' });
  console.log('\n=== MacBook Pro ===');
  console.log({
    url: macbook.url,
    affiliateLink: macbook.affiliateLink,
    image: macbook.image ? macbook.image.substring(0, 60) : null,
    demandScore: macbook.demandScore,
    flipScore: macbook.flipScore,
    scarcityScore: macbook.scarcityScore,
    confidenceScore: macbook.confidenceScore,
    estimatedMSRP: macbook.estimatedMSRP,
    isCollectible: macbook.isCollectible
  });

  // Check Amazon product
  const amazon = await db.collection('products').findOne({ retailer: { $regex: /amazon/i } });
  console.log('\n=== Amazon Product ===');
  console.log({
    name: amazon.name,
    url: amazon.url,
    affiliateLink: amazon.affiliateLink,
    hasTag: amazon.affiliateLink ? amazon.affiliateLink.includes('tag=') : false,
    correctTag: amazon.affiliateLink ? amazon.affiliateLink.includes('tag=stockspotde02-20') : false
  });

  // Check featured products
  const fc = await db.collection('featured_products').countDocuments();
  console.log('\n=== Featured Products ===');
  console.log('Count:', fc);

  if (fc > 0) {
    const top = await db.collection('featured_products').find().sort({ featuredScore: -1 }).limit(5).toArray();
    for (const f of top) {
      console.log({
        name: f.name,
        retailer: f.retailer,
        score: f.featuredScore,
        badges: f.badges,
        sections: f.sections,
        affiliateUrl: f.affiliateUrl ? f.affiliateUrl.substring(0, 100) : null,
        hasTag: f.affiliateUrl ? f.affiliateUrl.includes('tag=stockspotde02-20') : false
      });
    }
  }

  await mongoose.disconnect();
}

verify().catch(err => { console.error(err); process.exit(1); });