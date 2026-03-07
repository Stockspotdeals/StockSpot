/**
 * Premium Tier Middleware
 * Checks if user has premium access (paid or yearly tier)
 */

const requirePremium = (req, res, next) => {
  try {
    // Get token from Authorization header or localStorage (for frontend)
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.startsWith('Bearer ')
      ? authHeader.substring(7)
      : req.headers.token; // fallback for some clients

    if (!token) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please log in to access premium features'
      });
    }

    // For now, we'll accept any valid token format
    // In production, you'd verify JWT here
    if (token.length < 10) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Please log in again'
      });
    }

    // Check if user has premium tier
    // This would normally come from decoded JWT or database lookup
    // For demo purposes, we'll check a simple header
    const userTier = req.headers['x-user-tier'] || 'free';

    if (userTier !== 'paid' && userTier !== 'yearly') {
      return res.status(403).json({
        error: 'Premium required',
        message: 'This feature requires a premium subscription',
        upgradeUrl: '/upgrade'
      });
    }

    // User is premium, continue
    req.user = { tier: userTier, token };
    next();

  } catch (error) {
    console.error('Premium middleware error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: 'Please try again later'
    });
  }
};

module.exports = requirePremium;