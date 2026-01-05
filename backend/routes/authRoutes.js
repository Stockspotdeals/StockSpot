const express = require('express');
const { body, validationResult } = require('express-validator');
const { UserModel } = require('../models/User');
const { hashPassword, verifyPassword, validatePasswordStrength, checkPasswordCompromised } = require('../utils/passwordUtils');
const { generateTokenPair, verifyToken } = require('../utils/tokenUtils');
const { authRateLimit } = require('../middleware/rateLimitMiddleware');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Validation rules for user registration
 */
const registerValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .custom(async (password) => {
      const validation = validatePasswordStrength(password);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      const isCompromised = await checkPasswordCompromised(password);
      if (isCompromised) {
        throw new Error('This password has been compromised in a data breach. Please choose a different password.');
      }

      return true;
    }),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
];

/**
 * Validation rules for user login
 */
const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * Register new user
 */
router.post('/register', authRateLimit, registerValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please fix the following errors',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Check if user already exists
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email address already exists'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = await UserModel.create(email, hashedPassword);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user);
    
    // Store refresh token
    user.addRefreshToken(refreshToken);

    // Set secure cookie for refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: user.toJSON(),
      accessToken,
      tokenType: 'Bearer'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An error occurred during registration'
    });
  }
});

/**
 * User login
 */
router.post('/login', authRateLimit, loginValidation, async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please fix the following errors',
        details: errors.array()
      });
    }

    const { email, password } = req.body;

    // Find user
    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'Account suspended',
        message: 'Your account has been suspended. Please contact support.'
      });
    }

    // Verify password
    const isValidPassword = await verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user);
    
    // Store refresh token
    user.addRefreshToken(refreshToken);

    // Set secure cookie for refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Login successful',
      user: user.toJSON(),
      accessToken,
      tokenType: 'Bearer'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Login failed',
      message: 'An error occurred during login'
    });
  }
});

/**
 * Refresh access token
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        message: 'No refresh token provided'
      });
    }

    // Verify refresh token
    const decoded = verifyToken(refreshToken);
    
    // Find user
    const user = await UserModel.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        error: 'User not found',
        message: 'Invalid refresh token'
      });
    }

    // Check if refresh token exists in user's token list
    if (!user.refreshTokens.includes(refreshToken)) {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Refresh token not found or expired'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'Account suspended',
        message: 'Your account has been suspended'
      });
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user);
    
    // Replace old refresh token with new one
    user.removeRefreshToken(refreshToken);
    user.addRefreshToken(newRefreshToken);

    // Set new secure cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      message: 'Token refreshed successfully',
      accessToken,
      tokenType: 'Bearer'
    });

  } catch (error) {
    if (error.message === 'TOKEN_EXPIRED' || error.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        error: 'Invalid refresh token',
        message: 'Refresh token is invalid or expired'
      });
    }

    console.error('Token refresh error:', error);
    res.status(500).json({
      error: 'Token refresh failed',
      message: 'An error occurred while refreshing token'
    });
  }
});

/**
 * Logout user
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (refreshToken) {
      // Remove refresh token from user's token list
      req.user.removeRefreshToken(refreshToken);
    }

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    res.json({
      message: 'Logout successful'
    });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

/**
 * Logout from all devices
 */
router.post('/logout-all', authenticateToken, async (req, res) => {
  try {
    // Clear all refresh tokens
    req.user.clearAllRefreshTokens();

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    res.json({
      message: 'Logged out from all devices successfully'
    });

  } catch (error) {
    console.error('Logout all error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An error occurred during logout'
    });
  }
});

/**
 * Get current user profile
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: req.user.toJSON()
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      error: 'Profile fetch failed',
      message: 'An error occurred while fetching profile'
    });
  }
});

/**
 * Update user profile
 */
router.put('/profile', authenticateToken, [
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email address')
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please fix the following errors',
        details: errors.array()
      });
    }

    const { email } = req.body;
    const updates = {};

    if (email && email !== req.user.email) {
      // Check if new email is already in use
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({
          error: 'Email already in use',
          message: 'An account with this email address already exists'
        });
      }
      updates.email = email;
    }

    // Update user
    const updatedUser = await UserModel.updateById(req.user.id, updates);

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser.toJSON()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      error: 'Profile update failed',
      message: 'An error occurred while updating profile'
    });
  }
});

/**
 * Change password
 */
router.put('/change-password', authenticateToken, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters')
    .custom(async (password) => {
      const validation = validatePasswordStrength(password);
      if (!validation.valid) {
        throw new Error(validation.errors.join(', '));
      }

      const isCompromised = await checkPasswordCompromised(password);
      if (isCompromised) {
        throw new Error('This password has been compromised in a data breach. Please choose a different password.');
      }

      return true;
    }),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) {
        throw new Error('Passwords do not match');
      }
      return true;
    })
], async (req, res) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        message: 'Please fix the following errors',
        details: errors.array()
      });
    }

    const { currentPassword, newPassword } = req.body;

    // Verify current password
    const isValidPassword = await verifyPassword(currentPassword, req.user.passwordHash);
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'Invalid password',
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const hashedPassword = await hashPassword(newPassword);

    // Update password (this would need to be implemented in UserModel)
    req.user.passwordHash = hashedPassword;
    req.user.updatedAt = new Date();

    // Clear all refresh tokens to force re-login on all devices
    req.user.clearAllRefreshTokens();

    // Clear refresh token cookie
    res.clearCookie('refreshToken');

    res.json({
      message: 'Password changed successfully. Please log in again.'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      error: 'Password change failed',
      message: 'An error occurred while changing password'
    });
  }
});

module.exports = router;