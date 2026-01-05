/**
 * Test script for StockSpot Reddit Autonomous Bot
 * Validates core functionality and Reddit integration
 */

require('dotenv').config();

async function testStockSpotReddit() {
  console.log('🧪 StockSpot Reddit Bot Test Suite');
  console.log('===================================');

  // Test 1: Environment Variables
  console.log('\n🔧 Testing Environment Configuration...');
  const requiredEnvVars = [
    'REDDIT_CLIENT_ID',
    'REDDIT_CLIENT_SECRET', 
    'REDDIT_USERNAME',
    'REDDIT_PASSWORD',
    'AMAZON_ASSOCIATE_ID',
    'MONGODB_URI'
  ];

  let envScore = 0;
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar] && !process.env[envVar].includes('your_')) {
      console.log(`   ✅ ${envVar}: configured`);
      envScore++;
    } else {
      console.log(`   ❌ ${envVar}: missing or default value`);
    }
  }
  console.log(`   Score: ${envScore}/${requiredEnvVars.length}`);

  // Test 2: Core Services Load
  console.log('\n🚀 Testing Core Service Loading...');
  try {
    const RedditPoster = require('./backend/services/RedditPoster');
    console.log('   ✅ RedditPoster loads successfully');
    
    const { CategoryDetector } = require('./backend/services/CategoryDetector');
    console.log('   ✅ CategoryDetector loads successfully');
    
    const { AmazonAffiliateEngine } = require('./backend/services/AmazonAffiliateEngine');
    console.log('   ✅ AmazonAffiliateEngine loads successfully');
    
    const { AutonomousMonitoringWorker } = require('./backend/workers/AutonomousMonitoringWorker');
    console.log('   ✅ AutonomousMonitoringWorker loads successfully');
    
    const { getObserverMode } = require('./backend/services/ObserverMode');
    console.log('   ✅ ObserverMode loads successfully');
  } catch (error) {
    console.log(`   ❌ Service loading failed: ${error.message}`);
  }

  // Test 3: Reddit Integration
  console.log('\n📱 Testing Reddit Integration...');
  try {
    const RedditPoster = require('./backend/services/RedditPoster');
    const redditPoster = new RedditPoster();
    
    // Test authentication (if credentials are provided)
    if (process.env.REDDIT_CLIENT_ID && !process.env.REDDIT_CLIENT_ID.includes('your_')) {
      const connected = await redditPoster.testConnection();
      if (connected.success) {
        console.log('   ✅ Reddit authentication successful');
      } else {
        console.log('   ⚠️  Reddit authentication failed - check credentials');
      }
    } else {
      console.log('   ⚠️  Reddit credentials not configured - skipping connection test');
    }
    
    // Test subreddit mapping and cooldowns
    console.log('   ✅ Subreddit mapping and cooldowns:');
    const stats = redditPoster.getSubredditStats();
    Object.entries(stats).forEach(([category, config]) => {
      const status = config.canPost ? '✅' : `❄️ ${config.hoursUntilCanPost}h`;
      console.log(`      • ${category} → r/${config.subreddit} (${status})`);
    });
  } catch (error) {
    console.log(`   ❌ Reddit integration test failed: ${error.message}`);
  }

  // Test 4: Category Detection
  console.log('\n🎯 Testing Category Detection...');
  try {
    const { CategoryDetector } = require('./backend/services/CategoryDetector');
    
    const testProducts = [
      'Pokemon Brilliant Stars Booster Box',
      'One Piece TCG Romance Dawn Starter Deck', 
      '2023 Topps Chrome Baseball Hobby Box',
      'PlayStation 5 Console',
      'iPhone 15 Pro Max'
    ];
    
    for (const productName of testProducts) {
      const category = CategoryDetector.detectCategory(productName);
      console.log(`   "${productName}" → ${category}`);
    }
  } catch (error) {
    console.log(`   ❌ Category detection failed: ${error.message}`);
  }

  // Test 5: Amazon Affiliate Engine
  console.log('\n💰 Testing Amazon Affiliate Engine...');
  try {
    const { AmazonAffiliateEngine } = require('./backend/services/AmazonAffiliateEngine');
    const affiliateEngine = new AmazonAffiliateEngine();
    
    const testUrl = 'https://amazon.com/dp/B123456789';
    const affiliateUrl = affiliateEngine.generateAffiliateUrl(testUrl);
    
    console.log(`   Original: ${testUrl}`);
    console.log(`   Affiliate: ${affiliateUrl}`);
    
    if (affiliateUrl.includes(process.env.AMAZON_ASSOCIATE_ID || 'stockspot-20')) {
      console.log('   ✅ Affiliate ID properly injected');
    } else {
      console.log('   ⚠️  Affiliate ID not found in URL');
    }
  } catch (error) {
    console.log(`   ❌ Affiliate engine test failed: ${error.message}`);
  }

  // Test 6: Observer Mode
  console.log('\n👀 Testing Observer Mode...');
  try {
    const { getObserverMode } = require('./backend/services/ObserverMode');
    const observer = getObserverMode();
    
    const stats = observer.getStats();
    console.log(`   Observer Mode: ${stats.isActive ? 'ACTIVE' : 'INACTIVE'}`);
    console.log(`   Days since start: ${stats.daysSinceStart}`);
    console.log(`   Days remaining: ${stats.daysRemaining}`);
    console.log(`   Total activities: ${stats.totalActivities}`);
    console.log(`   Can post: ${observer.canPost() ? 'YES' : 'NO'}`);
  } catch (error) {
    console.log(`   ❌ Observer mode test failed: ${error.message}`);
  }
  // Test 7: Supported Features
  
  const categories = [
    'pokemon_tcg', 'one_piece_tcg', 'sports_cards', 
    'gaming', 'electronics', 'collectibles', 'toys', 'other'
  ];
  console.log('   • Categories:');
  categories.forEach(cat => console.log(`     - ${cat}`));
  
  const subreddits = [
    'PokemonTCG', 'OnePieceTCG', 'tradingcardcommunity',
    'GameDeals', 'deals', 'collectibles', 'toys'
  ];
  console.log('   • Target Subreddits:');
  subreddits.forEach(sub => console.log(`     - r/${sub}`));
  
  console.log('\n===================================');
  console.log('🎯 StockSpot Reddit Bot Test Complete!');
  console.log('');
  console.log('💡 To run the autonomous bot:');
  console.log('   1. Configure Reddit credentials in .env');
  console.log('   2. Run: npm start');
  console.log('   3. Monitor: curl http://localhost:3000/health');
  console.log('🚀 Ready to hunt deals on Reddit!');
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Run the test suite
testStockSpotReddit().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});