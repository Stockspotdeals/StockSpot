/**
 * Premium Tier Middleware
 * Checks if user has active Stripe subscription in MongoDB
 */

const { UserModel } = require('../models/User');

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
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User account does not exist'
      });
    }

    // Check subscription status
    if (user.subscriptionStatus !== 'active') {
      return res.status(403).json({
        error: 'Premium subscription required',
        message: 'This feature requires an active premium subscription',
        upgradeUrl: '/upgrade',
        currentStatus: user.subscriptionStatus || 'inactive'
      });
    }

    // User has active subscription, continue
    req.user = { ...req.user, subscriptionStatus: user.subscriptionStatus };
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