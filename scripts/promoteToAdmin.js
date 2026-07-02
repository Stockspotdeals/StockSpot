#!/usr/bin/env node
const path = require('path');
const { loadBackendEnv } = require('./loadEnv');

const rootDir = process.cwd();
const backendRoot = path.resolve(rootDir, 'backend');
loadBackendEnv();

const mongoose = require('mongoose');
const { AuthUserModel } = require(path.resolve(backendRoot, 'src/models/AuthUser'));

const TARGET_EMAIL = 'stockspotdeals@gmail.com';

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  const plain = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  delete plain.passwordHash;
  return plain;
};

async function main() {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('MONGO_URI is required.');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 15000 });

  try {
    const before = await AuthUserModel.findByEmail(TARGET_EMAIL);

    if (!before) {
      console.error(`User not found: ${TARGET_EMAIL}`);
      process.exitCode = 1;
      return;
    }

    console.log('Before update:');
    console.log(JSON.stringify(sanitizeUser(before), null, 2));

    await AuthUserModel.updateById(before.id, {
      plan: 'admin',
      status: 'active',
      subscriptionStatus: 'premium'
    });

    const after = await AuthUserModel.findByEmail(TARGET_EMAIL);

    console.log('After update:');
    console.log(JSON.stringify(sanitizeUser(after), null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Promotion failed:', err && err.stack ? err.stack : err.message);
  process.exit(1);
});