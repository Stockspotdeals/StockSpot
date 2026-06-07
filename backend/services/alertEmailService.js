const axios = require('axios');
const nodemailer = require('nodemailer');

class AlertEmailService {
  constructor() {
    this.provider = (process.env.EMAIL_SERVICE || 'sendgrid').toLowerCase();
    this.fromEmail = process.env.EMAIL_FROM || 'alerts@stockspot.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'StockSpot Alerts';
    this.isDryRun = process.env.DRY_RUN === 'true' || process.env.EMAIL_ENABLED === 'false';
    this.transporter = null;
  }

  async sendAlertEmail(user, signal, keyword) {
    if (this.isDryRun || process.env.EMAIL_ENABLED === 'false') {
      return this.dryRunEmail(user, signal, keyword);
    }

    switch (this.provider) {
      case 'sendgrid':
        return this.sendViaSendGrid(user, signal, keyword);
      case 'resend':
        return this.sendViaResend(user, signal, keyword);
      case 'postmark':
        return this.sendViaPostmark(user, signal, keyword);
      case 'nodemailer':
        return this.sendViaNodemailer(user, signal, keyword);
      default:
        console.warn(`⚠️ Unsupported EMAIL_SERVICE=${this.provider}, falling back to dry-run`);
        return this.dryRunEmail(user, signal, keyword);
    }
  }

  async sendViaSendGrid(user, signal, keyword) {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY is not configured');
    }

    const sgMail = require('@sendgrid/mail');
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    const { subject, html, text } = this.buildEmailPayload(user, signal, keyword);

    await sgMail.send({
      to: user.email,
      from: this.fromEmail,
      subject,
      html,
      text
    });

    return { success: true, provider: 'sendgrid' };
  }

  async sendViaResend(user, signal, keyword) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const { subject, html, text } = this.buildEmailPayload(user, signal, keyword);

    await axios.post('https://api.resend.com/emails', {
      from: `${this.fromName} <${this.fromEmail}>`,
      to: user.email,
      subject,
      html,
      text
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return { success: true, provider: 'resend' };
  }

  async sendViaPostmark(user, signal, keyword) {
    const serverToken = process.env.POSTMARK_SERVER_TOKEN;
    if (!serverToken) {
      throw new Error('POSTMARK_SERVER_TOKEN is not configured');
    }

    const { subject, html, text } = this.buildEmailPayload(user, signal, keyword);

    await axios.post('https://api.postmarkapp.com/email', {
      From: this.fromEmail,
      To: user.email,
      Subject: subject,
      HtmlBody: html,
      TextBody: text
    }, {
      headers: {
        'X-Postmark-Server-Token': serverToken,
        'Content-Type': 'application/json'
      }
    });

    return { success: true, provider: 'postmark' };
  }

  async sendViaNodemailer(user, signal, keyword) {
    if (!this.transporter) {
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        throw new Error('SMTP host, user, and pass are required for Nodemailer');
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    }

    const { subject, html, text } = this.buildEmailPayload(user, signal, keyword);

    const info = await this.transporter.sendMail({
      from: `${this.fromName} <${this.fromEmail}>`,
      to: user.email,
      subject,
      html,
      text
    });

    return { success: true, provider: 'nodemailer', messageId: info.messageId };
  }

  dryRunEmail(user, signal, keyword) {
    console.log(`\n📧 [DRY-RUN] Alert email draft for ${user.email}`);
    console.log(`   Subject: ${this.buildEmailSubject(signal, keyword)}`);
    console.log(`   Product: ${signal.productName || signal.title || 'Unnamed Signal'}`);
    console.log(`   Keyword: ${keyword}`);
    return { success: true, provider: 'dry-run' };
  }

  buildEmailPayload(user, signal, keyword) {
    const subject = this.buildEmailSubject(signal, keyword);
    const html = this.buildHtml(user, signal, keyword);
    const text = this.buildText(user, signal, keyword);
    return { subject, html, text };
  }

  buildEmailSubject(signal, keyword) {
    return `StockSpot Alert: ${keyword} match for ${signal.productName || signal.title || 'new opportunity'}`;
  }

  buildHtml(user, signal, keyword) {
    const productName = signal.productName || signal.title || 'New Opportunity';
    const link = signal.affiliateUrl || signal.url || process.env.FRONTEND_URL || 'https://stockspot.com';
    const price = typeof signal.price === 'number' ? `$${signal.price.toFixed(2)}` : signal.price || 'Unknown price';
    const originalPrice = signal.originalPrice ? `$${signal.originalPrice.toFixed(2)}` : null;

    return `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">StockSpot Alert</h1>
              <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Keyword match: ${keyword}</p>
            </div>
            <div style="padding: 24px; color: #333;">
              <p>Hi ${user.email},</p>
              <p>We found a new alert matching your watchlist keyword <strong>${keyword}</strong>:</p>
              <h2 style="margin: 18px 0 8px; font-size: 20px;">${productName}</h2>
              <p style="margin: 0 0 12px; color: #555;">${signal.description || 'A new signal was generated that matches your watch preferences.'}</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Price</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${price}</td>
                </tr>
                ${originalPrice ? `<tr><td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Original Price</td><td style="padding: 12px; border: 1px solid #ececec;">${originalPrice}</td></tr>` : ''}
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Type</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${signal.signalType || signal.type || 'Deal'}</td>
                </tr>
              </table>
              <a href="${link}" style="display: inline-block; padding: 14px 24px; background: #667eea; color: white; border-radius: 8px; text-decoration: none;">View Deal</a>
              <p style="margin-top: 24px; font-size: 12px; color: #888;">You are receiving this email because you have watchlist alerts enabled in StockSpot.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  buildText(user, signal, keyword) {
    const productName = signal.productName || signal.title || 'New Opportunity';
    const link = signal.affiliateUrl || signal.url || process.env.FRONTEND_URL || 'https://stockspot.com';
    const price = typeof signal.price === 'number' ? `$${signal.price.toFixed(2)}` : signal.price || 'Unknown price';

    return `StockSpot Alert - ${keyword}

${productName}
Price: ${price}
Type: ${signal.signalType || signal.type || 'Deal'}

${signal.description || 'A new signal was generated that matches your watchlist keyword.'}

View Deal: ${link}

You are receiving this email because you have watchlist alerts enabled in StockSpot.`;
  }
}

module.exports = { AlertEmailService };
