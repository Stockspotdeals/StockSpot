const path = require('path');
const { loadBackendEnv } = require('./loadEnv');

const rootDir = process.cwd();
const backendRoot = path.resolve(rootDir, 'backend');
loadBackendEnv();
const mongoose = require('mongoose');
const { TrackedProduct } = require(path.resolve(backendRoot, 'src/models/TrackedProduct'));
const { upsertProduct } = require(path.resolve(backendRoot, 'src/services/productUpsert'));

async function main() {
  const uri = process.env.MONGO_URI;

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
