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