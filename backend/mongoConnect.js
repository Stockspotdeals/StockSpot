require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { initEnvironment } = require('./utils/envInit');
initEnvironment({ requireMongoUri: true, logMongoStatus: true });
const mongoose = require("mongoose");

// Use connection string from .env
const uri = process.env.MONGO_URI;

const mongooseOptions = {
  serverSelectionTimeoutMS: 10000
};

mongoose.connect(uri, mongooseOptions)
  .then(() => {
    console.log("✅ MongoDB connection verified: StockSpot database reachable");
    console.log(`📍 Connected to: ${mongoose.connection.host}`);
    console.log(`🗄️  Database: ${mongoose.connection.name}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
