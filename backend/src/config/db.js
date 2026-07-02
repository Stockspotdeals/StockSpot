const mongoose = require('mongoose');

const REQUIRED_HOST = 'stockspot-cluster.njhnpac.mongodb.net';

function normalizeMongoUri(rawMongoUri) {
  const raw = String(rawMongoUri || '').trim();
  if (!raw) {
    throw new Error('MONGO_URI is not loaded. Check .env file location.');
  }

  let uri = raw;
  if (!uri.startsWith('mongodb+srv://')) {
    uri = uri.replace(/^mongodb:\/\//, '');
    uri = `mongodb+srv://${uri}`;
  }

  if (!uri.includes(REQUIRED_HOST)) {
    throw new Error(`MONGO_URI must point to ${REQUIRED_HOST}.`);
  }

  return uri;
}

async function connectMongoWithRetry(options = {}) {
  const {
    mongoUri = process.env.MONGO_URI,
    maxRetries = 3,
    retryDelayMs = 3000
  } = options;

  const normalizedUri = normalizeMongoUri(mongoUri);

  let attempt = 0;
  while (attempt < maxRetries) {
    attempt += 1;
    try {
      console.log(`[Mongo] Connect attempt ${attempt}/${maxRetries} to SRV cluster`);
      await mongoose.connect(normalizedUri, {
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 10
      });

      console.log('[Mongo] Connection success');
      return {
        ok: true,
        attempt,
        host: mongoose.connection.host,
        name: mongoose.connection.name
      };
    } catch (error) {
      console.error(`[Mongo] Connection failed on attempt ${attempt}: ${error.message}`);
      if (attempt >= maxRetries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error('MongoDB connection retries exhausted.');
}

module.exports = {
  connectMongoWithRetry,
  normalizeMongoUri,
  REQUIRED_HOST
};
