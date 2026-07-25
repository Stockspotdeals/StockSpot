/**
 * Environment initialization utility.
 *
 * - Uses existing process.env values (e.g. Render-provided) when available.
 * - Falls back to dotenv (local .env file) only if the key is not already set.
 * - Never requires a local .env file in production.
 * - Never overwrites existing environment variables.
 */
const path = require('path');

function maskMongoUri(uri) {
  if (!uri) {
    return '';
  }

  return uri.replace(/\/\/([^@]+)@/, '//***:***@');
}

function initEnvironment(options = {}) {
  const {
    requireMongoUri = false,
    logMongoStatus = false
  } = options;

  // Only load dotenv as a fallback if MONGO_URI is not already in the environment.
  // This ensures Render (or any platform) environment variables take precedence,
  // while still supporting local development with a .env file.
  if (!process.env.MONGO_URI) {
    try {
      require('dotenv').config({ path: path.resolve(__dirname, '.env') });
    } catch (_) {
      // dotenv might not be installed or .env file is missing – that's fine
      // in production since the platform provides the variables.
    }
  }

  const mongoUriLoaded = Boolean(process.env.MONGO_URI);

  if (logMongoStatus) {
    console.log(`Mongo URI loaded: ${mongoUriLoaded}`);
    if (mongoUriLoaded) {
      console.log(`Mongo URI (masked): ${maskMongoUri(process.env.MONGO_URI)}`);
    }
  }

  if (requireMongoUri && !mongoUriLoaded) {
    throw new Error('MONGO_URI is not loaded. Check .env file location.');
  }

  return {
    mongoUriLoaded
  };
}

module.exports = {
  initEnvironment,
  maskMongoUri
};