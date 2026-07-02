const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const PushSubscription = require('../models/PushSubscription');

router.get('/vapid-public-key', async (req, res) => {
  res.json({
    success: true,
    publicKey: process.env.VAPID_PUBLIC_KEY || ''
  });
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const subscriptions = await PushSubscription.find({ userId: req.user._id }).lean();
    res.json({ success: true, subscriptions });
  } catch (error) {
    console.error('Failed to load push subscriptions:', error.message);
    res.status(500).json({ success: false, error: 'Failed to load push subscriptions' });
  }
});

router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const subscription = req.body.subscription;
    if (!subscription || !subscription.endpoint || !subscription.keys || !subscription.keys.p256dh || !subscription.keys.auth) {
      return res.status(400).json({ success: false, error: 'Invalid push subscription payload' });
    }

    const saved = await PushSubscription.findOneAndUpdate(
      { userId: req.user._id, endpoint: subscription.endpoint },
      {
        userId: req.user._id,
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth
        },
        expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(201).json({ success: true, subscription: saved });
  } catch (error) {
    console.error('Failed to save push subscription:', error.message);
    res.status(500).json({ success: false, error: 'Failed to save push subscription' });
  }
});

router.delete('/unsubscribe', authenticateToken, async (req, res) => {
  try {
    const endpoint = (req.body.endpoint || req.query.endpoint || '').trim();
    if (!endpoint) {
      return res.status(400).json({ success: false, error: 'Subscription endpoint is required' });
    }

    await PushSubscription.findOneAndDelete({ userId: req.user._id, endpoint });
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to remove push subscription:', error.message);
    res.status(500).json({ success: false, error: 'Failed to remove push subscription' });
  }
});

module.exports = router;
