const axios = require('axios');

class AlertEmailService {
  constructor() {
    this.fromEmail = process.env.EMAIL_FROM || 'alerts@stockspot.com';
    this.fromName = process.env.EMAIL_FROM_NAME || 'StockSpot Alerts';
    this.isDryRun = process.env.DRY_RUN === 'true' || process.env.EMAIL_ENABLED === 'false';
    this.provider = 'resend';
  }

  async sendEmail({ to, subject, html, text, dryRunLabel = 'email' }) {
    if (this.isDryRun || process.env.EMAIL_ENABLED === 'false') {
      console.log(`\n📧 [DRY-RUN] ${dryRunLabel} draft for ${to}`);
      console.log(`   Subject: ${subject}`);
      return { success: true, provider: 'dry-run' };
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    await axios.post('https://api.resend.com/emails', {
      from: `${this.fromName} <${this.fromEmail}>`,
      to,
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

  async sendAlertEmail(user, signal, keyword) {
    const { subject, html, text } = this.buildEmailPayload(user, signal, keyword);
    return this.sendEmail({
      to: user.email,
      subject,
      html,
      text,
      dryRunLabel: 'alert email'
    });
  }

  async sendNotificationEmail(user, items) {
    const { subject, html, text } = this.buildNotificationDigest(user, items);
    return this.sendEmail({
      to: user.email,
      subject,
      html,
      text,
      dryRunLabel: 'notification email'
    });
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

  buildNotificationDigest(user, items) {
    const subject = `StockSpot Digest: ${items.length} New Deal${items.length === 1 ? '' : 's'}`;
    const introName = user.name || user.email || 'StockSpot user';
    const rows = items.map((item) => {
      const price = typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : String(item.price || 'Unknown price');
      const originalPrice = item.originalPrice ? ` (was $${Number(item.originalPrice).toFixed(2)})` : '';
      return `<tr><td style="padding:12px;border-bottom:1px solid #eee;"><strong>${item.name || 'Unnamed item'}</strong><br><span style="color:#666;font-size:12px;">${item.retailer || 'Unknown retailer'}</span></td><td style="padding:12px;border-bottom:1px solid #eee;text-align:right;">${price}${originalPrice}</td></tr>`;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
        <body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px; color: #333;">
          <div style="max-width: 640px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%); color: white; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">StockSpot Digest</h1>
              <p style="margin: 8px 0 0; opacity: 0.9;">${items.length} new opportunities are ready</p>
            </div>
            <div style="padding: 24px;">
              <p>Hi ${introName},</p>
              <p>Here are the latest deals and restocks collected by StockSpot:</p>
              <table style="width: 100%; border-collapse: collapse; margin-top: 16px;">
                ${rows}
              </table>
            </div>
          </div>
        </body>
      </html>
    `;

    const text = [`StockSpot Digest`, '', `Hi ${introName},`, '', `Here are your latest deals:`]
      .concat(items.map((item, index) => `${index + 1}. ${item.name || 'Unnamed item'} | ${item.retailer || 'Unknown retailer'} | ${item.price || 'Unknown price'}`))
      .join('\n');

    return { subject, html, text };
  }

  buildEmailSubject(signal, keyword) {
    const productName = signal.productName || signal.title || 'New Opportunity';
    const tier = signal.tier ? ` [${signal.tier}]` : '';
    return `StockSpot Alert${tier}: ${productName}`;
  }

  buildHtml(user, signal, keyword) {
    const productName = signal.productName || signal.title || 'New Opportunity';
    const link = signal.affiliateUrl || signal.url || process.env.FRONTEND_URL || 'https://stockspot.com';
    const price = typeof signal.price === 'number' ? `$${signal.price.toFixed(2)}` : signal.price || 'Unknown price';
    const originalPrice = signal.originalPrice ? `$${signal.originalPrice.toFixed(2)}` : null;
    const confidence = typeof signal.confidence === 'number'
      ? `${Math.round(signal.confidence * 100)}%`
      : (typeof signal.score === 'number' ? `${Math.round(signal.score)}%` : 'n/a');
    const signalType = signal.signalType || signal.type || 'deal';
    const retailer = signal.store || 'Unknown retailer';
    const reason = signal.reasoning || signal.description || 'New signal generated by StockSpot intelligence.';
    const timestamp = new Date(signal.timestamp || signal.createdAt || Date.now()).toISOString();

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="font-family: Arial, sans-serif; background: #f5f7fa; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 50px rgba(0,0,0,0.08);">
            <div style="background: linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%); color: white; padding: 24px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px;">StockSpot Alert</h1>
              <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">Signal pipeline delivery: ${signalType}</p>
            </div>
            <div style="padding: 24px; color: #333;">
              <p>Hi ${user.email},</p>
              <p>A new StockSpot alert is ready:</p>
              <h2 style="margin: 18px 0 8px; font-size: 20px;">${productName}</h2>
              <p style="margin: 0 0 12px; color: #555;">${signal.description || 'A new signal was generated by StockSpot monitoring and intelligence.'}</p>
              <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Product</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${productName}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Retailer</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${retailer}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Price</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${price}</td>
                </tr>
                ${originalPrice ? `<tr><td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Original Price</td><td style="padding: 12px; border: 1px solid #ececec;">${originalPrice}</td></tr>` : ''}
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Signal type</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${signalType}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Reason</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${reason}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Confidence</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${confidence}</td>
                </tr>
                <tr>
                  <td style="padding: 12px; border: 1px solid #ececec; font-weight: 600;">Timestamp</td>
                  <td style="padding: 12px; border: 1px solid #ececec;">${timestamp}</td>
                </tr>
              </table>
              <a href="${link}" style="display: inline-block; padding: 14px 24px; background: #1d4ed8; color: white; border-radius: 8px; text-decoration: none;">View Deal</a>
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
    const signalType = signal.signalType || signal.type || 'Deal';
    const retailer = signal.store || 'Unknown retailer';
    const reason = signal.reasoning || signal.description || 'New signal generated by StockSpot intelligence.';
    const confidence = typeof signal.confidence === 'number'
      ? `${Math.round(signal.confidence * 100)}%`
      : (typeof signal.score === 'number' ? `${Math.round(signal.score)}%` : 'n/a');
    const timestamp = new Date(signal.timestamp || signal.createdAt || Date.now()).toISOString();

    return `StockSpot Alert

${productName}
Retailer: ${retailer}
Signal Type: ${signalType}
Reason: ${reason}
Confidence: ${confidence}
Timestamp: ${timestamp}
Price: ${price}

${signal.description || 'A new signal was generated that matches your watchlist keyword.'}

View Deal: ${link}

You are receiving this email because you have watchlist alerts enabled in StockSpot.`;
  }
}

module.exports = { AlertEmailService };
