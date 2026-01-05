class MessageBuilder {
  static buildRestockMessage(product, event, channel) {
    const productName = product.productName || 'Product';
    const productUrl = product.url;
    const retailer = this.capitalizeRetailer(product.retailer);
    const price = product.currentPrice ? `$${product.currentPrice.toFixed(2)}` : 'Price unavailable';
    
    const messages = {
      email: {
        subject: `🚨 RESTOCK ALERT: ${productName} is back in stock!`,
        body: `Great news! The product you're tracking is now available:

Product: ${productName}
Retailer: ${retailer}
Current Price: ${price}
Status: ✅ IN STOCK

View Product: ${productUrl}

---
StockSpot - Your Personal Stock Tracker
Unsubscribe: {{unsubscribe_url}}`,
        html: `
<div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #28a745; margin: 0 0 10px 0;">🚨 RESTOCK ALERT</h1>
    <p style="margin: 0; color: #6c757d; font-size: 16px;">${productName} is back in stock!</p>
  </div>
  
  <div style="background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 15px 0; color: #495057;">${productName}</h3>
    <p style="margin: 5px 0;"><strong>Retailer:</strong> ${retailer}</p>
    <p style="margin: 5px 0;"><strong>Price:</strong> <span style="color: #28a745; font-weight: bold;">${price}</span></p>
    <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #28a745;">✅ IN STOCK</span></p>
    <div style="margin-top: 20px;">
      <a href="${productUrl}" style="background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Product</a>
    </div>
  </div>
  
  <div style="text-align: center; color: #6c757d; font-size: 14px;">
    <p>StockSpot - Your Personal Stock Tracker</p>
    <p><a href="{{unsubscribe_url}}" style="color: #6c757d;">Unsubscribe</a></p>
  </div>
</div>`
      },
      
      discord: {
        body: `🚨 **RESTOCK ALERT** 🚨

**${productName}** is back in stock!

🏪 **Retailer:** ${retailer}
💰 **Price:** ${price}
✅ **Status:** IN STOCK

🔗 **[View Product](${productUrl})**

*Powered by StockSpot*`
      },
      
      telegram: {
        body: `🚨 *RESTOCK ALERT* 🚨

*${this.escapeMarkdown(productName)}* is back in stock\\!

🏪 *Retailer:* ${retailer}
💰 *Price:* ${this.escapeMarkdown(price)}
✅ *Status:* IN STOCK

[View Product](${productUrl})

_Powered by StockSpot_`
      },
      
      twitter: {
        body: `🚨 RESTOCK ALERT: ${this.truncateForTwitter(productName)} is back in stock at ${retailer} for ${price}! ${productUrl} #StockAlert #RestockAlert`
      }
    };
    
    return messages[channel.channelType] || messages.email;
  }
  
  static buildPriceDropMessage(product, event, channel, oldPrice, newPrice) {
    const productName = product.productName || 'Product';
    const productUrl = product.url;
    const retailer = this.capitalizeRetailer(product.retailer);
    const priceDrop = oldPrice - newPrice;
    const percentDrop = ((priceDrop / oldPrice) * 100).toFixed(1);
    
    const messages = {
      email: {
        subject: `📉 PRICE DROP: ${productName} - Save $${priceDrop.toFixed(2)}!`,
        body: `Great news! The price dropped on a product you're tracking:

Product: ${productName}
Retailer: ${retailer}
Old Price: $${oldPrice.toFixed(2)}
New Price: $${newPrice.toFixed(2)}
You Save: $${priceDrop.toFixed(2)} (${percentDrop}% off)

View Product: ${productUrl}

---
StockSpot - Your Personal Stock Tracker
Unsubscribe: {{unsubscribe_url}}`,
        html: `
<div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #dc3545; margin: 0 0 10px 0;">📉 PRICE DROP</h1>
    <p style="margin: 0; color: #6c757d; font-size: 16px;">Save $${priceDrop.toFixed(2)} on ${productName}!</p>
  </div>
  
  <div style="background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 15px 0; color: #495057;">${productName}</h3>
    <p style="margin: 5px 0;"><strong>Retailer:</strong> ${retailer}</p>
    <div style="display: flex; gap: 20px; margin: 10px 0;">
      <div>
        <p style="margin: 0; color: #6c757d;">Old Price</p>
        <p style="margin: 0; text-decoration: line-through; color: #6c757d;">$${oldPrice.toFixed(2)}</p>
      </div>
      <div>
        <p style="margin: 0; color: #dc3545;">New Price</p>
        <p style="margin: 0; color: #dc3545; font-weight: bold; font-size: 18px;">$${newPrice.toFixed(2)}</p>
      </div>
    </div>
    <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 10px; margin: 15px 0;">
      <p style="margin: 0; color: #155724;"><strong>You Save: $${priceDrop.toFixed(2)} (${percentDrop}% off)</strong></p>
    </div>
    <div style="margin-top: 20px;">
      <a href="${productUrl}" style="background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">View Deal</a>
    </div>
  </div>
  
  <div style="text-align: center; color: #6c757d; font-size: 14px;">
    <p>StockSpot - Your Personal Stock Tracker</p>
    <p><a href="{{unsubscribe_url}}" style="color: #6c757d;">Unsubscribe</a></p>
  </div>
</div>`
      },
      
      discord: {
        body: `📉 **PRICE DROP ALERT** 📉

**${productName}** price dropped!

🏪 **Retailer:** ${retailer}
~~$${oldPrice.toFixed(2)}~~ ➡️ **$${newPrice.toFixed(2)}**
💰 **You Save:** $${priceDrop.toFixed(2)} (${percentDrop}% off)

🔗 **[View Deal](${productUrl})**

*Powered by StockSpot*`
      },
      
      telegram: {
        body: `📉 *PRICE DROP ALERT* 📉

*${this.escapeMarkdown(productName)}* price dropped\\!

🏪 *Retailer:* ${retailer}
~$${oldPrice.toFixed(2)}~ ➡️ *$${newPrice.toFixed(2)}*
💰 *You Save:* $${priceDrop.toFixed(2)} \\(${percentDrop}% off\\)

[View Deal](${productUrl})

_Powered by StockSpot_`
      },
      
      twitter: {
        body: `📉 PRICE DROP: ${this.truncateForTwitter(productName)} now $${newPrice.toFixed(2)} (was $${oldPrice.toFixed(2)}) - Save ${percentDrop}%! ${productUrl} #PriceDrop #Deal`
      }
    };
    
    return messages[channel.channelType] || messages.email;
  }
  
  static buildTargetPriceMessage(product, event, channel, targetPrice) {
    const productName = product.productName || 'Product';
    const productUrl = product.url;
    const retailer = this.capitalizeRetailer(product.retailer);
    const currentPrice = product.currentPrice;
    
    const messages = {
      email: {
        subject: `🎯 TARGET PRICE REACHED: ${productName} - $${targetPrice}!`,
        body: `Excellent! Your target price has been reached:

Product: ${productName}
Retailer: ${retailer}
Target Price: $${targetPrice}
Current Price: $${currentPrice.toFixed(2)}

View Product: ${productUrl}

---
StockSpot - Your Personal Stock Tracker
Unsubscribe: {{unsubscribe_url}}`,
        html: `
<div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #28a745; margin: 0 0 10px 0;">🎯 TARGET PRICE REACHED</h1>
    <p style="margin: 0; color: #6c757d; font-size: 16px;">${productName} hit your target price!</p>
  </div>
  
  <div style="background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <h3 style="margin: 0 0 15px 0; color: #495057;">${productName}</h3>
    <p style="margin: 5px 0;"><strong>Retailer:</strong> ${retailer}</p>
    <p style="margin: 5px 0;"><strong>Target Price:</strong> $${targetPrice}</p>
    <p style="margin: 5px 0;"><strong>Current Price:</strong> <span style="color: #28a745; font-weight: bold;">$${currentPrice.toFixed(2)}</span></p>
    <div style="background: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; padding: 10px; margin: 15px 0;">
      <p style="margin: 0; color: #155724;"><strong>🎉 Your target price has been reached!</strong></p>
    </div>
    <div style="margin-top: 20px;">
      <a href="${productUrl}" style="background: #28a745; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Buy Now</a>
    </div>
  </div>
  
  <div style="text-align: center; color: #6c757d; font-size: 14px;">
    <p>StockSpot - Your Personal Stock Tracker</p>
    <p><a href="{{unsubscribe_url}}" style="color: #6c757d;">Unsubscribe</a></p>
  </div>
</div>`
      },
      
      discord: {
        body: `🎯 **TARGET PRICE REACHED** 🎯

**${productName}** hit your target price!

🏪 **Retailer:** ${retailer}
🎯 **Target:** $${targetPrice}
💰 **Current:** $${currentPrice.toFixed(2)}

🔗 **[Buy Now](${productUrl})**

*Powered by StockSpot*`
      },
      
      telegram: {
        body: `🎯 *TARGET PRICE REACHED* 🎯

*${this.escapeMarkdown(productName)}* hit your target price\\!

🏪 *Retailer:* ${retailer}
🎯 *Target:* $${targetPrice}
💰 *Current:* $${currentPrice.toFixed(2)}

[Buy Now](${productUrl})

_Powered by StockSpot_`
      },
      
      twitter: {
        body: `🎯 TARGET REACHED: ${this.truncateForTwitter(productName)} hit $${targetPrice} target at ${retailer}! Current: $${currentPrice.toFixed(2)} ${productUrl} #TargetPrice #Deal`
      }
    };
    
    return messages[channel.channelType] || messages.email;
  }
  
  static buildTestMessage(channel) {
    const messages = {
      email: {
        subject: '✅ StockSpot Test Notification',
        body: `This is a test notification from StockSpot.

Your ${channel.channelType} notifications are working correctly!

If you received this message, your notification channel is properly configured.

---
StockSpot - Your Personal Stock Tracker`,
        html: `
<div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
    <h1 style="color: #007bff; margin: 0 0 10px 0;">✅ Test Notification</h1>
    <p style="margin: 0; color: #6c757d; font-size: 16px;">StockSpot notification test</p>
  </div>
  
  <div style="background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
    <p>This is a test notification from StockSpot.</p>
    <p>Your <strong>${channel.channelType}</strong> notifications are working correctly!</p>
    <p>If you received this message, your notification channel is properly configured.</p>
  </div>
  
  <div style="text-align: center; color: #6c757d; font-size: 14px;">
    <p>StockSpot - Your Personal Stock Tracker</p>
  </div>
</div>`
      },
      
      discord: {
        body: `✅ **StockSpot Test Notification**

Your ${channel.channelType} notifications are working correctly!

If you received this message, your notification channel is properly configured.

*Powered by StockSpot*`
      },
      
      telegram: {
        body: `✅ *StockSpot Test Notification*

Your ${channel.channelType} notifications are working correctly\\!

If you received this message, your notification channel is properly configured\\.

_Powered by StockSpot_`
      },
      
      twitter: {
        body: `✅ StockSpot test notification - Your alerts are working! #StockSpot #Test`
      }
    };
    
    return messages[channel.channelType] || messages.email;
  }
  
  static capitalizeRetailer(retailer) {
    const retailers = {
      'amazon': 'Amazon',
      'walmart': 'Walmart',
      'target': 'Target',
      'bestbuy': 'Best Buy',
      'unknown': 'Unknown Retailer'
    };
    return retailers[retailer] || retailer;
  }
  
  static truncateForTwitter(text, maxLength = 50) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }
  
  static escapeMarkdown(text) {
    return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
  }
  
  static injectAffiliateLink(url, affiliateId) {
    try {
      const parsedUrl = new URL(url);
      
      if (parsedUrl.hostname.includes('amazon.')) {
        parsedUrl.searchParams.set('tag', affiliateId);
      } else if (parsedUrl.hostname.includes('walmart.com')) {
        parsedUrl.searchParams.set('wmlspartner', affiliateId);
      }
      
      return parsedUrl.toString();
    } catch (error) {
      return url;
    }
  }
}

module.exports = { MessageBuilder };