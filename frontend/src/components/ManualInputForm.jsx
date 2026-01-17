import React, { useState } from 'react';
import './ManualInputForm.css';

function ManualInputForm({ onItemAdded }) {
  const [formData, setFormData] = useState({
    retailer: 'amazon',
    url: '',
    name: '',
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [items, setItems] = useState([]);

  const retailers = ['amazon', 'walmart', 'target', 'bestbuy', 'gamestop'];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await fetch('/api/manual-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tier: 'yearly',
          retailer: formData.retailer,
          url: formData.url,
          name: formData.name || `${formData.retailer} Search`,
        }),
      });

      if (!response.ok) throw new Error('Failed to add item');

      const data = await response.json();
      setItems([...items, data.item]);
      setFormData({ retailer: 'amazon', url: '', name: '' });
      setMessage('✅ Item added successfully!');
      onItemAdded();

      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveItem = async (itemId) => {
    try {
      const response = await fetch(`/api/manual-items/${itemId}?tier=yearly`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to remove item');

      setItems(items.filter((item) => item.id !== itemId));
      onItemAdded();
    } catch (err) {
      console.error('Remove item error:', err);
    }
  };

  return (
    <div className="manual-input-form">
      <div className="form-header">
        <h3>📌 Custom Monitors (Yearly Tier)</h3>
        <p>Add retailer URLs to monitor for deals</p>
      </div>

      <form onSubmit={handleAddItem}>
        <div className="form-group">
          <label>
            🏪 Retailer:
            <select
              name="retailer"
              value={formData.retailer}
              onChange={handleInputChange}
              required
            >
              {retailers.map((r) => (
                <option key={r} value={r}>
                  {r.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-group">
          <label>
            🔗 URL:
            <input
              type="url"
              name="url"
              value={formData.url}
              onChange={handleInputChange}
              placeholder="https://example.com/products"
              required
            />
          </label>
        </div>

        <div className="form-group">
          <label>
            📝 Name (optional):
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              placeholder="e.g., Pokémon Booster Search"
            />
          </label>
        </div>

        <button type="submit" className="btn-add" disabled={loading}>
          {loading ? '⏳ Adding...' : '➕ Add Monitor'}
        </button>

        {message && <p className={`message ${message.includes('✅') ? 'success' : 'error'}`}>{message}</p>}
      </form>

      {items.length > 0 && (
        <div className="items-list">
          <h4>📋 Your Monitors ({items.length})</h4>
          {items.map((item) => (
            <div key={item.id} className="monitor-item">
              <div>
                <strong>{item.name}</strong>
                <p className="url-preview">{item.url.substring(0, 50)}...</p>
              </div>
              <button
                type="button"
                className="btn-remove"
                onClick={() => handleRemoveItem(item.id)}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ManualInputForm;
