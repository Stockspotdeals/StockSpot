import React from 'react';
import './ItemCard.css';

function ItemCard({ item, tier }) {
  const formatPrice = (price) => {
    if (!price) return 'Price TBD';
    return `$${price.toFixed(2)}`;
  };

  const getStockLabel = (inStock) => {
    return inStock ? '✓ In Stock' : '✗ Out of Stock';
  };

  const getClassificationBadge = (classification) => {
    if (!classification) return null;
    const tags = classification.split(',');
    return tags.map((tag) => (
      <span key={tag} className={`badge badge-${tag.toLowerCase()}`}>
        {tag}
      </span>
    ));
  };

  const handleBuyNow = () => {
    if (item.link) {
      window.open(item.link, '_blank');
    }
  };

  return (
    <div className="item-card">
      <div className="item-image">
        <img src={item.image || 'https://via.placeholder.com/150x150?text=No+Image'} alt={item.name} />
        {item.affiliateLink && <span className="affiliate-badge">🤝 Affiliate</span>}
      </div>

      <div className="item-content">
        <div className="item-header">
          <h3>{item.name}</h3>
          <p className="retailer">
            <img src={item.retailerLogo} alt={item.retailer} className="retailer-logo" />
            {item.retailer.toUpperCase()}
          </p>
        </div>

        <div className="item-badges">{getClassificationBadge(item.classification)}</div>

        <div className="item-details">
          <div className="detail-group">
            <span className="detail-label">Price:</span>
            <span className={`detail-value ${item.discountPercent > 0 ? 'discounted' : ''}`}>
              {formatPrice(item.price)}
              {item.discountPercent > 0 && <span className="discount">-{item.discountPercent}%</span>}
            </span>
            {item.originalPrice && item.originalPrice !== item.price && (
              <span className="original-price">${item.originalPrice.toFixed(2)}</span>
            )}
          </div>

          <div className="detail-group">
            <span className="detail-label">Stock:</span>
            <span className={`detail-value ${item.inStock ? 'in-stock' : 'out-of-stock'}`}>{getStockLabel(item.inStock)}</span>
          </div>

          <div className="detail-group">
            <span className="detail-label">Category:</span>
            <span className="detail-value">{item.category.replace('-', ' ')}</span>
          </div>

          <div className="detail-group">
            <span className="detail-label">Detected:</span>
            <span className="detail-value">{new Date(item.detectedAt).toLocaleTimeString()}</span>
          </div>

          <div className="detail-group">
            <span className="detail-label">Confidence:</span>
            <div className="confidence-bar">
              <div className="confidence-fill" style={{ width: `${item.confidence}%` }}></div>
              <span className="confidence-text">{item.confidence}%</span>
            </div>
          </div>
        </div>

        {item.description && <p className="item-description">{item.description}</p>}

        <button className="btn-view-item" onClick={handleBuyNow}>
          {item.affiliateLink ? '🛒 View on ' + item.retailer.toUpperCase() : '🔗 View Item'}
        </button>

        {tier === 'free' && !item.visible && (
          <p className="delay-notice">⏱️ Visible in {item.delayMinutes} minutes for free tier</p>
        )}
      </div>
    </div>
  );
}

export default ItemCard;
