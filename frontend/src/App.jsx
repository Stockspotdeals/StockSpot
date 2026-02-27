import React, { useState, useEffect } from 'react';
import './App.css';
import FeedComponent from './components/FeedComponent';
import CategoryTabs from './components/CategoryTabs';
import ManualInputForm from './components/ManualInputForm';
import TierIndicator from './components/TierIndicator';
import Header from './components/Header';

function App() {
  const [tier, setTier] = useState(localStorage.getItem('userTier') || 'free');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRetailer, setSelectedRetailer] = useState('all');
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch feed on mount and when tier/category changes
  useEffect(() => {
    fetchFeed();
  }, [tier, selectedCategory, selectedRetailer]);

  const fetchFeed = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('tier', tier);
      if (selectedCategory !== 'all') {
        params.append('category', selectedCategory);
      }
      if (selectedRetailer !== 'all') {
        params.append('retailer', selectedRetailer);
      }

      const response = await fetch(`/api/feed?${params}`);
      if (!response.ok) throw new Error('Failed to fetch feed');

      const data = await response.json();
      // support new structured response: { meta: {...}, products: [...] }
      let items = [];
      if (data && Array.isArray(data.products)) {
        items = data.products;
      } else if (data && Array.isArray(data.items)) {
        items = data.items;
      } else if (Array.isArray(data)) {
        // legacy root-array response
        items = data;
      }

      // sort newest first by timestamps.createdAt, fallback to createdAt or leave as-is
      if (Array.isArray(items)) {
        items.sort((a, b) => {
          const aDate = new Date(a?.timestamps?.createdAt || a?.createdAt || 0).getTime();
          const bDate = new Date(b?.timestamps?.createdAt || b?.createdAt || 0).getTime();
          return bDate - aDate;
        });
      }

      setFeed(items);
    } catch (err) {
      console.error('Feed error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTierChange = (newTier) => {
    setTier(newTier);
    localStorage.setItem('userTier', newTier);
  };

  const handleManualItemAdded = () => {
    // Refresh feed after adding manual item
    fetchFeed();
  };

  return (
    <div className="App">
      <Header tier={tier} onTierChange={handleTierChange} />

      <main className="main-container">
        {/* Tier Indicator */}
        <TierIndicator tier={tier} />

        {/* Category Tabs */}
        <CategoryTabs selectedCategory={selectedCategory} onCategorySelect={setSelectedCategory} selectedRetailer={selectedRetailer} onRetailerSelect={setSelectedRetailer} />

        {/* Manual Input (Yearly tier only) */}
        {tier === 'yearly' && <ManualInputForm onItemAdded={handleManualItemAdded} />}

        {/* Feed */}
        {loading ? <div className="loading">⏳ Loading feed...</div> : error ? <div className="error">❌ {error}</div> : <FeedComponent items={feed} tier={tier} />}
      </main>

      {/* Upgrade CTA for Free Tier */}
      {tier === 'free' && feed.length > 0 && (
        <div className="upgrade-banner">
          <p>
            💰 Upgrade to <strong>Paid</strong> ($9.99/mo) for instant feed access,
            or <strong>Yearly</strong> ($99/yr) for manual item monitoring!
          </p>
          <button className="btn-upgrade" onClick={() => handleTierChange('paid')}>
            Upgrade to Paid
          </button>
          <button className="btn-upgrade btn-yearly" onClick={() => handleTierChange('yearly')}>
            Yearly Plan
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
