const fs = require('fs');
const path = require('path');

function loadBackendEnv() {
  const rootDir = process.cwd();
  const envPath = path.resolve(rootDir, 'backend', '.env');

  if (!fs.existsSync(envPath)) {
    throw new Error(`Missing env file: ${envPath}`);
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const idx = trimmed.indexOf('=');
    if (idx <= 0) {
      continue;
    }

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return envPath;
}

module.exports = {
  loadBackendEnv
};
