const mongoose = require('mongoose');
const Product = require('../models/Product');
const { TrackedProduct } = require('../models/TrackedProduct');
const { ProductIntelligence } = require('./ProductIntelligence');

async function upsertProduct(trackedProduct) {
  try {
    if (!trackedProduct) throw new Error('trackedProduct is required');

    // Normalize values from tracked product
    const price = trackedProduct.price !== undefined && trackedProduct.price !== null
      ? trackedProduct.price
      : (trackedProduct.currentPrice || null);

    const inStock = !!trackedProduct.isAvailable;
    const stock = inStock ? 1 : 0;

    const filter = { productId: trackedProduct._id };

    // Load existing product to compute previousPrice / preserve lastStock
    const existing = await Product.findOne(filter).exec();

    const name = trackedProduct.title || trackedProduct.productName || trackedProduct.name || 'Unknown Product';
    const update = {
      $set: {
        productId: trackedProduct._id,
        name,
        title: trackedProduct.title || trackedProduct.productName || trackedProduct.name || '',
        retailer: trackedProduct.retailer || '',
        category: trackedProduct.category || '',
        price: price,
        inStock,
        stock,
        affiliateLink: trackedProduct.affiliateLink || '',
        image: trackedProduct.image || '',
        url: trackedProduct.url || trackedProduct.originalUrl || '',
        detectedAt: new Date(),
        updatedAt: new Date(),
        confidence: trackedProduct.confidence || 0
      }
    };

    if (existing) {
      // Preserve lastStock if present; set previousPrice when price changes
      if (typeof existing.price !== 'undefined' && existing.price !== null && price !== null && existing.price !== price) {
        update.$set.previousPrice = existing.price;
      }
      // Do not overwrite existing.lastStock; signalEngine updates lastStock itself.
    } else {
      // New insert defaults
      update.$set.previousPrice = trackedProduct.previousPrice || null;
      update.$set.lastStock = 0;
    }

    const opts = { upsert: true, new: true, setDefaultsOnInsert: true };
    const product = await Product.findOneAndUpdate(filter, update, opts).exec();

    // ── Campaign B: Compute Product Intelligence ──
    try {
      const intelligence = ProductIntelligence.analyze(trackedProduct, trackedProduct.pageText || '');
      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            classification: intelligence.classification,
            classificationConfidence: intelligence.classificationConfidence,
            isCollectible: intelligence.isCollectible,
            collectibleConfidence: intelligence.collectibleConfidence,
            estimatedMSRP: intelligence.estimatedMSRP,
            msrpConfidence: intelligence.msrpConfidence,
            releaseWindow: intelligence.releaseWindow,
            releaseMonth: intelligence.releaseMonth,
            releaseQuarter: intelligence.releaseQuarter,
            releaseYear: intelligence.releaseYear,
            preorderStatus: intelligence.preorderStatus,
            launchStatus: intelligence.launchStatus,
            alreadyReleased: intelligence.alreadyReleased,
            demandScore: intelligence.demandScore,
            scarcityScore: intelligence.scarcityScore,
            flipScore: intelligence.flipScore,
            confidenceScore: intelligence.confidenceScore
          }
        }
      );
    } catch (intelErr) {
      // Intelligence is non-critical — log and continue
      console.warn('⚠️  ProductIntelligence analysis failed for', trackedProduct._id, intelErr.message);
    }
    // ── End Campaign B ──

    return product;
  } catch (err) {
    console.warn('⚠️  upsertProduct failed for', trackedProduct && trackedProduct._id ? trackedProduct._id.toString() : trackedProduct, err.message);
    return null;
  }
}

module.exports = { upsertProduct };
