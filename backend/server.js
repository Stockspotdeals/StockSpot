const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const { connectMongoWithRetry } = require('./src/config/db');
const { startServer, setMongoConnectionStatus, logStartupStatus } = require('./app');

async function bootstrap() {
  const loadedMongoUri = Boolean(process.env.MONGO_URI);
  const port = Number(process.env.PORT) || 3000;

  try {
    if (!loadedMongoUri) {
      throw new Error('MONGO_URI is not loaded. Check .env file location.');
    }

    await connectMongoWithRetry({
      mongoUri: process.env.MONGO_URI,
      maxRetries: 3,
      retryDelayMs: 3000
    });

    setMongoConnectionStatus('success');
    const server = await startServer();

    console.log(`[StartupStatus] Loaded MONGO_URI: ${loadedMongoUri} | Active server port: ${port} | Mongo connection: success`);
    return server;
  } catch (error) {
    setMongoConnectionStatus('failure');
    logStartupStatus();
    console.error('[Startup] Fatal startup error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = {
  bootstrap
};
