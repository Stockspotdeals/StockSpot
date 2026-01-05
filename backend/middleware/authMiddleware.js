const { UserModel } = require('../models/User');
const { verifyToken, extractTokenFromHeader, extractTokenFromCookies } = require('../utils/tokenUtils');

/**
 * Authentication middleware to protect routes
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Try to get token from Authorization header first, then cookies
    let token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      token = extractTokenFromCookies(req.cookies);
    }

    if (!token) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No authentication token provided',
        code: 'NO_TOKEN'
      });
    }

    // Verify the token
    const decoded = verifyToken(token);
    
    // Get user from database
    const user = await UserModel.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.status !== 'active') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'User account is suspended or inactive',
        code: 'USER_INACTIVE'
      });
    }

    // Attach user to request
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    if (error.message === 'TOKEN_EXPIRED') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    } else if (error.message === 'INVALID_TOKEN') {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    }

    return res.status(401).json({
      error: 'Access denied',
      message: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Optional authentication middleware (doesn't fail if no token)
 */
const optionalAuthentication = async (req, res, next) => {
  try {
    let token = extractTokenFromHeader(req.headers.authorization);
    
    if (!token) {
      token = extractTokenFromCookies(req.cookies);
    }

    if (token) {
      const decoded = verifyToken(token);
      const user = await UserModel.findById(decoded.userId);
      
      if (user && user.status === 'active') {
        req.user = user;
        req.token = token;
      }
    }
    
    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
};

/**
 * Role-based authorization middleware
 */
const requirePlan = (allowedPlans) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
        code: 'AUTH_REQUIRED'
      });
    }

    const userPlan = req.user.plan;
    const plans = Array.isArray(allowedPlans) ? allowedPlans : [allowedPlans];

    if (!plans.includes(userPlan)) {
      return res.status(403).json({
        error: 'Access denied',
        message: `This feature requires ${plans.join(' or ')} plan. Your current plan: ${userPlan}`,
        code: 'INSUFFICIENT_PLAN',
        currentPlan: userPlan,
        requiredPlans: plans
      });
    }

    next();
  };
};

/**
 * Admin-only authorization middleware
 */
const requireAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please log in to access this resource',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.plan !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Administrator privileges required',
      code: 'ADMIN_REQUIRED'
    });
  }

  next();
};

/**
 * Self or admin authorization (user can access own resources, admin can access any)
 */
const requireSelfOrAdmin = (userIdParam = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access this resource',
        code: 'AUTH_REQUIRED'
      });
    }

    const targetUserId = parseInt(req.params[userIdParam]);
    const currentUserId = req.user.id;
    const isAdmin = req.user.plan === 'admin';

    if (!isAdmin && targetUserId !== currentUserId) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only access your own resources',
        code: 'SELF_ACCESS_ONLY'
      });
    }

    next();
  };
};

module.exports = {
  authenticateToken,
  optionalAuthentication,
  requirePlan,
  requireAdmin,
  requireSelfOrAdmin
};