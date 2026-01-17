import React from 'react';
import './Header.css';

function Header({ tier, onTierChange }) {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-brand">
          <h1>🎯 StockSpot</h1>
          <p>Real-time Deal & Restock Alerts</p>
        </div>

        <div className="header-tier-switcher">
          <label>Current Tier:</label>
          <select value={tier} onChange={(e) => onTierChange(e.target.value)}>
            <option value="free">🎁 Free</option>
            <option value="paid">⭐ Paid ($9.99/mo)</option>
            <option value="yearly">👑 Yearly ($99/yr)</option>
          </select>
        </div>
      </div>
    </header>
  );
}

export default Header;
