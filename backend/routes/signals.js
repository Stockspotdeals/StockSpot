const express = require('express');
const router = express.Router();
const runSignalEngine = require('../services/signalEngine');
const Signal = require('../models/Signal');

// GET /api/signals - Get all active signals
router.get('/', async (req, res) => {
  try {
    const signals = await Signal.find({ status: 'active' })
      .populate('productId', 'name price retailer')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      signals: signals,
      count: signals.length
    });
  } catch (error) {
    console.error('Error fetching signals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch signals'
    });
  }
});

// POST /api/signals/run - Run the signal engine
router.post('/run', async (req, res) => {
  try {
    console.log('🔄 Manual signal engine run requested');

    const signalsCreated = await runSignalEngine();

    res.json({
      success: true,
      message: `Signal engine completed successfully`,
      signalsCreated: signalsCreated,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Signal engine run failed:', error);
    res.status(500).json({
      success: false,
      error: 'Signal engine run failed',
      details: error.message
    });
  }
});

// PUT /api/signals/:id/status - Update signal status
router.put('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'sent', 'expired', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid status. Must be: active, sent, expired, or cancelled'
      });
    }

    const signal = await Signal.findByIdAndUpdate(
      id,
      {
        status: status,
        ...(status === 'sent' && { sentAt: new Date() }),
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!signal) {
      return res.status(404).json({
        success: false,
        error: 'Signal not found'
      });
    }

    res.json({
      success: true,
      signal: signal
    });

  } catch (error) {
    console.error('Error updating signal status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update signal status'
    });
  }
});

// GET /api/signals/stats - Get signal statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await Signal.aggregate([
      {
        $group: {
          _id: {
            type: '$signalType',
            status: '$status'
          },
          count: { $sum: 1 },
          avgPriority: { $avg: '$priority' }
        }
      },
      {
        $group: {
          _id: '$_id.type',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count',
              avgPriority: '$avgPriority'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    res.json({
      success: true,
      stats: stats,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching signal stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch signal statistics'
    });
  }
});

module.exports = router;