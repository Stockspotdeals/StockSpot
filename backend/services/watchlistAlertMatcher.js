const Watchlist = require('../models/Watchlist');
const Alert = require('../models/Alert');
const { AuthUserModel } = require('../models/AuthUser');
const { AlertEmailService } = require('./alertEmailService');
const { sendAlertPushNotification } = require('./pushNotificationService');

const emailService = new AlertEmailService();

function matchesWatchlist(text, keyword) {
  if (!text || !keyword) return false;
  return text.toLowerCase().includes(keyword.toLowerCase());
}

async function processSignalWatchlistAlerts(signal) {
  if (!signal || (!signal.productName && !signal.title)) {
    return 0;
  }

  let alertsCreated = 0;

  try {
    const watchlists = await Watchlist.find().lean();
    if (!watchlists.length) {
      return 0;
    }

    const matchableText = `${signal.productName || ''} ${signal.title || ''}`.toLowerCase();
    const matches = watchlists.filter(entry => matchesWatchlist(matchableText, entry.keyword));
    if (!matches.length) {
      return 0;
    }

    const userIds = [...new Set(matches.map(entry => entry.userId.toString()))];
    const existingAlerts = await Alert.find({
      signalId: signal._id,
      userId: { $in: userIds }
    }).lean();

    for (const watchlist of matches) {
      const alreadyExists = existingAlerts.some(alert =>
        alert.userId.toString() === watchlist.userId.toString() &&
        alert.keyword.toLowerCase() === watchlist.keyword.toLowerCase()
      );

      if (alreadyExists) {
        continue;
      }

      const user = await AuthUserModel.findById(watchlist.userId).lean();
      if (!user || !user.email) {
        continue;
      }

      const alertCount = await Alert.countDocuments({ userId: watchlist.userId });
      const isFreeUser = user.subscriptionStatus !== 'premium';
      if (isFreeUser && alertCount >= 10) {
        console.log(`Skipping alert for free user ${user.email}: active alert limit reached`);
        continue;
      }

      const alert = await Alert.create({
        userId: watchlist.userId,
        signalId: signal._id,
        keyword: watchlist.keyword,
        delivered: false,
        metadata: {
          signalType: signal.signalType,
          productName: signal.productName,
          createdAt: signal.createdAt
        }
      });

      alertsCreated += 1;
      console.log(`Alert created for user ${user.email} matching keyword "${watchlist.keyword}" on signal ${signal._id}`);

      try {
        const result = await emailService.sendAlertEmail(user, signal, watchlist.keyword);
        if (result && result.success) {
          alert.delivered = true;
          await alert.save();
          console.log(`Email alert delivered to ${user.email} using ${result.provider}`);
        }
      } catch (emailError) {
        console.error(`Failed to send alert email to ${user.email}:`, emailError.message);
      }

      try {
        const pushPayload = {
          title: `StockSpot Alert: ${watchlist.keyword}`,
          body: `${signal.productName || signal.title} matched your watchlist keyword.`,
          icon: '/images/icon-192x192.png',
          url: signal.affiliateUrl || '/dashboard.html',
          data: {
            signalId: signal._id,
            keyword: watchlist.keyword
          }
        };

        const pushResults = await sendAlertPushNotification(watchlist.userId, pushPayload);
        if (Array.isArray(pushResults) && pushResults.length) {
          console.log(`Push alert results for ${user.email}:`, pushResults.map(r => ({ subscriptionId: r.subscriptionId, success: r.success })));
        }
      } catch (pushError) {
        console.error(`Failed to send push alert to ${user.email}:`, pushError.message || pushError);
      }
    }
  } catch (error) {
    console.error('Error processing watchlist alerts:', error.message);
  }

  return alertsCreated;
}

module.exports = {
  processSignalWatchlistAlerts
};
