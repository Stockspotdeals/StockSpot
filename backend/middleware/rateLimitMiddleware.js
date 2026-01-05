const rateLimit = require('express-rate-limit');
const { UserModel, PLAN_LIMITS } = require('../models/User');

/**
 * Global API rate limiter
 */
const globalRateLimit = rateLimit({
  windowMs: parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.GLOBAL_RATE_LIMIT_MAX) || 100,
  message: {
    error: 'Too many requests',
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Authentication rate limiter (for login/register endpoints)
 */
const authRateLimit = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 5,
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many login attempts from this IP, please try again later.',
    retryAfter: Math.ceil((parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Plan-based rate limiting middleware
 */
const planBasedRateLimit = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource',
      code: 'AUTH_REQUIRED'
    });
  }

  // Check if user can make API calls based on their plan
  if (!req.user.canMakeApiCall()) {
    const limits = req.user.getPlanLimits();
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `You have exceeded your plan's API limit of ${limits.apiCallsPerHour} calls per hour`,
      code: 'PLAN_RATE_LIMIT_EXCEEDED',
      plan: req.user.plan,
      limits: limits,
      usage: req.user.usage
    });
  }

  // Increment the user's API call count
  req.user.incrementApiCall();

  next();
};

/**
 * Feature usage limit middleware
 */
const featureUsageLimit = (featureType) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
        code: 'AUTH_REQUIRED'
      });
    }

    let canUseFeature = false;
    let errorMessage = '';

    switch (featureType) {
      case 'track_product':
        canUseFeature = req.user.canTrackProduct();
        if (!canUseFeature) {
          const limits = req.user.getPlanLimits();
          errorMessage = `You have reached your plan's limit of ${limits.maxTrackedProducts} tracked products`;
        }
        break;

      case 'create_alert':
        canUseFeature = req.user.canCreateAlert();
        if (!canUseFeature) {
          const limits = req.user.getPlanLimits();
          errorMessage = `You have reached your plan's limit of ${limits.maxAlertsPerDay} alerts per day`;
        }
        break;

      case 'create_deal':
        canUseFeature = req.user.canCreateDeal();
        if (!canUseFeature) {
          const limits = req.user.getPlanLimits();
          errorMessage = `You have reached your plan's limit of ${limits.maxDealsPerMonth} deals per month`;
        }
        break;

      default:
        return next();
    }

    if (!canUseFeature) {
      return res.status(403).json({
        error: 'Feature limit exceeded',
        message: errorMessage,
        code: 'FEATURE_LIMIT_EXCEEDED',
        featureType: featureType,
        plan: req.user.plan,
        limits: req.user.getPlanLimits(),
        usage: req.user.usage
      });
    }

    next();
  };
};

/**
 * Premium feature middleware (requires paid or admin plan)
 */
const requirePremiumFeature = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.plan === 'free') {
    return res.status(403).json({
      error: 'Premium feature required',
      message: 'This feature is only available to paid subscribers',
      code: 'PREMIUM_REQUIRED',
      currentPlan: req.user.plan,
      upgradeUrl: '/upgrade'
    });
  }

  next();
};

/**
 * Dynamic rate limiter based on user plan
 */
const createPlanBasedRateLimit = () => {
  const userLimits = new Map();

  return rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: (req) => {
      if (!req.user) {
        return 50; // Default for unauthenticated users
      }

      const limits = req.user.getPlanLimits();
      return limits.apiCallsPerHour === -1 ? Number.MAX_SAFE_INTEGER : limits.apiCallsPerHour;
    },
    keyGenerator: (req) => {
      return req.user ? `user:${req.user.id}` : req.ip;
    },
    message: (req) => {
      const limits = req.user ? req.user.getPlanLimits() : { apiCallsPerHour: 50 };
      return {
        error: 'Rate limit exceeded',
        message: `You have exceeded your ${req.user ? req.user.plan : 'anonymous'} plan's rate limit of ${limits.apiCallsPerHour} requests per hour`,
        code: 'RATE_LIMIT_EXCEEDED',
        plan: req.user ? req.user.plan : 'anonymous',
        limits: limits
      };
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

module.exports = {
  globalRateLimit,
  authRateLimit,
  planBasedRateLimit,
  featureUsageLimit,
  requirePremiumFeature,
  createPlanBasedRateLimit
};