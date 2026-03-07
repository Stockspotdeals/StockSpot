require("dotenv").config();
const mongoose = require("mongoose");

// Use connection string from .env
const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("❌ MONGO_URI not found in .env file");
  process.exit(1);
}

mongoose.connect(uri)
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
