const mongoose = require("mongoose");

// Import models
const Product = require("../models/Product"); // products collection
const Signal = require("../models/Signal");   // signals collection

async function runSignalEngine() {
  console.log('🚀 Starting Smart Signal Engine...');

  // Ensure MongoDB connection is ready
  if (mongoose.connection.readyState !== 1) {
    console.log('⏳ Waiting for MongoDB connection...');
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('MongoDB connection timeout'));
        }, 10000);

        if (mongoose.connection.readyState === 1) {
          clearTimeout(timeout);
          resolve();
        } else {
          mongoose.connection.once('connected', () => {
            clearTimeout(timeout);
            resolve();
          });
        }
      });
    } catch (error) {
      console.warn('⚠️ MongoDB unavailable, skipping signal engine run:', error.message);
      return [];
    }
  }

  try {
    // Fetch all products
    const products = await Product.find();
    console.log(`📊 Processing ${products.length} products for signals...`);

    const signalsCreated = [];

    for (const product of products) {
      // Example logic for restock detection
      if (product.stock > 0 && (!product.lastStock || product.lastStock === 0)) {
        // Check if we already have an active restock signal for this product
        const existingSignal = await Signal.findOne({
          productId: product._id,
          signalType: "restock",
          status: "active"
        });

        if (!existingSignal) {
          const signal = await Signal.create({
            productId: product._id,
            signalType: "restock",
            status: "active",
            priority: product.confidence > 80 ? 2 : 1, // High confidence = higher priority
            threshold: 0,
            metadata: {
              previousStock: product.lastStock || 0,
              currentStock: product.stock
            }
          });
          signalsCreated.push(signal);
          console.log(`🆕 Restock signal created for: ${product.name}`);
        }
      }

      // Example logic for price-drop detection
      if (product.previousPrice && product.price < product.previousPrice) {
        const priceDropPercent = ((product.previousPrice - product.price) / product.previousPrice) * 100;

        // Only create signal for significant drops (>5%)
        if (priceDropPercent >= 5) {
          const existingSignal = await Signal.findOne({
            productId: product._id,
            signalType: "price-drop",
            status: "active"
          });

          if (!existingSignal) {
            const signal = await Signal.create({
              productId: product._id,
              signalType: "price-drop",
              status: "active",
              priority: priceDropPercent > 20 ? 1 : 0, // Large drops = higher priority
              threshold: priceDropPercent,
              metadata: {
                previousPrice: product.previousPrice,
                currentPrice: product.price,
                percentChange: -priceDropPercent
              }
            });
            signalsCreated.push(signal);
            console.log(`💰 Price drop signal created for: ${product.name} (${priceDropPercent.toFixed(1)}% off)`);
          }
        }
      }

      // Example logic for out-of-stock detection
      if (product.stock === 0 && product.lastStock && product.lastStock > 0) {
        const existingSignal = await Signal.findOne({
          productId: product._id,
          signalType: "out-of-stock",
          status: "active"
        });

        if (!existingSignal) {
          const signal = await Signal.create({
            productId: product._id,
            signalType: "out-of-stock",
            status: "active",
            priority: 0,
            metadata: {
              previousStock: product.lastStock,
              currentStock: 0
            }
          });
          signalsCreated.push(signal);
          console.log(`❌ Out-of-stock signal created for: ${product.name}`);
        }
      }

      // Update tracking fields for next run
      product.lastStock = product.stock;
      product.previousPrice = product.price;
      await product.save();
    }

    console.log(`✅ Signal Engine completed. Created ${signalsCreated.length} new signals.`);
    return signalsCreated.length;

  } catch (error) {
    console.error('❌ Signal Engine error:', error);
    throw error;
  }
}

module.exports = runSignalEngine;