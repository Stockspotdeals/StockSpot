const cron = require('node-cron');
const axios = require('axios');
const AlertSignal = require('../models/AlertSignal');
const { AlertEmailService } = require('./alertEmailService');
const { shouldExternallyDispatchAlert } = require('./SignalEnricher');

const DELIVERY_CHANNELS = {
  EMAIL: 'email',
  DASHBOARD: 'dashboard',
  WEBHOOK: 'webhook'
};

const DISPATCH_STATUS = {
  PENDING: 'pending',
  DISPATCHED: 'dispatched',
  SUPPRESSED: 'suppressed',
  FAILED: 'failed'
};

const USER_SEGMENTS = {
  FREE: 'free_user',
  PREMIUM: 'premium_user',
  ENTERPRISE: 'enterprise_user'
};

class AlertDispatcher {
  constructor() {
    this.emailService = new AlertEmailService();
    this.mediumBatchMinutes = Number(process.env.ALERT_MEDIUM_BATCH_MINUTES) || 10;
    this.freeDelayMinutes = Number(process.env.ALERT_FREE_DELAY_MINUTES) || this.mediumBatchMinutes;
    this.enterpriseWebhookEnabled = process.env.ALERT_WEBHOOK_ENABLED === 'true';
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL || '';
    this.schedulerStarted = false;
    this.stats = {
      dispatched: 0,
      suppressed: 0,
      failed: 0,
      email: 0,
      dashboard: 0,
      webhook: 0
    };
  }

  static getInitialDeliveryState(alertLike = {}) {
    const dispatcher = new AlertDispatcher();
    const plan = dispatcher.buildDispatchPlan(alertLike);
    if (plan.mode === 'suppressed') {
      return {
        dispatchStatus: DISPATCH_STATUS.SUPPRESSED,
        nextDispatchAt: null,
        dispatchedChannels: [],
        userId: alertLike.userId || null
      };
    }

    return {
      dispatchStatus: DISPATCH_STATUS.PENDING,
      nextDispatchAt: plan.nextDispatchAt,
      dispatchedChannels: [],
      userId: alertLike.userId || null
    };
  }

  resolveUserSegment(alertSignal) {
    if (alertSignal && alertSignal.userSegment && Object.values(USER_SEGMENTS).includes(alertSignal.userSegment)) {
      return alertSignal.userSegment;
    }

    if (alertSignal && alertSignal.premiumOnly) {
      return USER_SEGMENTS.PREMIUM;
    }

    return process.env.ALERT_DEFAULT_SEGMENT || USER_SEGMENTS.FREE;
  }

  buildDispatchPlan(alertSignal) {
    const tier = alertSignal.tier || 'MEDIUM';
    const userSegment = this.resolveUserSegment(alertSignal);
    const now = new Date();

    if (!shouldExternallyDispatchAlert(alertSignal)) {
      return {
        mode: 'suppressed',
        tier,
        userSegment,
        channels: [],
        nextDispatchAt: null,
        expectedLatency: 'stored only'
      };
    }

    if (tier === 'HIGH') {
      const channels = [DELIVERY_CHANNELS.DASHBOARD];
      if (userSegment !== USER_SEGMENTS.FREE) {
        channels.push(DELIVERY_CHANNELS.EMAIL);
      }
      if (userSegment === USER_SEGMENTS.ENTERPRISE && this.enterpriseWebhookEnabled) {
        channels.push(DELIVERY_CHANNELS.WEBHOOK);
      }

      return {
        mode: 'immediate',
        tier,
        userSegment,
        channels,
        nextDispatchAt: now,
        expectedLatency: '0-1 minute'
      };
    }

    const delayMinutes = userSegment === USER_SEGMENTS.FREE ? this.freeDelayMinutes : this.mediumBatchMinutes;
    const nextDispatchAt = new Date(now.getTime() + delayMinutes * 60 * 1000);
    const channels = [DELIVERY_CHANNELS.DASHBOARD, DELIVERY_CHANNELS.EMAIL];
    if (userSegment === USER_SEGMENTS.ENTERPRISE && this.enterpriseWebhookEnabled) {
      channels.push(DELIVERY_CHANNELS.WEBHOOK);
    }

    return {
      mode: 'batched',
      tier,
      userSegment,
      channels,
      nextDispatchAt,
      expectedLatency: `${delayMinutes} minutes`
    };
  }

  async handleNewAlertSignal(alertSignal) {
    if (!alertSignal) {
      return null;
    }

    if (alertSignal.dispatchStatus === DISPATCH_STATUS.DISPATCHED && alertSignal.lastDispatchedAt) {
      return { dispatched: false, skipped: true, reason: 'already dispatched' };
    }

    if (alertSignal.dispatchStatus === DISPATCH_STATUS.SUPPRESSED) {
      return { dispatched: false, skipped: true, reason: 'suppressed' };
    }

    const plan = this.buildDispatchPlan(alertSignal);
    if (plan.mode === 'immediate') {
      return this.dispatchAlertSignal(alertSignal, plan);
    }

    if (plan.mode === 'suppressed') {
      await this.markSuppressed(alertSignal, plan);
      return { dispatched: false, suppressed: true, plan };
    }

    await AlertSignal.findByIdAndUpdate(alertSignal._id, {
      $set: {
        dispatchStatus: DISPATCH_STATUS.PENDING,
        nextDispatchAt: plan.nextDispatchAt,
        updatedAt: new Date()
      }
    });

    return { dispatched: false, queued: true, plan };
  }

  async processQueuedAlerts(limit = 100) {
    const queued = await AlertSignal.find({
      dispatchStatus: DISPATCH_STATUS.PENDING,
      nextDispatchAt: { $lte: new Date() }
    })
      .sort({ nextDispatchAt: 1, createdAt: 1 })
      .limit(limit);

    const results = [];
    for (const alertSignal of queued) {
      const plan = this.buildDispatchPlan(alertSignal);
      results.push(await this.dispatchAlertSignal(alertSignal, plan));
    }

    return results;
  }

  async dispatchAlertSignal(alertSignal, plan = null) {
    const dispatchPlan = plan || this.buildDispatchPlan(alertSignal);
    if (dispatchPlan.mode === 'suppressed') {
      await this.markSuppressed(alertSignal, dispatchPlan);
      return { dispatched: false, suppressed: true, channels: [] };
    }

    const channels = [];
    try {
      for (const channel of dispatchPlan.channels) {
        if (channel === DELIVERY_CHANNELS.DASHBOARD) {
          await this.dispatchToDashboard(alertSignal, dispatchPlan);
          channels.push(channel);
          this.stats.dashboard += 1;
        } else if (channel === DELIVERY_CHANNELS.EMAIL) {
          await this.dispatchToEmail(alertSignal, dispatchPlan);
          channels.push(channel);
          this.stats.email += 1;
        } else if (channel === DELIVERY_CHANNELS.WEBHOOK) {
          await this.dispatchToWebhook(alertSignal, dispatchPlan);
          channels.push(channel);
          this.stats.webhook += 1;
        }
      }

      this.stats.dispatched += 1;
      await AlertSignal.findByIdAndUpdate(alertSignal._id, {
        $set: {
          dispatchStatus: DISPATCH_STATUS.DISPATCHED,
          lastDispatchedAt: new Date(),
          lastDispatchError: null,
          updatedAt: new Date()
        },
        $addToSet: {
          dispatchedChannels: { $each: channels }
        }
      });

      return { dispatched: true, channels, plan: dispatchPlan };
    } catch (error) {
      this.stats.failed += 1;
      await AlertSignal.findByIdAndUpdate(alertSignal._id, {
        $set: {
          dispatchStatus: DISPATCH_STATUS.FAILED,
          lastDispatchError: error.message,
          updatedAt: new Date()
        }
      });
      return { dispatched: false, error: error.message, channels, plan: dispatchPlan };
    }
  }

  async markSuppressed(alertSignal, plan) {
    this.stats.suppressed += 1;
    await AlertSignal.findByIdAndUpdate(alertSignal._id, {
      $set: {
        dispatchStatus: DISPATCH_STATUS.SUPPRESSED,
        nextDispatchAt: null,
        lastDispatchError: plan.expectedLatency,
        updatedAt: new Date()
      }
    });
  }

  async dispatchToDashboard(alertSignal, plan) {
    console.log('[AlertDispatcher] DASHBOARD', JSON.stringify({
      alertId: String(alertSignal._id),
      tier: alertSignal.tier,
      score: alertSignal.score,
      userSegment: plan.userSegment
    }));
    return { success: true };
  }

  async dispatchToEmail(alertSignal, plan) {
    const email = process.env.ALERT_DISPATCH_EMAIL || 'alerts@stockspot.local';
    return this.emailService.sendAlertEmail(
      { email },
      {
        productName: alertSignal.productName,
        title: alertSignal.productName,
        description: alertSignal.description,
        affiliateUrl: alertSignal.affiliateUrl,
        price: alertSignal.price,
        originalPrice: alertSignal.originalPrice,
        signalType: alertSignal.signalType,
        tier: alertSignal.tier,
        score: alertSignal.score,
        reasoning: alertSignal.reasoning
      },
      `${plan.tier} ${alertSignal.store}`
    );
  }

  async dispatchToWebhook(alertSignal, plan) {
    if (!this.webhookUrl) {
      console.log('[AlertDispatcher] WEBHOOK placeholder', JSON.stringify({ alertId: String(alertSignal._id), tier: alertSignal.tier }));
      return { success: true, provider: 'placeholder' };
    }

    await axios.post(this.webhookUrl, {
      id: String(alertSignal._id),
      productName: alertSignal.productName,
      store: alertSignal.store,
      signalType: alertSignal.signalType,
      score: alertSignal.score,
      tier: alertSignal.tier,
      reasoning: alertSignal.reasoning,
      createdAt: alertSignal.createdAt,
      userSegment: plan.userSegment
    }, {
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    return { success: true, provider: 'webhook' };
  }

  initializeScheduler() {
    if (this.schedulerStarted) {
      return;
    }

    this.schedulerStarted = true;
    const interval = Math.max(1, this.mediumBatchMinutes);
    cron.schedule(`*/${interval} * * * *`, async () => {
      try {
        await this.processQueuedAlerts();
      } catch (error) {
        console.error('[AlertDispatcher] Scheduled dispatch error:', error.message);
      }
    }, {
      scheduled: true,
      timezone: process.env.ALERT_DISPATCH_TZ || 'UTC'
    });

    console.log(`[AlertDispatcher] Scheduler initialized every ${interval} minute(s)`);
  }

  getStats() {
    return {
      ...this.stats,
      mediumBatchMinutes: this.mediumBatchMinutes,
      freeDelayMinutes: this.freeDelayMinutes,
      webhookEnabled: this.enterpriseWebhookEnabled
    };
  }
}

let dispatcherInstance = null;

function getAlertDispatcher() {
  if (!dispatcherInstance) {
    dispatcherInstance = new AlertDispatcher();
  }
  return dispatcherInstance;
}

function initializeAlertDispatcher() {
  const dispatcher = getAlertDispatcher();
  dispatcher.initializeScheduler();
  return dispatcher;
}

module.exports = {
  AlertDispatcher,
  getAlertDispatcher,
  initializeAlertDispatcher,
  DELIVERY_CHANNELS,
  DISPATCH_STATUS,
  USER_SEGMENTS
};