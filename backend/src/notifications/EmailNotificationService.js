const { AlertEmailService } = require('../services/alertEmailService');

class EmailNotificationService {
  constructor() {
    this.initialized = true;
    this.provider = 'resend';
    this.emailQueue = [];
    this.sentHistory = new Map();
    this.tierDelays = {
      free: parseInt(process.env.FREE_TIER_DELAY_MINUTES || 10) * 60 * 1000,
      paid: 0,
      yearly: 0
    };
    this.emailService = new AlertEmailService();
  }

  async initialize() {
    return this.initialized;
  }

  /**
   * Determine if user should be notified based on tier and delay rules
   */
  shouldNotifyUser(userTier, lastNotificationTime) {
    const tier = userTier || 'free';
    const delayMs = this.tierDelays[tier] || this.tierDelays.free;

    if (delayMs === 0) {
      // PAID/YEARLY tiers get instant notifications
      return true;
    }

    // FREE tier: check if delay has elapsed
    if (!lastNotificationTime) return true;

    const timeSinceLastNotification = Date.now() - lastNotificationTime;
    return timeSinceLastNotification >= delayMs;
  }

  /**
   * Get notification delay for a tier in milliseconds
   */
  getNotificationDelay(userTier) {
    const tier = userTier || 'free';
    return this.tierDelays[tier] || this.tierDelays.free;
  }

  /**
   * Queue email for sending
   */
  queueEmail(userEmail, subject, data, userTier = 'free', options = {}) {
    const emailId = `${userEmail}_${Date.now()}`;
    const delay = this.getNotificationDelay(userTier);

    this.emailQueue.push({
      id: emailId,
      to: userEmail,
      subject,
      data,
      tier: userTier,
      scheduleTime: Date.now() + delay,
      attempts: 0,
      maxAttempts: 3,
      ...options
    });

    console.log(`📬 Email queued for ${userEmail} (tier: ${userTier}, delay: ${delay / 1000 / 60}min)`);
    return emailId;
  }

  /**
   * Process email queue
   */
  async processQueue() {
    const now = Date.now();
    const readyEmails = this.emailQueue.filter(e => e.scheduleTime <= now);

    for (const email of readyEmails) {
      try {
        await this.sendEmail(email.to, email.subject, email.data, email.tier);
        this.emailQueue = this.emailQueue.filter(e => e.id !== email.id);
      } catch (error) {
        email.attempts += 1;

        if (email.attempts >= email.maxAttempts) {
          console.error(`❌ Email to ${email.to} failed after ${email.maxAttempts} attempts:`, error.message);
          this.emailQueue = this.emailQueue.filter(e => e.id !== email.id);
        } else {
          // Exponential backoff
          email.scheduleTime = now + (Math.pow(2, email.attempts) * 60000);
          console.warn(`⚠️  Email retry ${email.attempts}/${email.maxAttempts} for ${email.to}`);
        }
      }
    }
  }

  /**
   * Send email notification
   */
  async sendEmail(userEmail, subject, itemData, userTier = 'free') {
    if (!process.env.EMAIL_ENABLED || process.env.EMAIL_ENABLED === 'false') {
      console.log(`🔒 Email notifications disabled for ${userEmail}`);
      return { success: true, mode: 'disabled' };
    }

    if (process.env.DRY_RUN) {
      console.log(`✉️  [DRY-RUN] Email to ${userEmail}: "${subject}"`);
      console.log(`    Item: ${itemData.title}`);
      console.log(`    Tier: ${userTier}`);
      return { success: true, mode: 'dry-run' };
    }

    await this.initialize();

    const html = this.generateEmailHTML(itemData, userTier);
    const text = this.generateEmailText(itemData, userTier);

    try {
      return await this.emailService.sendEmail({
        to: userEmail,
        subject,
        html,
        text,
        dryRunLabel: 'notification service email'
      });
    } catch (error) {
      console.error(`Failed to send email to ${userEmail}:`, error.message);
      throw error;
    }
  }

  /**
   * Generate HTML email template
   */
  generateEmailHTML(item, userTier) {
    const affiliateLink = item.affiliateLink || item.link;
    const tierBadge = userTier === 'yearly' ? '⭐ YEARLY MEMBER' : userTier === 'paid' ? '💎 PAID MEMBER' : '';

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { background: white; padding: 20px; margin: 15px 0; border-radius: 8px; border-left: 4px solid #667eea; }
    .item-title { font-size: 18px; font-weight: bold; color: #667eea; margin: 10px 0; }
    .item-price { font-size: 24px; font-weight: bold; color: #27ae60; margin: 10px 0; }
    .item-details { font-size: 14px; color: #666; margin: 10px 0; }
    .badge { display: inline-block; background: #ffc107; color: #000; padding: 5px 10px; border-radius: 4px; font-weight: bold; font-size: 12px; margin: 10px 0; }
    .cta-button { display: inline-block; background: #667eea; color: white; padding: 12px 30px; border-radius: 4px; text-decoration: none; font-weight: bold; margin: 15px 0; }
    .footer { text-align: center; font-size: 12px; color: #999; margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; }
    .tier-info { background: #f0f0f0; padding: 10px; border-radius: 4px; margin: 10px 0; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🎯 StockSpot Deal Alert</h1>
      <p>A new deal just for you!</p>
    </div>

    <div class="content">
      <div class="item-title">${item.title || 'Untitled Item'}</div>
      <div class="item-price">$${item.price || '0.00'}</div>
      
      ${item.originalPrice ? `<div class="item-details">Originally: $${item.originalPrice}</div>` : ''}
      ${item.discount ? `<div class="item-details">Discount: ${item.discount}%</div>` : ''}
      
      <div class="item-details">
        <strong>Retailer:</strong> ${item.retailer || 'Unknown'}<br>
        <strong>Category:</strong> ${item.category || 'General'}<br>
        <strong>Status:</strong> ${item.itemType || 'Available'}
      </div>

      ${tierBadge ? `<div class="badge">${tierBadge}</div>` : ''}

      <div class="tier-info">
        <strong>Your Tier:</strong> ${userTier.toUpperCase()}<br>
        ${userTier === 'free' ? `Getting alerts with ${process.env.FREE_TIER_DELAY_MINUTES || 10}-minute delay` : 'Getting instant alerts!'}
      </div>

      <a href="${affiliateLink}" class="cta-button">View Deal →</a>
    </div>

    <div class="footer">
      <p>StockSpot © 2025 | <a href="#" style="color: #667eea;">Manage Preferences</a> | <a href="#" style="color: #667eea;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>
    `;
  }

  generateEmailText(item, userTier) {
    return [
      'StockSpot Deal Alert',
      `Title: ${item.title || 'Untitled Item'}`,
      `Price: $${item.price || '0.00'}`,
      `Retailer: ${item.retailer || 'Unknown'}`,
      `Category: ${item.category || 'General'}`,
      `Tier: ${String(userTier || 'free').toUpperCase()}`
    ].join('\n');
  }

  /**
   * Get queue statistics
   */
  getQueueStats() {
    return {
      queued: this.emailQueue.length,
      sent: this.sentHistory.size,
      queue: this.emailQueue.map(e => ({
        to: e.to,
        subject: e.subject,
        tier: e.tier,
        attempts: e.attempts,
        scheduledIn: Math.max(0, (e.scheduleTime - Date.now()) / 1000 / 60).toFixed(1) + ' min'
      }))
    };
  }
}

module.exports = { EmailNotificationService };
