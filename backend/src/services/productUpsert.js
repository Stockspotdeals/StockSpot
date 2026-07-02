const mongoose = require('mongoose');
const Product = require('../models/Product');
const { TrackedProduct } = require('../models/TrackedProduct');

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

    return product;
  } catch (err) {
    console.warn('⚠️  upsertProduct failed for', trackedProduct && trackedProduct._id ? trackedProduct._id.toString() : trackedProduct, err.message);
    return null;
  }
}

module.exports = { upsertProduct };
