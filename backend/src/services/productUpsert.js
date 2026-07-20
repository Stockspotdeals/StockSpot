const mongoose = require('mongoose');
const Product = require('../models/Product');
const { TrackedProduct } = require('../models/TrackedProduct');
const { ProductIntelligence } = require('./ProductIntelligence');
const { OwnerIntelligence } = require('./OwnerIntelligence');
const { processSignal } = require('./signalPipeline');

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
    let intelligence = null;
    try {
      intelligence = ProductIntelligence.analyze(trackedProduct, trackedProduct.pageText || '');
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

    // ── Product Intelligence → Signal Pipeline handoff ──
    try {
      if (intelligence) {
        const previousStock = typeof existing?.stock === 'number' ? existing.stock : 0;
        const currentStock = typeof stock === 'number' ? stock : 0;
        const previousPrice = existing && typeof existing.price === 'number' ? existing.price : null;
        const currentPrice = typeof price === 'number' ? price : null;

        let signalType = null;
        let threshold = 0;

        if (currentStock > 0 && previousStock === 0) {
          signalType = 'restock';
        } else if (currentStock === 0 && previousStock > 0) {
          signalType = 'out-of-stock';
        } else if (currentPrice !== null && previousPrice !== null && currentPrice < previousPrice) {
          const percentDrop = ((previousPrice - currentPrice) / previousPrice) * 100;
          if (percentDrop >= 5) {
            signalType = 'price-drop';
            threshold = percentDrop;
          }
        }

        if (signalType) {
          const signalPayload = {
            productId: product._id,
            productName: name,
            signalType,
            status: 'active',
            priority: signalType === 'restock' ? (product.confidence > 80 ? 2 : 1) : (signalType === 'price-drop' ? (threshold > 20 ? 1 : 0) : 0),
            threshold,
            retailer: trackedProduct.retailer || '',
            url: trackedProduct.url || trackedProduct.originalUrl || '',
            price: currentPrice,
            previousPrice,
            stock: currentStock,
            store: trackedProduct.retailer || '',
            metadata: {
              previousStock,
              currentStock,
              previousPrice,
              currentPrice,
              productIntelligence: {
                classification: intelligence.classification,
                isCollectible: intelligence.isCollectible,
                preorderStatus: intelligence.preorderStatus,
                demandScore: intelligence.demandScore,
                scarcityScore: intelligence.scarcityScore,
                flipScore: intelligence.flipScore,
                confidenceScore: intelligence.confidenceScore
              }
            }
          };

          await processSignal(signalPayload);
        }
      }
    } catch (signalErr) {
      console.warn('⚠️ Signal pipeline handoff failed for', trackedProduct._id, signalErr && signalErr.message);
    }
    // ── End Product Intelligence → Signal Pipeline handoff ──

    // ── Campaign C: Owner Intelligence — Discovery Learning ──
    try {
      const intelligence = ProductIntelligence.analyze(trackedProduct, trackedProduct.pageText || '');
      await OwnerIntelligence.processProduct(trackedProduct, intelligence);
    } catch (oiErr) {
      // Owner Intelligence is non-critical — log and continue
      console.warn('⚠️  OwnerIntelligence processing failed for', trackedProduct._id, oiErr.message);
    }
    // ── End Campaign C ──

    return product;
  } catch (err) {
    console.warn('⚠️  upsertProduct failed for', trackedProduct && trackedProduct._id ? trackedProduct._id.toString() : trackedProduct, err.message);
    return null;
  }
}

module.exports = { upsertProduct };
