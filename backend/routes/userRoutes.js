const express = require('express');
const { UserModel, PLAN_TYPES, PLAN_LIMITS, USER_STATUS } = require('../models/User');
const { authenticateToken, requireAdmin, requireSelfOrAdmin } = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');

const router = express.Router();

/**
 * Get all users (admin only)
 */
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { limit = 50, offset = 0, plan, status } = req.query;
    
    let result = await UserModel.list(parseInt(limit), parseInt(offset));
    
    // Filter by plan if specified
    if (plan && Object.values(PLAN_TYPES).includes(plan)) {
      result.users = result.users.filter(user => user.plan === plan);
    }
    
    // Filter by status if specified
    if (status && Object.values(USER_STATUS).includes(status)) {
      result.users = result.users.filter(user => user.status === status);
    }

    res.json({
      users: result.users.map(user => user.toJSON()),
      total: result.total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: 'Failed to fetch users',
      message: 'An error occurred while fetching users'
    });
  }
});

/**
 * Get user by ID
 */
router.get('/:userId', authenticateToken, requireSelfOrAdmin(), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User with this ID does not exist'
      });
    }

    res.json({
      user: user.toJSON()
    });

  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      message: 'An error occurred while fetching user'
    });
  }
});

/**
 * Update user by ID (admin only for plan/status changes)
 */
router.put('/:userId', authenticateToken, requireAdmin, [
  body('plan')
    .optional()
    .isIn(Object.values(PLAN_TYPES))
    .withMessage(`Plan must be one of: ${Object.values(PLAN_TYPES).join(', ')}`),
  body('status')
    .optional()
    .isIn(Object.values(USER_STATUS))
    .withMessage(`Status must be one of: ${Object.values(USER_STATUS).join(', ')}`),
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

    const { userId } = req.params;
    const { plan, status, email } = req.body;
    
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User with this ID does not exist'
      });
    }

    const updates = {};
    
    if (plan !== undefined) updates.plan = plan;
    if (status !== undefined) updates.status = status;
    if (email !== undefined) {
      // Check if new email is already in use
      const existingUser = await UserModel.findByEmail(email);
      if (existingUser && existingUser.id !== parseInt(userId)) {
        return res.status(409).json({
          error: 'Email already in use',
          message: 'An account with this email address already exists'
        });
      }
      updates.email = email;
    }

    const updatedUser = await UserModel.updateById(userId, updates);

    res.json({
      message: 'User updated successfully',
      user: updatedUser.toJSON()
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: 'An error occurred while updating user'
    });
  }
});

/**
 * Delete user by ID (admin only)
 */
router.delete('/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Don't allow deleting yourself
    if (parseInt(userId) === req.user.id) {
      return res.status(400).json({
        error: 'Cannot delete self',
        message: 'You cannot delete your own account'
      });
    }
    
    const deletedUser = await UserModel.deleteById(userId);
    
    if (!deletedUser) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User with this ID does not exist'
      });
    }

    res.json({
      message: 'User deleted successfully',
      user: deletedUser.toJSON()
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: 'An error occurred while deleting user'
    });
  }
});

/**
 * Get user usage statistics
 */
router.get('/:userId/usage', authenticateToken, requireSelfOrAdmin(), async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User with this ID does not exist'
      });
    }

    const limits = user.getPlanLimits();
    
    res.json({
      usage: user.usage,
      limits: limits,
      plan: user.plan,
      utilizationPercentages: {
        trackedProducts: limits.maxTrackedProducts === -1 ? 0 : Math.round((user.usage.trackedProducts / limits.maxTrackedProducts) * 100),
        alertsToday: limits.maxAlertsPerDay === -1 ? 0 : Math.round((user.usage.alertsToday / limits.maxAlertsPerDay) * 100),
        apiCallsThisHour: limits.apiCallsPerHour === -1 ? 0 : Math.round((user.usage.apiCallsThisHour / limits.apiCallsPerHour) * 100),
        dealsThisMonth: limits.maxDealsPerMonth === -1 ? 0 : Math.round((user.usage.dealsThisMonth / limits.maxDealsPerMonth) * 100)
      }
    });

  } catch (error) {
    console.error('Error fetching user usage:', error);
    res.status(500).json({
      error: 'Failed to fetch usage',
      message: 'An error occurred while fetching user usage'
    });
  }
});

/**
 * Reset user usage (admin only)
 */
router.post('/:userId/reset-usage', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.body;
    
    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User with this ID does not exist'
      });
    }

    switch (type) {
      case 'hourly':
        user.resetHourlyUsage();
        break;
      case 'daily':
        user.resetDailyUsage();
        break;
      case 'monthly':
        user.resetMonthlyUsage();
        break;
      case 'all':
        user.resetHourlyUsage();
        user.resetDailyUsage();
        user.resetMonthlyUsage();
        user.usage.trackedProducts = 0;
        break;
      default:
        return res.status(400).json({
          error: 'Invalid reset type',
          message: 'Reset type must be one of: hourly, daily, monthly, all'
        });
    }

    res.json({
      message: `${type} usage reset successfully`,
      usage: user.usage
    });

  } catch (error) {
    console.error('Error resetting usage:', error);
    res.status(500).json({
      error: 'Failed to reset usage',
      message: 'An error occurred while resetting usage'
    });
  }
});

/**
 * Get plan information
 */
router.get('/plans/info', (req, res) => {
  res.json({
    plans: PLAN_TYPES,
    limits: PLAN_LIMITS,
    features: {
      [PLAN_TYPES.FREE]: [
        'Basic deal tracking',
        'Limited alerts',
        'Standard support'
      ],
      [PLAN_TYPES.PAID]: [
        'Advanced deal tracking',
        'Unlimited alerts',
        'Priority support',
        'Advanced analytics',
        'Custom integrations'
      ],
      [PLAN_TYPES.ADMIN]: [
        'All paid features',
        'User management',
        'System administration',
        'Advanced reporting'
      ]
    }
  });
});

/**
 * Upgrade user plan (self-service for demo purposes)
 */
router.post('/:userId/upgrade', authenticateToken, requireSelfOrAdmin(), async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan } = req.body;
    
    if (!Object.values(PLAN_TYPES).includes(plan)) {
      return res.status(400).json({
        error: 'Invalid plan',
        message: `Plan must be one of: ${Object.values(PLAN_TYPES).join(', ')}`
      });
    }

    const user = await UserModel.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: 'User with this ID does not exist'
      });
    }

    // Don't allow downgrading to admin unless you're already admin
    if (plan === PLAN_TYPES.ADMIN && req.user.plan !== PLAN_TYPES.ADMIN) {
      return res.status(403).json({
        error: 'Unauthorized',
        message: 'Cannot upgrade to admin plan'
      });
    }

    const updatedUser = await UserModel.updateById(userId, { plan });

    res.json({
      message: `Plan upgraded to ${plan} successfully`,
      user: updatedUser.toJSON()
    });

  } catch (error) {
    console.error('Error upgrading plan:', error);
    res.status(500).json({
      error: 'Failed to upgrade plan',
      message: 'An error occurred while upgrading plan'
    });
  }
});

module.exports = router;