const cron = require('node-cron');
const axios = require('axios');
const AlertSignal = require('../models/AlertSignal');
const { AuthUserModel } = require('../models/AuthUser');
const { AlertEmailService } = require('./alertEmailService');
const { shouldExternallyDispatchAlert } = require('./SignalEnricher');

const DELIVERY_CHANNELS = {
  EMAIL: 'email',
  DASHBOARD: 'dashboard',
  WEBHOOK: 'webhook'
};

const DISPATCH_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DISPATCHED: 'dispatched',
  SUPPRESSED: 'suppressed',
  FAILED: 'failed'
};

const SUBSCRIPTION_PLANS = {
  FREE: 'free',
  PREMIUM: 'premium',
  ENTERPRISE: 'enterprise'
};

const QUEUE_LANES = {
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  NONE: 'none'
};

const USER_SEGMENTS = {
  FREE: 'free_user',
  PREMIUM: 'premium_user',
  ENTERPRISE: 'enterprise_user'
};

const QUEUE_PRIORITY = {
  [QUEUE_LANES.HIGH]: 0,
  [QUEUE_LANES.MEDIUM]: 1,
  [QUEUE_LANES.LOW]: 2,
  [QUEUE_LANES.NONE]: 3
};

class AlertDispatcher {
  constructor() {
    this.emailService = new AlertEmailService();
    this.mediumBatchMinutes = Number(process.env.ALERT_MEDIUM_BATCH_MINUTES) || 10;
    this.freeDelayMinutes = Number(process.env.ALERT_FREE_DELAY_MINUTES) || this.mediumBatchMinutes;
    this.freeHighDelayMinutes = Number(process.env.ALERT_FREE_HIGH_DELAY_MINUTES) || this.freeDelayMinutes;
    this.premiumMediumBatchMinutes = Number(process.env.ALERT_PREMIUM_MEDIUM_BATCH_MINUTES) || this.mediumBatchMinutes;
    this.enterpriseMediumBatchMinutes = Number(process.env.ALERT_ENTERPRISE_MEDIUM_BATCH_MINUTES) || 2;
    this.enterpriseLowBatchMinutes = Number(process.env.ALERT_ENTERPRISE_LOW_BATCH_MINUTES) || this.enterpriseMediumBatchMinutes;
    this.enterpriseLowEnabled = process.env.ALERT_ENTERPRISE_LOW_ENABLED === 'true';
    this.webhookUrl = process.env.ALERT_WEBHOOK_URL || '';
    this.processingLeaseMs = Number(process.env.ALERT_DISPATCH_LEASE_MS) || (5 * 60 * 1000);
    this.retryBaseMinutes = Number(process.env.ALERT_RETRY_BASE_MINUTES) || 2;
    this.retryMaxMinutes = Number(process.env.ALERT_RETRY_MAX_MINUTES) || 30;
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

  static normalizePlan(planLike, subscriptionStatus = null) {
    const normalizedPlan = String(planLike || '').trim().toLowerCase();
    if (normalizedPlan === 'enterprise' || normalizedPlan === 'enterprise_user' || normalizedPlan === 'admin') {
      return SUBSCRIPTION_PLANS.ENTERPRISE;
    }
    if (normalizedPlan === 'premium' || normalizedPlan === 'paid' || normalizedPlan === 'premium_user') {
      return SUBSCRIPTION_PLANS.PREMIUM;
    }
    if (String(subscriptionStatus || '').trim().toLowerCase() === 'premium') {
      return SUBSCRIPTION_PLANS.PREMIUM;
    }
    return SUBSCRIPTION_PLANS.FREE;
  }

  static resolveUserSegmentFromPlan(plan) {
    if (plan === SUBSCRIPTION_PLANS.ENTERPRISE) {
      return USER_SEGMENTS.ENTERPRISE;
    }
    if (plan === SUBSCRIPTION_PLANS.PREMIUM) {
      return USER_SEGMENTS.PREMIUM;
    }
    return USER_SEGMENTS.FREE;
  }

  static resolveQueueLane(tier) {
    if (tier === 'HIGH') return QUEUE_LANES.HIGH;
    if (tier === 'LOW') return QUEUE_LANES.LOW;
    return QUEUE_LANES.MEDIUM;
  }

  static buildDispatchKey(alertSignal, plan) {
    const sourceId = alertSignal && alertSignal.sourceSignalId ? String(alertSignal.sourceSignalId) : String(alertSignal && alertSignal._id ? alertSignal._id : 'unknown');
    return [sourceId, plan.plan, plan.queueLane, plan.tier].join(':');
  }

  static getInitialDeliveryState(alertLike = {}) {
    const dispatcher = new AlertDispatcher();
    const plan = dispatcher.buildDispatchPlanForContext({
      tier: alertLike.tier || 'MEDIUM',
      plan: AlertDispatcher.normalizePlan(alertLike.plan, alertLike.subscriptionStatus),
      externallyDispatchable: shouldExternallyDispatchAlert(alertLike)
    });

    if (plan.mode === 'suppressed') {
      return {
        dispatchStatus: DISPATCH_STATUS.SUPPRESSED,
        nextDispatchAt: null,
        dispatchedChannels: [],
        userId: alertLike.userId || null,
        plan: plan.plan,
        queueLane: plan.queueLane,
        deliveryMode: plan.mode
      };
    }

    return {
      dispatchStatus: DISPATCH_STATUS.PENDING,
      nextDispatchAt: plan.nextDispatchAt,
      dispatchedChannels: [],
      userId: alertLike.userId || null,
      plan: plan.plan,
      queueLane: plan.queueLane,
      deliveryMode: plan.mode
    };
  }

  async resolvePlan(alertSignal) {
    const directPlan = AlertDispatcher.normalizePlan(alertSignal && alertSignal.plan, alertSignal && alertSignal.subscriptionStatus);
    if (!alertSignal || !alertSignal.userId || directPlan !== SUBSCRIPTION_PLANS.FREE) {
      return directPlan;
    }

    try {
      const authUser = await AuthUserModel.findById(alertSignal.userId);
      return AlertDispatcher.normalizePlan(authUser && authUser.plan, authUser && authUser.subscriptionStatus);
    } catch (error) {
      return directPlan;
    }
  }

  buildDispatchPlanForContext({ tier = 'MEDIUM', plan = SUBSCRIPTION_PLANS.FREE, externallyDispatchable = true }) {
    const normalizedPlan = AlertDispatcher.normalizePlan(plan);
    const queueLane = AlertDispatcher.resolveQueueLane(tier);
    const userSegment = AlertDispatcher.resolveUserSegmentFromPlan(normalizedPlan);
    const now = new Date();

    if (!externallyDispatchable) {
      return {
        mode: 'suppressed',
        tier,
        plan: normalizedPlan,
        userSegment,
        queueLane,
        channels: [],
        nextDispatchAt: null,
        expectedLatency: 'stored only'
      };
    }

    if (tier === 'LOW') {
      if (normalizedPlan === SUBSCRIPTION_PLANS.ENTERPRISE && this.enterpriseLowEnabled) {
        const nextDispatchAt = new Date(now.getTime() + this.enterpriseLowBatchMinutes * 60 * 1000);
        return {
          mode: 'batched',
          tier,
          plan: normalizedPlan,
          userSegment,
          queueLane,
          channels: [DELIVERY_CHANNELS.DASHBOARD, DELIVERY_CHANNELS.EMAIL, DELIVERY_CHANNELS.WEBHOOK],
          nextDispatchAt,
          expectedLatency: `${this.enterpriseLowBatchMinutes} minutes`
        };
      }

      return {
        mode: 'suppressed',
        tier,
        plan: normalizedPlan,
        userSegment,
        queueLane,
        channels: [],
        nextDispatchAt: null,
        expectedLatency: 'stored only'
      };
    }

    if (tier === 'HIGH') {
      if (normalizedPlan === SUBSCRIPTION_PLANS.FREE) {
        const nextDispatchAt = new Date(now.getTime() + this.freeHighDelayMinutes * 60 * 1000);
        return {
          mode: 'batched',
          tier,
          plan: normalizedPlan,
          userSegment,
          queueLane,
          channels: [DELIVERY_CHANNELS.DASHBOARD],
          nextDispatchAt,
          expectedLatency: `${this.freeHighDelayMinutes} minutes`
        };
      }

      const channels = [DELIVERY_CHANNELS.DASHBOARD, DELIVERY_CHANNELS.EMAIL];
      if (normalizedPlan === SUBSCRIPTION_PLANS.ENTERPRISE) {
        channels.push(DELIVERY_CHANNELS.WEBHOOK);
      }

      return {
        mode: 'immediate',
        tier,
        plan: normalizedPlan,
        userSegment,
        queueLane,
        channels,
        nextDispatchAt: now,
        expectedLatency: '0-1 minute'
      };
    }

    if (normalizedPlan === SUBSCRIPTION_PLANS.FREE) {
      const nextDispatchAt = new Date(now.getTime() + this.freeDelayMinutes * 60 * 1000);
      return {
        mode: 'batched',
        tier,
        plan: normalizedPlan,
        userSegment,
        queueLane,
        channels: [DELIVERY_CHANNELS.DASHBOARD],
        nextDispatchAt,
        expectedLatency: `${this.freeDelayMinutes} minutes`
      };
    }

    if (normalizedPlan === SUBSCRIPTION_PLANS.PREMIUM) {
      const nextDispatchAt = new Date(now.getTime() + this.premiumMediumBatchMinutes * 60 * 1000);
      return {
        mode: 'batched',
        tier,
        plan: normalizedPlan,
        userSegment,
        queueLane,
        channels: [DELIVERY_CHANNELS.DASHBOARD, DELIVERY_CHANNELS.EMAIL],
        nextDispatchAt,
        expectedLatency: `${this.premiumMediumBatchMinutes} minutes`
      };
    }

    const nextDispatchAt = new Date(now.getTime() + this.enterpriseMediumBatchMinutes * 60 * 1000);
    return {
      mode: this.enterpriseMediumBatchMinutes <= 1 ? 'immediate' : 'batched',
      tier,
      plan: normalizedPlan,
      userSegment,
      queueLane,
      channels: [DELIVERY_CHANNELS.DASHBOARD, DELIVERY_CHANNELS.EMAIL, DELIVERY_CHANNELS.WEBHOOK],
      nextDispatchAt: this.enterpriseMediumBatchMinutes <= 1 ? now : nextDispatchAt,
      expectedLatency: this.enterpriseMediumBatchMinutes <= 1 ? '0-1 minute' : `${this.enterpriseMediumBatchMinutes} minutes`
    };
  }

  async buildDispatchPlan(alertSignal) {
    const tier = alertSignal && alertSignal.tier ? alertSignal.tier : 'MEDIUM';
    const plan = await this.resolvePlan(alertSignal);
    return this.buildDispatchPlanForContext({
      tier,
      plan,
      externallyDispatchable: shouldExternallyDispatchAlert(alertSignal)
    });
  }

  async handleNewAlertSignal(alertSignal) {
    if (!alertSignal) {
      return null;
    }

    const plan = await this.buildDispatchPlan(alertSignal);
    const dispatchKey = AlertDispatcher.buildDispatchKey(alertSignal, plan);

    if (alertSignal.dispatchStatus === DISPATCH_STATUS.DISPATCHED && alertSignal.lastDispatchKey === dispatchKey && alertSignal.lastDispatchedAt) {
      return { dispatched: false, skipped: true, reason: 'already dispatched', plan };
    }

    if (plan.mode === 'suppressed') {
      await this.markSuppressed(alertSignal, plan);
      return { dispatched: false, suppressed: true, plan };
    }

    if (plan.mode === 'immediate') {
      return this.dispatchAlertSignal(alertSignal, plan);
    }

    await AlertSignal.findByIdAndUpdate(alertSignal._id, {
      $set: {
        dispatchStatus: DISPATCH_STATUS.PENDING,
        plan: plan.plan,
        queueLane: plan.queueLane,
        deliveryMode: plan.mode,
        nextDispatchAt: plan.nextDispatchAt,
        dispatchLockedAt: null,
        dispatchLeaseExpiresAt: null,
        updatedAt: new Date()
      }
    });

    return { dispatched: false, queued: true, plan };
  }

  async processQueuedAlerts(limit = 100) {
    const now = new Date();
    const queued = await AlertSignal.find({
      dispatchStatus: { $in: [DISPATCH_STATUS.PENDING, DISPATCH_STATUS.FAILED] },
      nextDispatchAt: { $lte: now }
    })
      .sort({ nextDispatchAt: 1, createdAt: 1 })
      .limit(limit);

    queued.sort((left, right) => {
      const leftPriority = QUEUE_PRIORITY[left.queueLane || QUEUE_LANES.NONE] ?? QUEUE_PRIORITY[QUEUE_LANES.NONE];
      const rightPriority = QUEUE_PRIORITY[right.queueLane || QUEUE_LANES.NONE] ?? QUEUE_PRIORITY[QUEUE_LANES.NONE];
      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      const leftTime = new Date(left.nextDispatchAt || left.createdAt).getTime();
      const rightTime = new Date(right.nextDispatchAt || right.createdAt).getTime();
      return leftTime - rightTime;
    });

    const results = [];
    for (const alertSignal of queued) {
      const plan = await this.buildDispatchPlan(alertSignal);
      results.push(await this.dispatchAlertSignal(alertSignal, plan));
    }

    return results;
  }

  async claimAlertSignalForDispatch(alertSignal, plan) {
    if (!alertSignal || !alertSignal._id) {
      return null;
    }

    const now = new Date();
    const dispatchKey = AlertDispatcher.buildDispatchKey(alertSignal, plan);
    const leaseExpiresAt = new Date(now.getTime() + this.processingLeaseMs);

    return AlertSignal.findOneAndUpdate({
      _id: alertSignal._id,
      dispatchStatus: { $in: [DISPATCH_STATUS.PENDING, DISPATCH_STATUS.FAILED, DISPATCH_STATUS.PROCESSING] },
      $or: [
        { nextDispatchAt: null },
        { nextDispatchAt: { $lte: now } }
      ],
      $and: [
        {
          $or: [
            { dispatchStatus: { $ne: DISPATCH_STATUS.PROCESSING } },
            { dispatchLeaseExpiresAt: { $lte: now } },
            { dispatchLeaseExpiresAt: null }
          ]
        },
        {
          $or: [
            { lastDispatchKey: null },
            { lastDispatchKey: { $ne: dispatchKey } }
          ]
        }
      ]
    }, {
      $set: {
        dispatchStatus: DISPATCH_STATUS.PROCESSING,
        dispatchLockedAt: now,
        dispatchLeaseExpiresAt: leaseExpiresAt,
        plan: plan.plan,
        queueLane: plan.queueLane,
        deliveryMode: plan.mode,
        updatedAt: now
      },
      $inc: {
        dispatchAttemptCount: 1
      }
    }, {
      new: true
    });
  }

  async dispatchAlertSignal(alertSignal, plan = null) {
    const dispatchPlan = plan || await this.buildDispatchPlan(alertSignal);
    if (dispatchPlan.mode === 'suppressed') {
      await this.markSuppressed(alertSignal, dispatchPlan);
      return { dispatched: false, suppressed: true, channels: [] };
    }

    const claimedAlertSignal = await this.claimAlertSignalForDispatch(alertSignal, dispatchPlan);
    if (!claimedAlertSignal) {
      return { dispatched: false, skipped: true, reason: 'claim-not-acquired', plan: dispatchPlan };
    }

    const channels = [];
    try {
      for (const channel of dispatchPlan.channels) {
        if (channel === DELIVERY_CHANNELS.DASHBOARD) {
          await this.dispatchToDashboard(claimedAlertSignal, dispatchPlan);
          channels.push(channel);
          this.stats.dashboard += 1;
        } else if (channel === DELIVERY_CHANNELS.EMAIL) {
          await this.dispatchToEmail(claimedAlertSignal, dispatchPlan);
          channels.push(channel);
          this.stats.email += 1;
        } else if (channel === DELIVERY_CHANNELS.WEBHOOK) {
          await this.dispatchToWebhook(claimedAlertSignal, dispatchPlan);
          channels.push(channel);
          this.stats.webhook += 1;
        }
      }

      this.stats.dispatched += 1;
      await AlertSignal.findByIdAndUpdate(claimedAlertSignal._id, {
        $set: {
          dispatchStatus: DISPATCH_STATUS.DISPATCHED,
          lastDispatchedAt: new Date(),
          lastDispatchError: null,
          lastDispatchKey: AlertDispatcher.buildDispatchKey(claimedAlertSignal, dispatchPlan),
          dispatchLockedAt: null,
          dispatchLeaseExpiresAt: null,
          plan: dispatchPlan.plan,
          queueLane: dispatchPlan.queueLane,
          deliveryMode: dispatchPlan.mode,
          nextDispatchAt: null,
          updatedAt: new Date()
        },
        $addToSet: {
          dispatchedChannels: { $each: channels }
        }
      });

      return { dispatched: true, channels, plan: dispatchPlan };
    } catch (error) {
      this.stats.failed += 1;
      const currentAttempts = claimedAlertSignal.dispatchAttemptCount || 1;
      await AlertSignal.findByIdAndUpdate(claimedAlertSignal._id, {
        $set: {
          dispatchStatus: DISPATCH_STATUS.FAILED,
          lastDispatchError: error.message,
          nextDispatchAt: this.computeRetryAt(currentAttempts),
          dispatchLockedAt: null,
          dispatchLeaseExpiresAt: null,
          plan: dispatchPlan.plan,
          queueLane: dispatchPlan.queueLane,
          deliveryMode: dispatchPlan.mode,
          updatedAt: new Date()
        }
      });

      return { dispatched: false, error: error.message, channels, plan: dispatchPlan };
    }
  }

  computeRetryAt(attemptCount) {
    const safeAttemptCount = Math.max(1, Number(attemptCount) || 1);
    const delayMinutes = Math.min(this.retryMaxMinutes, this.retryBaseMinutes * (2 ** (safeAttemptCount - 1)));
    return new Date(Date.now() + delayMinutes * 60 * 1000);
  }

  async markSuppressed(alertSignal, plan) {
    this.stats.suppressed += 1;
    await AlertSignal.findByIdAndUpdate(alertSignal._id, {
      $set: {
        dispatchStatus: DISPATCH_STATUS.SUPPRESSED,
        plan: plan.plan,
        queueLane: plan.queueLane,
        deliveryMode: plan.mode,
        nextDispatchAt: null,
        lastDispatchError: plan.expectedLatency,
        dispatchLockedAt: null,
        dispatchLeaseExpiresAt: null,
        updatedAt: new Date()
      }
    });
  }

  async dispatchToDashboard(alertSignal, plan) {
    console.log('[AlertDispatcher] DASHBOARD', JSON.stringify({
      alertId: String(alertSignal._id),
      tier: alertSignal.tier,
      score: alertSignal.score,
      plan: plan.plan,
      userSegment: plan.userSegment,
      queueLane: plan.queueLane
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
        plan: plan.plan,
        tier: alertSignal.tier,
        score: alertSignal.score,
        reasoning: alertSignal.reasoning
      },
      `${plan.tier} ${alertSignal.store}`
    );
  }

  async dispatchToWebhook(alertSignal, plan) {
    if (!this.webhookUrl) {
      console.log('[AlertDispatcher] WEBHOOK placeholder', JSON.stringify({ alertId: String(alertSignal._id), tier: alertSignal.tier, plan: plan.plan }));
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
      plan: plan.plan,
      queueLane: plan.queueLane,
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
    const interval = 1;
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
      freeHighDelayMinutes: this.freeHighDelayMinutes,
      premiumMediumBatchMinutes: this.premiumMediumBatchMinutes,
      enterpriseMediumBatchMinutes: this.enterpriseMediumBatchMinutes,
      enterpriseLowEnabled: this.enterpriseLowEnabled,
      processingLeaseMs: this.processingLeaseMs,
      retryBaseMinutes: this.retryBaseMinutes,
      retryMaxMinutes: this.retryMaxMinutes,
      queueStructure: {
        high: 'priority queue',
        medium: 'scheduled batch queue',
        low: this.enterpriseLowEnabled ? 'enterprise-only optional queue' : 'stored only'
      }
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
  USER_SEGMENTS,
  SUBSCRIPTION_PLANS,
  QUEUE_LANES
};