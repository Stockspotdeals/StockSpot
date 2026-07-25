/**
 * Refresh Featured Feed Script
 * Uses native MongoDB driver to avoid Mongoose model compilation issues.
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') });

const { AmazonAffiliateEngine } = require('../backend/src/services/AmazonAffiliateEngine');
const ae = new AmazonAffiliateEngine();

async function refresh() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stockspot', {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000
  });
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  // Get enriched products
  const products = await db.collection('products')
    .find({ inStock: true })
    .sort({ updatedAt: -1 })
    .limit(500)
    .toArray();
  console.log('Products found:', products.length);

  // Get active signals
  const signals = await db.collection('signals')
    .find({ status: 'active', expiresAt: { $gt: new Date() } })
    .sort({ createdAt: -1 })
    .toArray();

  const signalMap = {};
  for (const sig of signals) {
    const pid = String(sig.productId);
    if (!signalMap[pid]) signalMap[pid] = sig;
  }
  console.log('Signals found:', signals.length);

  // Build featured docs
  const featuredDocs = [];
  for (const p of products) {
    const sig = signalMap[String(p._id)] || null;

    // Calculate featured score
    let score = 0;
    if (p.flipScore) score += (p.flipScore / 100) * 25;
    if (p.demandScore) score += (p.demandScore / 100) * 15;
    if (p.scarcityScore) score += (p.scarcityScore / 100) * 15;
    if (p.confidenceScore) score += (p.confidenceScore / 100) * 10;

    const msrp = p.estimatedMSRP || p.previousPrice;
    if (msrp && p.price && msrp > p.price && msrp > 0) {
      const d = ((msrp - p.price) / msrp) * 100;
      score += Math.min(10, d / 5);
    }
    if (msrp && msrp >= 100) score += 2;
    if (msrp && msrp >= 250) score += 3;

    if (sig) {
      if (sig.signalType === 'restock') score += 8;
      else if (sig.signalType === 'price-drop') score += 5;
      if (sig.tier === 'HIGH') score += 2;
    }

    if (p.isCollectible) score += 3;
    if (p.demandScore >= 60) score += 2;

    if (p.updatedAt) {
      const h = (Date.now() - new Date(p.updatedAt).getTime()) / 3600000;
      if (h < 1) score += 5;
      else if (h < 6) score += 3;
      else if (h < 24) score += 1;
    }

    if (p.inStock) score += 5;

    if (p.createdAt) {
      const d = (Date.now() - new Date(p.createdAt).getTime()) / 86400000;
      if (d < 1) score += 5;
      else if (d < 3) score += 3;
      else if (d < 7) score += 1;
    }

    if (p.preorderStatus) score += 3;
    score = Math.min(100, Math.round(score));

    // Compute savings
    const savings = msrp && p.price ? Math.max(0, msrp - p.price) : 0;
    const savingsPercent = msrp && p.price && msrp > 0
      ? Math.round((savings / msrp) * 100)
      : 0;

    // Generate affiliate URL
    let affiliateUrl = p.affiliateLink || p.url || '';
    if (affiliateUrl && (p.retailer || '').toLowerCase().includes('amazon')) {
      affiliateUrl = ae.generateAffiliateUrl(affiliateUrl);
    }

    // Badges
    const badges = [];
    if (score >= 80) badges.push('HOT');
    if (sig && sig.signalType === 'restock') badges.push('RESTOCK');
    if (sig && sig.signalType === 'price-drop') badges.push('PRICE_DROP');
    if (p.isCollectible) badges.push('COLLECTIBLE');
    if (p.preorderStatus) badges.push('PREORDER');
    if (p.flipScore >= 70) badges.push('HIGH_FLIP');
    if (p.scarcityScore >= 60) badges.push('LIMITED');

    // Sections
    const sections = ['all'];
    if (score >= 75 && p.inStock) sections.push('hot');
    if (savingsPercent >= 10) sections.push('biggest_discounts');
    if (score >= 70 && p.demandScore >= 60) sections.push('trending');

    const cat = (p.category || '').toLowerCase();
    if (/gaming|consoles|controllers|accessories/i.test(cat)) sections.push('gaming');
    if (p.isCollectible) sections.push('collectibles');
    if (/toys|lego|figures/i.test(cat)) sections.push('toys');
    if (/electronics/i.test(cat)) sections.push('electronics');
    if (sig && sig.signalType === 'restock' && p.inStock) sections.push('restocks');
    if (p.flipScore >= 70 && p.inStock) sections.push('high_flip');

    featuredDocs.push({
      productId: p._id,
      name: p.name,
      title: p.title || p.name,
      price: p.price,
      originalPrice: p.previousPrice || null,
      estimatedMSRP: msrp,
      savings,
      savingsPercent,
      retailer: p.retailer,
      category: p.category,
      image: p.image || '',
      affiliateUrl: affiliateUrl && affiliateUrl.startsWith('http') ? affiliateUrl : (p.url || ''),
      inStock: p.inStock,
      demandScore: p.demandScore || 0,
      scarcityScore: p.scarcityScore || 0,
      flipScore: p.flipScore || 0,
      confidenceScore: p.confidenceScore || 0,
      featuredScore: score,
      sections,
      badges,
      hasRestockSignal: !!(sig && sig.signalType === 'restock'),
      hasPriceDropSignal: !!(sig && sig.signalType === 'price-drop'),
      lastSignalType: sig ? sig.signalType : null,
      lastSignalAt: sig ? sig.createdAt : null,
      isCollectible: !!p.isCollectible,
      isPreorder: !!p.preorderStatus,
      isTrending: score >= 70 && p.demandScore >= 60,
      lastMonitoredAt: p.updatedAt,
      featuredAt: new Date(),
      expiresAt: new Date(Date.now() + 86400000)
    });
  }

  // Batch upsert
  if (featuredDocs.length > 0) {
    const ops = featuredDocs.map(d => ({
      updateOne: {
        filter: { productId: d.productId },
        update: { $set: d },
        upsert: true
      }
    }));
    await db.collection('featured_products').bulkWrite(ops, { ordered: false });

    const ids = featuredDocs.map(d => d.productId);
    await db.collection('featured_products').deleteMany({ productId: { $nin: ids } });
  } else {
    await db.collection('featured_products').deleteMany({});
  }

  // Verify
  const fc = await db.collection('featured_products').countDocuments();
  console.log('\nFeaturedProducts count:', fc);

  if (fc > 0) {
    const samples = await db.collection('featured_products')
      .find()
      .sort({ featuredScore: -1 })
      .limit(3)
      .toArray();

    console.log('\nTop 3 featured products:');
    for (const s of samples) {
      console.log({
        name: s.name,
        retailer: s.retailer,
        price: s.price,
        score: s.featuredScore,
        badges: s.badges,
        sections: s.sections,
        affiliateUrl: (s.affiliateUrl || '').substring(0, 100),
        hasTag: s.affiliateUrl ? s.affiliateUrl.includes('tag=stockspotde02-20') : false
      });
    }

    const sections = await db.collection('featured_products').aggregate([
      { $unwind: '$sections' },
      { $group: { _id: '$sections', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]).toArray();

    console.log('\nSections:');
    for (const sec of sections) {
      console.log('  ' + sec._id + ': ' + sec.count);
    }
  }

  await mongoose.disconnect();
  console.log('Done.');
}

refresh().catch(err => {
  console.error('Refresh failed:', err);
  process.exit(1);
});