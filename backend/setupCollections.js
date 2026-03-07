/**
 * StockSpot MongoDB Collections Setup
 * Creates collections and indexes for Layer 2 smart signals
 */

require("dotenv").config();
const mongoose = require("mongoose");

const uri = process.env.MONGO_URI;

(async () => {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;

    console.log("\n🔧 Setting up StockSpot collections...\n");

    // =========================================================================
    // 1. PRODUCTS COLLECTION
    // =========================================================================
    const productsExists = await db.listCollections({ name: "products" }).hasNext();
    
    if (!productsExists) {
      console.log("📦 Creating 'products' collection...");
      await db.createCollection("products");
      
      // Insert example product
      const exampleProduct = {
        name: "MacBook Pro 14-inch",
        price: 1999,
        originalPrice: 2499,
        stock: 5,
        url: "https://amazon.com/MacBook-Pro-14",
        affiliateLink: "https://amazon.com/ref=stockspot",
        category: "electronics",
        retailer: "Amazon",
        inStock: true,
        discount: 20,
        confidence: 95,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection("products").insertOne(exampleProduct);
      
      // Create indexes for faster queries
      await db.collection("products").createIndex({ stock: 1 });
      await db.collection("products").createIndex({ createdAt: -1 });
      await db.collection("products").createIndex({ retailer: 1, inStock: 1 });
      
      console.log("   ✅ Created with indexes\n");
    } else {
      console.log("   ✓ Already exists\n");
    }

    // =========================================================================
    // 2. SIGNALS COLLECTION
    // =========================================================================
    const signalsExists = await db.listCollections({ name: "signals" }).hasNext();
    
    if (!signalsExists) {
      console.log("📢 Creating 'signals' collection...");
      await db.createCollection("signals");
      
      // Insert example signal
      const exampleSignal = {
        productId: new mongoose.Types.ObjectId(),
        signalType: "price-drop",
        status: "active",
        threshold: 20,
        triggered: true,
        priority: 1,
        userId: new mongoose.Types.ObjectId(),
        metadata: {
          previousPrice: 2499,
          currentPrice: 1999,
          percentChange: 20
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection("signals").insertOne(exampleSignal);
      
      // Create indexes for faster queries
      await db.collection("signals").createIndex({ status: 1 });
      await db.collection("signals").createIndex({ productId: 1 });
      await db.collection("signals").createIndex({ userId: 1, createdAt: -1 });
      await db.collection("signals").createIndex({ signalType: 1, status: 1 });
      
      console.log("   ✅ Created with indexes\n");
    } else {
      console.log("   ✓ Already exists\n");
    }

    // =========================================================================
    // 3. AI_TEMPLATES COLLECTION
    // =========================================================================
    const aiExists = await db.listCollections({ name: "ai_templates" }).hasNext();
    
    if (!aiExists) {
      console.log("🤖 Creating 'ai_templates' collection...");
      await db.createCollection("ai_templates");
      
      // Insert example template
      const exampleTemplate = {
        templateName: "Quick Flip Strategy",
        category: "electronics",
        strategy: "aggressive",
        strategyLabel: "⚡ Quick Flip (Fast Liquidation)",
        content: "Lower price for faster sales and reduced holding costs.",
        suggestedResalePrice: 2199,
        estimatedProfit: 200,
        marginPercent: 10,
        ebayTemplate: "MacBook Pro - Brand New - Latest Model",
        marketplaceTemplate: "FOR SALE: MacBook Pro 14-inch - Quick Flip Strategy",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      await db.collection("ai_templates").insertOne(exampleTemplate);
      
      // Create indexes for faster queries
      await db.collection("ai_templates").createIndex({ category: 1 });
      await db.collection("ai_templates").createIndex({ strategy: 1 });
      await db.collection("ai_templates").createIndex({ createdAt: -1 });
      
      console.log("   ✅ Created with indexes\n");
    } else {
      console.log("   ✓ Already exists\n");
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("=" .repeat(60));
    console.log("\n✅ MongoDB Collections Setup Complete!\n");

    const collections = await db.listCollections().toArray();
    console.log(`📊 Total Collections: ${collections.length}\n`);
    
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments();
      console.log(`   • ${col.name}: ${count} document(s)`);
    }

    console.log("\n" + "=" .repeat(60));
    console.log("\n🎯 Next Steps:\n");
    console.log("   1. Open MongoDB extension in VS Code");
    console.log("   2. Add connection:");
    console.log("      mongodb+srv://stockspotdeals_db_user:*****@stockspot-cluster.njhnpac.mongodb.net/stockspot");
    console.log("   3. Browse collections in the sidebar");
    console.log("   4. View documents and manage data directly\n");
    console.log("=" .repeat(60) + "\n");

    await mongoose.connection.close();
    process.exit(0);

  } catch (error) {
    console.error("\n❌ Setup failed:", error.message);
    process.exit(1);
  }
})();
