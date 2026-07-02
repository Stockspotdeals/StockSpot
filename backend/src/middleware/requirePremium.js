/**
 * Premium Tier Middleware
 * Checks if user has active Stripe subscription in MongoDB
 */

const { AuthUserModel } = require('../models/AuthUser');

const requirePremium = async (req, res, next) => {
  try {
    // Get user ID from request (set by authMiddleware or JWT)
    const userId = req.user?.id || req.headers['x-user-id'];

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access premium features'
      });
    }

    // Look up user in MongoDB
    const user = await AuthUserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account does not exist'
      });
    }

    // Premium access is modeled as plan=premium/admin or subscriptionStatus=premium.
    const hasPremiumAccess = user.plan === 'premium' || user.plan === 'admin' || user.subscriptionStatus === 'premium';

    if (!hasPremiumAccess) {
      return res.status(403).json({
        error: 'Premium subscription required',
        message: 'This feature requires an active premium subscription',
        upgradeUrl: '/upgrade',
        currentStatus: user.subscriptionStatus || 'free'
      });
    }

    // User has active subscription, continue
    req.user = { ...req.user, subscriptionStatus: user.subscriptionStatus, plan: user.plan };
    next();

  } catch (error) {
    console.error('❌ Premium middleware error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: 'Please try again later'
    });
  }
};

module.exports = requirePremium;