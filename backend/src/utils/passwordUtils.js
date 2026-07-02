const bcrypt = require('bcryptjs');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;

/**
 * Hash password using bcrypt
 */
const hashPassword = async (plainPassword) => {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    return await bcrypt.hash(plainPassword, salt);
  } catch (error) {
    throw new Error('Password hashing failed');
  }
};

/**
 * Verify password against hash
 */
const verifyPassword = async (plainPassword, hashedPassword) => {
  try {
    return await bcrypt.compare(plainPassword, hashedPassword);
  } catch (error) {
    throw new Error('Password verification failed');
  }
};

/**
 * Validate password strength
 */
const validatePasswordStrength = (password) => {
  const errors = [];

  if (!password) {
    errors.push('Password is required');
    return { valid: false, errors };
  }

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    errors.push('Password must be less than 128 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  // Check for common weak passwords
  const commonPasswords = [
    'password', 'password123', '123456', 'qwerty', 'admin', 'letmein',
    'welcome', 'monkey', 'password1', 'abc123', 'password!', 'Password123'
  ];

  if (commonPasswords.includes(password.toLowerCase())) {
    errors.push('Password is too common, please choose a different one');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Generate random password for testing/admin purposes
 */
const generateRandomPassword = (length = 16) => {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=';
  let password = '';
  
  // Ensure at least one character from each required category
  password += 'a'; // lowercase
  password += 'A'; // uppercase
  password += '1'; // number
  password += '!'; // special character
  
  // Fill the rest randomly
  for (let i = 4; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
};

/**
 * Check if password has been compromised (basic check)
 */
const checkPasswordCompromised = async (password) => {
  // In production, you might want to use HaveIBeenPwned API
  // For now, just check against a small list of known compromised passwords
  const compromisedPasswords = [
    'password', '123456', 'password123', 'admin', 'qwerty', 'letmein',
    'welcome', 'monkey', 'password1', 'abc123', 'iloveyou', 'princess',
    'rockyou', 'password!', 'Password123', 'welcome123'
  ];
  
  return compromisedPasswords.includes(password.toLowerCase());
};

module.exports = {
  hashPassword,
  verifyPassword,
  validatePasswordStrength,
  generateRandomPassword,
  checkPasswordCompromised,
  SALT_ROUNDS
};