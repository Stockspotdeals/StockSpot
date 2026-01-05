#!/usr/bin/env node

/**
 * StockSpot Production Deployment Validator
 * Validates production-readiness and starts the Reddit deal bot
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 StockSpot Reddit Deal Bot - Production Validator');
console.log('=================================================');

// Check environment file exists
if (!fs.existsSync('.env')) {
  console.error('❌ .env file not found');
  console.error('   Copy .env.example to .env and configure your credentials');
  process.exit(1);
}

// Load environment
require('dotenv').config();

// Validate required environment variables
const requiredVars = [
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET', 
  'REDDIT_USERNAME',
  'REDDIT_PASSWORD',
  'AMAZON_ASSOCIATE_ID',
  'MONGODB_URI'
];

const missingVars = requiredVars.filter(varName => !process.env[varName] || process.env[varName].includes('your_'));

if (missingVars.length > 0) {
  console.error('❌ Missing or default environment variables:');
  missingVars.forEach(varName => console.error(`   - ${varName}`));
  console.error('');
  console.error('Configure these in your .env file before deployment.');
  process.exit(1);
}

console.log('✅ Environment configuration valid');

// Test core services load
try {
  console.log('📦 Loading core services...');
  
  const RedditPoster = require('./backend/services/RedditPoster');
  const { getObserverMode } = require('./backend/services/ObserverMode');
  const { CategoryDetector } = require('./backend/services/CategoryDetector');
  const { AmazonAffiliateEngine } = require('./backend/services/AmazonAffiliateEngine');
  const { AutonomousMonitoringWorker } = require('./backend/workers/AutonomousMonitoringWorker');
  
  console.log('✅ All services loaded successfully');
} catch (error) {
  console.error('❌ Service loading failed:', error.message);
  process.exit(1);
}

// Show observer mode status
const observer = require('./backend/services/ObserverMode').getObserverMode();
const observerStats = observer.getStats();

console.log('');
console.log('👀 Observer Mode Status:');
console.log(`   Status: ${observerStats.isActive ? 'ACTIVE' : 'INACTIVE'}`);
console.log(`   Days since start: ${observerStats.daysSinceStart}`);
console.log(`   Days remaining: ${observerStats.daysRemaining}`);
console.log(`   Can post deals: ${observer.canPost() ? 'YES' : 'NO'}`);

if (observerStats.isActive) {
  console.log('');
  console.log('🔍 Observer Mode Active:');
  console.log('   - Bot will browse subreddits without posting');
  console.log('   - Safe warm-up period for account activity');
  console.log('   - Automatically switches to posting mode when complete');
  console.log('   - Set OBSERVER_MODE=false in .env to disable immediately');
}

// Show subreddit configuration
const redditPoster = new (require('./backend/services/RedditPoster').RedditPoster)();
const subredditStats = redditPoster.getSubredditStats();

console.log('');
console.log('📋 Subreddit Configuration:');
Object.entries(subredditStats).forEach(([category, config]) => {
  const cooldownStatus = config.canPost ? '✅ Ready' : `❄️ Cooldown (${config.hoursUntilCanPost}h remaining)`;
  console.log(`   ${category}: r/${config.subreddit} - ${cooldownStatus}`);
});

console.log('');
console.log('🎯 Production Categories Supported:');
console.log('   ⚡ Pokemon TCG (ETBs, booster boxes, collection boxes)');
console.log('   🏴‍☠️ One Piece TCG (starter decks, booster products)');
console.log('   🏈 Sports Cards (Topps, Panini, Upper Deck, Bowman)');
console.log('   🎮 Gaming (consoles, accessories, popular games)');
console.log('   📱 Electronics (tech accessories, gadgets)');
console.log('   🎯 Collectibles (limited items, hype products)');

console.log('');
console.log('=================================================');
console.log('✅ StockSpot is production-ready!');
console.log('');

if (process.argv.includes('--start')) {
  console.log('🚀 Starting autonomous deal bot...');
  require('./backend/start_autonomous');
} else {
  console.log('💡 To start the bot: npm start');
  console.log('🔍 To test again: npm test');
  console.log('⚙️  To validate: node production.js');
}

console.log('📊 Monitor health: curl http://localhost:3000/health');
console.log('');
console.log('Ready for autonomous deal hunting! 🤖💰');