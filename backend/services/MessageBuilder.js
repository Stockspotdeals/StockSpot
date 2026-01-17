/**
 * MessageBuilder - Constructs formatted messages for notifications
 */
class MessageBuilder {
  /**
   * Build a notification message for a product
   */
  static buildProductMessage(product, eventType = 'price_drop') {
    let message = '';

    switch (eventType) {
      case 'price_drop':
        message = `🔥 Price Drop Alert!\n\n`;
        message += `${product.name}\n`;
        message += `Old Price: $${product.previousPrice}\n`;
        message += `New Price: $${product.price}\n`;
        message += `Savings: $${(product.previousPrice - product.price).toFixed(2)}\n`;
        message += `Retailer: ${product.retailer}\n`;
        break;

      case 'restock':
        message = `📦 Restock Alert!\n\n`;
        message += `${product.name}\n`;
        message += `Status: ${product.availability}\n`;
        message += `Price: $${product.price}\n`;
        message += `Retailer: ${product.retailer}\n`;
        break;

      case 'new_deal':
        message = `💎 New Deal!\n\n`;
        message += `${product.name}\n`;
        message += `Price: $${product.price}\n`;
        message += `Discount: ${product.discount || 'N/A'}%\n`;
        message += `Retailer: ${product.retailer}\n`;
        break;

      default:
        message = `${product.name} - $${product.price}`;
    }

    return message;
  }

  /**
   * Build a message for email notifications
   */
  static buildEmailMessage(product, eventType = 'price_drop') {
    let html = `<h2>${product.name}</h2>`;
    html += `<p>Retailer: <strong>${product.retailer}</strong></p>`;
    html += `<p>Price: <strong>$${product.price}</strong></p>`;

    if (eventType === 'price_drop' && product.previousPrice) {
      const savings = product.previousPrice - product.price;
      const percent = ((savings / product.previousPrice) * 100).toFixed(1);
      html += `<p>Savings: <strong>$${savings.toFixed(2)} (${percent}%)</strong></p>`;
    }

    if (product.url) {
      html += `<p><a href="${product.url}">View Product</a></p>`;
    }

    return html;
  }

  /**
   * Build a message for RSS feed entries
   */
  static buildRSSMessage(product) {
    return `${product.retailer} - ${product.name} - $${product.price}`;
  }
}

module.exports = { MessageBuilder };
