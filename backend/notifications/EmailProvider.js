/**
 * EmailProvider - Multi-provider email sending (SendGrid or Nodemailer)
 */

const nodemailer = require('nodemailer');

class EmailProvider {
  constructor() {
    this.isDryRun = process.env.DRY_RUN === 'true';
    this.provider = this.initializeProvider();
  }

  /**
   * Initialize email provider based on env vars
   */
  initializeProvider() {
    const emailService = process.env.EMAIL_SERVICE || 'sendgrid';

    if (emailService.toLowerCase() === 'sendgrid' && process.env.SENDGRID_API_KEY) {
      return {
        type: 'sendgrid',
        apiKey: process.env.SENDGRID_API_KEY
      };
    } else if (emailService.toLowerCase() === 'nodemailer') {
      return {
        type: 'nodemailer',
        transporter: nodemailer.createTransport({
          service: process.env.EMAIL_SMTP_SERVICE || 'gmail',
          auth: {
            user: process.env.EMAIL_FROM,
            pass: process.env.EMAIL_PASSWORD
          }
        })
      };
    } else {
      console.warn('⚠️ No valid email provider configured, using dry-run mode');
      return { type: 'dry-run' };
    }
  }

  /**
   * Send notification email to user
   */
  async sendNotificationEmail(user, items) {
    if (this.isDryRun || this.provider.type === 'dry-run') {
      return this.dryRunEmail(user, items);
    }

    if (this.provider.type === 'sendgrid') {
      return this.sendViasendGrid(user, items);
    } else if (this.provider.type === 'nodemailer') {
      return this.sendViaNodemailer(user, items);
    }

    throw new Error('No email provider configured');
  }

  /**
   * Send via SendGrid
   */
  async sendViasgridSendGrid(user, items) {
    try {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(this.provider.apiKey);

      const emailContent = this.buildEmailContent(user, items);

      await sgMail.send({
        to: user.email,
        from: process.env.EMAIL_FROM || 'noreply@stockspot.com',
        subject: `🎉 ${items.length} New Deal${items.length > 1 ? 's' : ''} - StockSpot`,
        html: emailContent.html,
        text: emailContent.text
      });

      return {
        success: true,
        count: items.length,
        provider: 'sendgrid'
      };
    } catch (error) {
      throw new Error(`SendGrid error: ${error.message}`);
    }
  }

  /**
   * Send via Nodemailer
   */
  async sendViaNodemailer(user, items) {
    try {
      const emailContent = this.buildEmailContent(user, items);

      const info = await this.provider.transporter.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@stockspot.com',
        to: user.email,
        subject: `🎉 ${items.length} New Deal${items.length > 1 ? 's' : ''} - StockSpot`,
        html: emailContent.html,
        text: emailContent.text
      });

      return {
        success: true,
        count: items.length,
        provider: 'nodemailer',
        messageId: info.messageId
      };
    } catch (error) {
      throw new Error(`Nodemailer error: ${error.message}`);
    }
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

  /**
   * Build email content (HTML and plain text)
   */
  buildEmailContent(user, items) {
    const html = this.buildHtmlEmail(user, items);
    const text = this.buildTextEmail(user, items);

    return { html, text };
  }

  /**
   * Build HTML email
   */
  buildHtmlEmail(user, items) {
    const tierBadge = {
      'FREE': '🎁',
      'PAID': '⭐',
      'YEARLY': '👑'
    }[user.tier.toUpperCase()] || '📌';

    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #eee;">
          <strong>${item.name}</strong><br>
          <span style="color: #666; font-size: 12px;">${item.retailer}</span>
        </td>
        <td style="padding: 12px; text-align: right; border-bottom: 1px solid #eee;">
          <span style="color: #27ae60; font-weight: bold;">$${item.price.toFixed(2)}</span><br>
          <span style="color: #e74c3c; text-decoration: line-through;">$${item.originalPrice.toFixed(2)}</span><br>
          <span style="background: #e74c3c; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px;">
            ${item.discount}% OFF
          </span>
        </td>
        <td style="padding: 12px; text-align: center; border-bottom: 1px solid #eee;">
          <a href="${item.url}" style="background: #3498db; color: white; padding: 8px 12px; border-radius: 3px; text-decoration: none;">View</a>
        </td>
      </tr>
    `).join('');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px; text-align: center; }
            .content { margin: 20px 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            .footer { color: #666; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${tierBadge} New Deals & Restocks!</h1>
              <p>${items.length} items matching your interests</p>
            </div>
            
            <div class="content">
              <p>Hi ${user.name || 'Valued Customer'},</p>
              <p>We found ${items.length} amazing deal${items.length > 1 ? 's' : ''} for you:</p>
              
              <table>
                <thead>
                  <tr style="background: #f5f5f5;">
                    <th style="text-align: left; padding: 12px;">Product</th>
                    <th style="text-align: right; padding: 12px;">Price</th>
                    <th style="text-align: center; padding: 12px;">Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHtml}
                </tbody>
              </table>
              
              <p style="text-align: center; margin-top: 30px;">
                <a href="${process.env.FRONTEND_URL || 'https://stockspot.com'}/dashboard" 
                   style="background: #667eea; color: white; padding: 12px 30px; border-radius: 5px; text-decoration: none; display: inline-block;">
                  View All Deals
                </a>
              </p>
            </div>
            
            <div class="footer">
              <p>You're receiving this email because you subscribed to StockSpot notifications.</p>
              <p><a href="${process.env.FRONTEND_URL || 'https://stockspot.com'}/settings" style="color: #667eea;">Manage preferences</a> | 
                 <a href="${process.env.FRONTEND_URL || 'https://stockspot.com'}/unsubscribe" style="color: #667eea;">Unsubscribe</a></p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Build plain text email
   */
  buildTextEmail(user, items) {
    let text = `New Deals & Restocks!\n`;
    text += `${items.length} items matching your interests\n\n`;
    text += `Hi ${user.name || 'Valued Customer'},\n\n`;
    text += `We found ${items.length} amazing deal${items.length > 1 ? 's' : ''} for you:\n\n`;

    items.forEach((item, idx) => {
      text += `${idx + 1}. ${item.name}\n`;
      text += `   Retailer: ${item.retailer}\n`;
      text += `   Price: $${item.price.toFixed(2)} (was $${item.originalPrice.toFixed(2)}, ${item.discount}% off)\n`;
      text += `   Link: ${item.url}\n\n`;
    });

    text += `View all deals: ${process.env.FRONTEND_URL || 'https://stockspot.com'}/dashboard\n\n`;
    text += `---\nYou're receiving this email because you subscribed to StockSpot notifications.\n`;
    text += `Manage preferences: ${process.env.FRONTEND_URL || 'https://stockspot.com'}/settings\n`;
    text += `Unsubscribe: ${process.env.FRONTEND_URL || 'https://stockspot.com'}/unsubscribe\n`;

    return text;
  }
}

module.exports = { EmailProvider };
