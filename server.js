console.log('BOOT STARTED');
console.log('Starting StockSpot backend...');
require('dotenv').config();

const { startServer } = require('./backend/app');

startServer();
