const { AlertEmailService } = require('../services/alertEmailService');

class EmailProvider {
  constructor() {
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.emailService = new AlertEmailService();
  }

  /**
   * Send notification email to user
   */
  async sendNotificationEmail(user, items) {
    if (this.isDryRun) {
      return this.dryRunEmail(user, items);
    }
    return this.emailService.sendNotificationEmail(user, items);
  }

  /**
   * Dry-run email (log without sending)
   */
  dryRunEmail(user, items) {
    console.log(`\n📧 [DRY-RUN] Email would be sent to: ${user.email}`);
    console.log(`   Subject: 🎉 ${items.length} New Deal${items.length > 1 ? 's' : ''} - StockSpot`);
    console.log(`   Items: ${items.length}`);
    items.slice(0, 3).forEach(item => {
      console.log(`     • ${item.name} (${item.retailer}) - $${item.price} (${item.discount}% off)`);
    });
    if (items.length > 3) {
      console.log(`     ... and ${items.length - 3} more items`);
    }

    return {
      success: true,
      count: items.length,
      provider: 'dry-run'
    };
  }

}

module.exports = { EmailProvider };
