require("dotenv").config();
const mongoose = require("mongoose");

// Use connection string from .env
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/stockspot';

if (!uri) {
  console.error("❌ MONGO_URI or MONGODB_URI not found in .env file");
  process.exit(1);
}

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
