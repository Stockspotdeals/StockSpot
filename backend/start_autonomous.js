#!/usr/bin/env node

/**
 * StockSpot Autonomous Deal Bot Startup Script
 * 
 * This script starts the autonomous deal monitoring system that:
 * - Monitors Amazon deals for collectibles (Pokemon TCG, One Piece TCG, Sports Cards)
 * - Detects price drops and restocks automatically
 * - Posts notifications to Reddit with affiliate links
 * - Runs completely autonomous without user management
 */

const path = require('path');
const fs = require('fs');
const { config } = require('dotenv');

// Load environment configuration - try .env.autonomous first, then .env
const autonomousEnvPath = path.join(__dirname, '.env.autonomous');
const regularEnvPath = path.join(__dirname, '..', '.env');

if (fs.existsSync(autonomousEnvPath)) {
  config({ path: autonomousEnvPath });
  console.log('📋 Loaded configuration from .env.autonomous');
} else if (fs.existsSync(regularEnvPath)) {
  config({ path: regularEnvPath });
  console.log('📋 Loaded configuration from .env (autonomous config not found)');
} else {
  console.warn('⚠️  No .env file found - using environment variables only');
}

// Import and start the autonomous API
const app = require('./autonomous_api');

console.log('🚀 Starting StockSpot Autonomous Reddit Deal Bot...');
console.log(`🤖 Reddit Client ID: ${process.env.REDDIT_CLIENT_ID ? '✅ Configured' : '❌ Missing'}`);
console.log(`📱 Reddit Username: ${process.env.REDDIT_USERNAME ? '✅ Configured' : '❌ Missing'}`);
console.log(`💰 Amazon Associate ID: ${process.env.AMAZON_ASSOCIATE_ID ? '✅ Configured' : '❌ Missing'}`);
console.log(`🗄️ Database: ${process.env.MONGODB_URI ? '✅ Configured' : '❌ Missing'}`);
console.log('');

// Check required environment variables
const requiredVars = [
  'REDDIT_CLIENT_ID',
  'REDDIT_CLIENT_SECRET',
  'REDDIT_USERNAME', 
  'REDDIT_PASSWORD',
  'AMAZON_ASSOCIATE_ID',
  'MONGODB_URI'
];

const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('');
  console.error('Please copy .env.example to .env and configure the missing variables.');
  process.exit(1);
}

console.log('✅ All required environment variables configured');
console.log('🎯 Ready to hunt for deals on:');
console.log('   ⚡ Pokemon TCG Products');
console.log('   🏴‍☠️ One Piece TCG Products'); 
console.log('   🏈 Sports Cards');
console.log('   🎮 Gaming Products');
console.log('   📱 Electronics');
console.log('');
console.log('💡 The bot will automatically:');
console.log('   📦 Monitor for restocks');
console.log('   📉 Track price drops');
console.log('   🔗 Generate affiliate links');
console.log('   📱 Post deals to Reddit');
console.log('');
console.log('🚀 Starting server...');

// The server will start automatically when autonomous_api.js is required