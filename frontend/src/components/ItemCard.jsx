import React from 'react';
import './ItemCard.css';

function ItemCard({ item, tier }) {
  const formatPrice = (price) => {
    if (price === undefined || price === null) return 'Price TBD';
    // price may be a string or number
    const num = typeof price === 'number' ? price : parseFloat(price);
    if (isNaN(num)) return 'Price TBD';
    return `$${num.toFixed(2)}`;
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
    const url = item.link?.affiliate || item.link?.raw || item.affiliateLink;
    if (url) {
      window.open(url, '_blank');
    }
  };

  const generateFlip = async () => {
    // Only attempt if essential fields exist
    const title = item.name || item.title;
    const currentPrice = item.price?.current ?? item.price;
    const avgMarketPrice = item.price?.avgMarket ?? item.avgMarketPrice;

    if (!title || !currentPrice || !avgMarketPrice) {
      alert('Insufficient product pricing data for flip template (needs title, currentPrice, avgMarketPrice).');
      return;
    }

    try {
      const response = await fetch('/api/ai/generate-flip-template', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': localStorage.getItem('token') || ''
        },
        body: JSON.stringify({
          title,
          currentPrice,
          avgMarketPrice,
          category: item.category || item.retailer || 'General'
        })
      });

      if (!response.ok) {
        alert('Premium required or failed to generate template.');
        return;
      }

      const data = await response.json();
      console.log('Flip template:', data);
      alert(`Suggested Price: $${data.suggestedResalePrice}\nEstimated Profit: $${data.estimatedProfit}\nMargin: ${data.marginPercent}%`);
    } catch (err) {
      console.error('Generate flip error', err);
      alert('Failed to generate flip template.');
    }
  };

  return (
    <div className="item-card">
      <div className="item-image">
        <img
          src={item.media?.image || item.image || 'https://via.placeholder.com/150x150?text=No+Image'}
          alt={item.name || 'Unnamed product'}
        />
        {((item.link?.affiliate || item.link?.raw) || item.affiliateLink) && (
          <span className="affiliate-badge">🤝 Affiliate</span>
        )}
      </div>

      <div className="item-content">
        <div className="item-header">
          <h3>{item.name}</h3>
          <p className="retailer">
            <img src={item.retailerLogo} alt={item.retailer} className="retailer-logo" />
            {(item.retailer || '').toUpperCase()}
          </p>
        </div>

        <div className="item-badges">
          {getClassificationBadge(item.classification)}
          {/* additional conditional badges */}
          {item.flags?.adminPick && (
            <span className="badge badge-admin">Admin Pick</span>
          )}
          {item.flags?.restock && (
            <span className="badge badge-restock">Restocked</span>
          )}
          {((item.discount?.percentage ?? item.discountPercent) >= 40) && (
            <span className="badge badge-hot">Hot Deal</span>
          )}
        </div>

        <div className="item-details">
          <div className="detail-group">
            <span className="detail-label">Price:</span>
            <span className={`detail-value ${(item.discount?.percentage ?? item.discountPercent) > 0 ? 'discounted' : ''}`}>
              {formatPrice(item.price?.current ?? item.price)}
              {(item.discount?.percentage ?? item.discountPercent) > 0 && (
                <span className="discount">-{(item.discount?.percentage ?? item.discountPercent)}%</span>
              )}
            </span>
            {(item.price?.original || item.originalPrice) &&
              (item.price?.original || item.originalPrice) !== (item.price?.current || item.price) && (
              <span className="original-price">
                ${formatPrice(item.price?.original ?? item.originalPrice)}
              </span>
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
          {(item.link?.affiliate || item.link?.raw || item.affiliateLink)
            ? '🛒 View on ' + (item.retailer || '').toUpperCase()
            : '🔗 View Item'}
        </button>

        {/* Premium-only Flip Template generator */}
        {(tier === 'paid' || tier === 'yearly') && (
          <button
            id={`generateFlipBtn-${item.id || 'anon'}`}
            className="btn btn-secondary generate-flip-btn"
            onClick={generateFlip}
            style={{ marginLeft: '0.5rem' }}
          >
            Generate Flip Template
          </button>
        )}

        {tier === 'free' && !item.visible && (
          <p className="delay-notice">⏱️ Visible in {item.delayMinutes} minutes for free tier</p>
        )}
      </div>
    </div>
  );
}

export default ItemCard;
