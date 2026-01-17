import React from 'react';
import './FeedComponent.css';
import ItemCard from './ItemCard';

function FeedComponent({ items, tier }) {
  if (!items || items.length === 0) {
    return (
      <div className="feed-empty">
        <p>📭 No items found. Check back soon!</p>
        <p style={{ fontSize: '0.9em', color: '#999' }}>Items will appear here as new deals are detected.</p>
      </div>
    );
  }

  return (
    <div className="feed">
      <div className="feed-header">
        <h2>🎯 Latest Deals</h2>
        <p className="feed-count">{items.length} item{items.length !== 1 ? 's' : ''} found</p>
      </div>
      <div className="feed-list">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} tier={tier} />
        ))}
      </div>
    </div>
  );
}

export default FeedComponent;
