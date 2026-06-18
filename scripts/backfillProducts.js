require('dotenv').config();
const mongoose = require('mongoose');
const { TrackedProduct } = require('../backend/models/TrackedProduct');
const { upsertProduct } = require('../backend/services/productUpsert');

async function main() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/stockspot';
  if (!uri) {
    console.error('❌ No MongoDB URI configured (MONGO_URI or MONGODB_URI)');
    process.exit(1);
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅ Connected to MongoDB for backfill');

  try {
    const cursor = TrackedProduct.find().cursor();
    let total = 0;
    let succeeded = 0;
    let failed = 0;

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      total++;
      try {
        const res = await upsertProduct(doc);
        if (res) succeeded++; else failed++;
      } catch (err) {
        failed++;
        console.warn('⚠️  Backfill upsert failed for', doc._id.toString(), err.message);
      }
    }

    console.log(`✅ Backfill complete. Total=${total} succeeded=${succeeded} failed=${failed}`);
  } catch (err) {
    console.error('❌ Backfill error:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
