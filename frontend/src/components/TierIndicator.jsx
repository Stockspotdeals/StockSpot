import React from 'react';
import './TierIndicator.css';

function TierIndicator({ tier }) {
  const tierConfig = {
    free: {
      name: 'Free Tier',
      color: '#6c757d',
      benefits: ['10-min delay (non-Amazon)', 'Instant Amazon feed', 'All categories'],
      icon: '🎁',
    },
    paid: {
      name: 'Paid Tier',
      color: '#28a745',
      benefits: ['Instant feed', 'Priority ranking', 'Email alerts'],
      icon: '⭐',
      price: '$9.99/mo',
    },
    yearly: {
      name: 'Yearly Tier',
      color: '#ffc107',
      benefits: ['Instant feed', 'Manual monitoring', 'Priority ranking', 'Email alerts'],
      icon: '👑',
      price: '$99/year',
    },
  };

  const config = tierConfig[tier] || tierConfig.free;

  return (
    <div className="tier-indicator" style={{ borderTopColor: config.color }}>
      <div className="tier-info">
        <span className="tier-icon">{config.icon}</span>
        <div>
          <h3>{config.name}</h3>
          {config.price && <p className="tier-price">{config.price}</p>}
        </div>
      </div>
      <ul className="tier-benefits">
        {config.benefits.map((benefit, index) => (
          <li key={index}>✓ {benefit}</li>
        ))}
      </ul>
    </div>
  );
}

export default TierIndicator;
