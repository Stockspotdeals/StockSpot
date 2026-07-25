const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', 'backend', '.env') });
const mongoose = require('mongoose');

async function fix() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/stockspot');
  const db = mongoose.connection.db;
  const r = await db.collection('signals').updateMany(
    { expiresAt: { $exists: false } },
    { $set: { expiresAt: new Date(Date.now() + 86400000) } }
  );
  console.log('Fixed ' + r.modifiedCount + ' signals missing expiresAt');
  await mongoose.disconnect();
}

fix().catch(err => { console.error(err); process.exit(1); });