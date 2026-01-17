import React, { useState, useEffect } from 'react';
import './CategoryTabs.css';

function CategoryTabs({ selectedCategory, onCategorySelect, selectedRetailer, onRetailerSelect }) {
  const [categories, setCategories] = useState([]);
  const [retailers, setRetailers] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [catRes, retRes] = await Promise.all([fetch('/api/categories'), fetch('/api/retailers')]);

      if (catRes.ok) {
        const catData = await catRes.json();
        setCategories(catData.categories || []);
      }

      if (retRes.ok) {
        const retData = await retRes.json();
        setRetailers(retData.retailers || {});
      }
    } catch (err) {
      console.error('Failed to fetch categories/retailers:', err);
    }
  };

  const getCategoryLabel = (cat) => {
    const labels = {
      'pokemon-tcg': 'Pokémon TCG',
      'one-piece-tcg': 'One Piece TCG',
      'sports-cards': 'Sports Cards',
      'limited-exclusive': 'Limited/Exclusive',
      'hype-items': 'Hype Items',
    };
    return labels[cat] || cat.replace('-', ' ');
  };

  return (
    <div className="tabs-container">
      <div className="tabs-group">
        <h3>📂 Categories</h3>
        <div className="tabs">
          <button
            className={`tab ${selectedCategory === 'all' ? 'active' : ''}`}
            onClick={() => onCategorySelect('all')}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              className={`tab ${selectedCategory === cat ? 'active' : ''}`}
              onClick={() => onCategorySelect(cat)}
            >
              {getCategoryLabel(cat)}
            </button>
          ))}
        </div>
      </div>

      <div className="tabs-group">
        <h3>🏪 Retailers</h3>
        <div className="tabs">
          <button
            className={`tab ${selectedRetailer === 'all' ? 'active' : ''}`}
            onClick={() => onRetailerSelect('all')}
          >
            All
          </button>
          {Object.entries(retailers).map(([key, config]) => (
            <button
              key={key}
              className={`tab ${selectedRetailer === key ? 'active' : ''}`}
              onClick={() => onRetailerSelect(key)}
            >
              {config.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CategoryTabs;
