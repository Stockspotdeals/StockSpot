#!/usr/bin/env node
const path = require('path');
const { loadBackendEnv } = require('./loadEnv');

const rootDir = process.cwd();
const backendRoot = path.resolve(rootDir, 'backend');
loadBackendEnv();

const mongoose = require('mongoose');
const { AuthUserModel } = require(path.resolve(backendRoot, 'src/models/AuthUser'));
const { hashPassword, validatePasswordStrength } = require(path.resolve(backendRoot, 'src/utils/passwordUtils'));

async function main() {
  const enabled = process.env.BOOTSTRAP_OWNER === '1';
  const email = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
  const password = process.env.OWNER_PASSWORD || '';

  if (!enabled) {
    console.error('Owner bootstrap is disabled. Set BOOTSTRAP_OWNER=1 to run.');
    process.exit(1);
  }

  if (!email || !password) {
    console.error('OWNER_EMAIL and OWNER_PASSWORD are required.');
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is required.');
    process.exit(1);
  }

  const passwordValidation = validatePasswordStrength(password);
  if (!passwordValidation.valid) {
    console.error(`Weak OWNER_PASSWORD: ${passwordValidation.errors.join(', ')}`);
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  try {
    const existingAdmin = await AuthUserModel.findOne({ plan: 'admin', status: 'active' });
    if (existingAdmin) {
      console.log('Admin already exists. No changes made.');
      return;
    }

    const existingUser = await AuthUserModel.findByEmail(email);
    if (existingUser) {
      existingUser.plan = 'admin';
      existingUser.status = 'active';
      existingUser.updatedAt = new Date();
      await existingUser.save();
      console.log('Promoted existing user to admin.');
      return;
    }

    const passwordHash = await hashPassword(password);
    const owner = await AuthUserModel.create({
      email,
      passwordHash,
      plan: 'admin',
      subscriptionStatus: 'premium',
      status: 'active'
    });

    console.log('Created owner admin account.');
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error('Owner bootstrap failed:', err && err.stack ? err.stack : err.message);
  process.exit(1);
});
