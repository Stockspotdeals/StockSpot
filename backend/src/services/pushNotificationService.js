const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:support@stockspotdeals.com';

let vapidConfigured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  vapidConfigured = true;
} else {
  console.warn('[PushNotificationService] VAPID keys are not configured. Push notifications are disabled.');
}

const normalizeSubscription = (subscription) => {
  if (!subscription || !subscription.endpoint || !subscription.keys) {
    return null;
  }

  return {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth
    },
    expirationTime: subscription.expirationTime ? new Date(subscription.expirationTime) : null
  };
};

const sendPushNotification = async (subscription, payload) => {
  if (!vapidConfigured) {
    return { success: false, reason: 'VAPID not configured' };
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return { success: true };
  } catch (error) {
    const statusCode = error.statusCode || (error.body && error.body.statusCode);
    if (statusCode === 404 || statusCode === 410) {
      return { success: false, reason: 'Subscription no longer valid', invalid: true };
    }
    return { success: false, reason: error.message || 'Push send failed' };
  }
};

const sendAlertPushNotification = async (userId, payload) => {
  if (!vapidConfigured) {
    console.warn('[PushNotificationService] Skipping push send because VAPID is not configured');
    return { success: false, reason: 'VAPID not configured' };
  }

  const subscriptions = await PushSubscription.find({ userId }).lean();
  if (!subscriptions.length) {
    return { success: false, reason: 'No push subscriptions found' };
  }

  const results = [];
  for (const subscription of subscriptions) {
    const normalized = normalizeSubscription(subscription);
    if (!normalized) {
      continue;
    }

    const result = await sendPushNotification(normalized, payload);
    results.push({ subscriptionId: subscription._id, ...result });

    if (result.invalid) {
      try {
        await PushSubscription.deleteOne({ _id: subscription._id });
        console.log('[PushNotificationService] Removed invalid push subscription:', subscription._id);
      } catch (removeError) {
        console.error('[PushNotificationService] Failed to remove invalid subscription:', removeError.message);
      }
    }
  }

  return results;
};

module.exports = {
  sendAlertPushNotification,
  VAPID_PUBLIC_KEY
};
