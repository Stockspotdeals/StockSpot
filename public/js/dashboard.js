/**
 * Dashboard - Real-time feed loading and display
 */

class Dashboard {
  constructor() {
    this.currentFilter = 'all';
    this.page = 0;
    this.pageSize = 20;
    this.userTier = localStorage.getItem('user_tier') || 'FREE';
    this.userEmail = localStorage.getItem('user_email') || '';
    this.authToken = localStorage.getItem('auth_token') || '';
    this.allFeedItems = [];
    this.filteredItems = [];
    this.isLoading = false;
    this.hasMore = true;

    this.initializeElements();
    this.setupEventListeners();
    this.loadFeed();
  }

  initializeElements() {
    // Get DOM elements
    this.feedContainer = document.getElementById('feed-container');
    this.emptyState = document.getElementById('empty-state');
    this.refreshBtn = document.getElementById('refresh-btn');
    this.filterBtns = document.querySelectorAll('.filter-btn');
    this.tierDisplay = document.getElementById('tier-text');
    this.tierBadge = document.getElementById('tier-display');
    this.logoutBtn = document.getElementById('logout-btn');
    this.settingsBtn = document.getElementById('settings-btn');
    this.fabBtn = document.getElementById('fab-btn');
    this.addItemModal = document.getElementById('add-item-modal');
    this.modalClose = document.getElementById('modal-close');
    this.addItemForm = document.getElementById('add-item-form');
    this.loadMoreBtn = document.getElementById('load-more-btn');
    this.loadMoreContainer = document.getElementById('load-more-container');

    // Update tier display
    this.updateTierDisplay();
  }

  setupEventListeners() {
    // Filter buttons
    this.filterBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentFilter = btn.dataset.filter;
        this.page = 0;
        this.applyFilter();
      });
    });

    // Refresh button
    this.refreshBtn.addEventListener('click', () => this.loadFeed());

    // Logout button
    this.logoutBtn.addEventListener('click', () => this.logout());

    // Settings button
    this.settingsBtn.addEventListener('click', () => this.showSettings());

    // FAB (Add Item) - YEARLY only
    if (this.userTier === 'YEARLY') {
      this.fabBtn.classList.remove('hidden');
      this.fabBtn.addEventListener('click', () => this.showAddItemModal());
    }

    // Modal controls
    this.modalClose.addEventListener('click', () => this.hideAddItemModal());
    this.addItemModal.addEventListener('click', (e) => {
      if (e.target === this.addItemModal) this.hideAddItemModal();
    });

    // Add item form
    if (this.addItemForm) {
      this.addItemForm.addEventListener('submit', (e) => this.handleAddItem(e));
    }

    // Load more button
    if (this.loadMoreBtn) {
      this.loadMoreBtn.addEventListener('click', () => this.loadMoreItems());
    }

    // Check authentication
    if (!this.authToken && !this.userEmail) {
      window.location.href = '/';
    }
  }

  async loadFeed() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.refreshBtn.disabled = true;
    this.refreshBtn.innerHTML = '<span class="spinner"></span> <span id="refresh-text">Refreshing...</span>';

    try {
      // Load from RSS feed (which aggregates all feeds)
      const response = await fetch('/feeds/public.xml');
      const text = await response.text();

      // Parse RSS
      const items = this.parseRSSFeed(text);

      // Apply tier-based filtering
      this.allFeedItems = this.applyTierFiltering(items);
      
      // Reset pagination
      this.page = 0;
      this.filteredItems = [...this.allFeedItems];
      
      this.displayItems();
      this.showNotification('✅ Feed updated', 'success');
    } catch (error) {
      console.error('Feed load error:', error);
      this.showNotification('Failed to load feed', 'error');
      
      // Try API fallback
      this.loadFeedFromAPI();
    } finally {
      this.isLoading = false;
      this.refreshBtn.disabled = false;
      this.refreshBtn.innerHTML = '<span>🔄</span> <span id="refresh-text">Refresh</span>';
    }
  }

  async loadFeedFromAPI() {
    try {
      const headers = {};
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch('/api/notifications/history?limit=50', { headers });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      // Transform to feed items
      this.allFeedItems = data.notifications.map(notif => ({
        title: notif.productName || 'New Deal',
        description: notif.description || '',
        retailer: notif.retailer || 'Unknown',
        price: notif.price || 'N/A',
        url: notif.url || '#',
        timestamp: new Date(notif.createdAt),
        source: notif.source || 'api'
      }));

      this.filteredItems = [...this.allFeedItems];
      this.displayItems();
    } catch (error) {
      console.error('API fallback error:', error);
      this.emptyState.style.display = 'block';
    }
  }

  parseRSSFeed(xmlText) {
    const items = [];
    
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

      if (xmlDoc.getElementsByTagName('parsererror').length) {
        throw new Error('RSS Parse error');
      }

      const entries = xmlDoc.getElementsByTagName('item');
      
      for (let entry of entries) {
        const item = {
          title: this.getXMLText(entry, 'title'),
          description: this.getXMLText(entry, 'description'),
          retailer: this.getXMLText(entry, 'category'),
          price: this.getXMLText(entry, 'price') || 'Contact',
          url: this.getXMLText(entry, 'link'),
          timestamp: new Date(this.getXMLText(entry, 'pubDate')),
          guid: this.getXMLText(entry, 'guid'),
          source: 'rss'
        };

        // Clean retailer name
        item.retailer = item.retailer.toLowerCase().split(/[\s,]+/)[0];
        
        items.push(item);
      }
    } catch (error) {
      console.error('RSS parse error:', error);
    }

    return items;
  }

  getXMLText(element, tagName) {
    const node = element.getElementsByTagName(tagName)[0];
    return node ? node.textContent.trim() : '';
  }

  applyTierFiltering(items) {
    // Apply delay for FREE tier (10 minutes for non-Amazon)
    const now = Date.now();
    const freeDelay = 10 * 60 * 1000; // 10 minutes

    return items.filter(item => {
      if (this.userTier === 'FREE') {
        // Amazon: instant
        if (item.retailer === 'amazon') return true;
        
        // Others: 10-minute delay
        const itemAge = now - item.timestamp.getTime();
        return itemAge > freeDelay;
      }
      
      // PAID/YEARLY: all items, no delay
      return true;
    });
  }

  applyFilter() {
    if (this.currentFilter === 'all') {
      this.filteredItems = [...this.allFeedItems];
    } else {
      this.filteredItems = this.allFeedItems.filter(
        item => item.retailer.toLowerCase() === this.currentFilter.toLowerCase()
      );
    }

    this.page = 0;
    this.displayItems();
  }

  displayItems() {
    const startIdx = this.page * this.pageSize;
    const endIdx = startIdx + this.pageSize;
    const itemsToDisplay = this.filteredItems.slice(0, endIdx);

    // Check if there are more items
    this.hasMore = this.filteredItems.length > endIdx;

    if (itemsToDisplay.length === 0) {
      this.feedContainer.innerHTML = '';
      this.emptyState.style.display = 'block';
      this.loadMoreContainer.style.display = 'none';
      return;
    }

    this.emptyState.style.display = 'none';

    // Sort by timestamp (newest first)
    const sorted = itemsToDisplay.sort((a, b) => b.timestamp - a.timestamp);

    // Group by day
    this.feedContainer.innerHTML = this.renderFeedItems(sorted);
    this.loadMoreContainer.style.display = this.hasMore ? 'block' : 'none';
  }

  renderFeedItems(items) {
    const groups = {};

    // Group by date
    items.forEach(item => {
      const date = this.formatDate(item.timestamp);
      if (!groups[date]) groups[date] = [];
      groups[date].push(item);
    });

    let html = '';

    Object.entries(groups).forEach(([date, dayItems]) => {
      html += `<h3 style="margin-top: 30px; margin-bottom: 15px; font-size: 14px; font-weight: 600; color: var(--gray); text-transform: uppercase; letter-spacing: 0.5px;">${date}</h3>`;

      dayItems.forEach(item => {
        html += this.renderFeedItem(item);
      });
    });

    return html;
  }

  renderFeedItem(item) {
    const time = this.formatTime(item.timestamp);
    const retailerIcon = this.getRetailerIcon(item.retailer);

    return `
      <div class="feed-item" data-id="${item.guid || item.url}">
        <div class="feed-header">
          <div class="feed-title">${this.escapeHTML(item.title)}</div>
          <span class="retailer-badge ${item.retailer}">${retailerIcon} ${this.capitalizeRetailer(item.retailer)}</span>
        </div>

        ${item.price && item.price !== 'Contact' ? `<div class="feed-price">$${item.price}</div>` : ''}

        ${item.description ? `<div class="feed-description">${this.escapeHTML(item.description.substring(0, 150))}${item.description.length > 150 ? '...' : ''}</div>` : ''}

        <div class="feed-meta">
          <span class="time-badge">⏰ ${time}</span>
        </div>

        <div class="feed-actions">
          <a href="${item.url}" target="_blank" class="feed-btn feed-btn-view">View Deal →</a>
          <button class="feed-btn feed-btn-ignore" onclick="dashboard.markAsRead(this)">✓ Done</button>
        </div>
      </div>
    `;
  }

  markAsRead(btn) {
    const item = btn.closest('.feed-item');
    item.style.opacity = '0.5';
    item.style.pointerEvents = 'none';
  }

  loadMoreItems() {
    this.page++;
    this.displayItems();
  }

  showAddItemModal() {
    if (this.userTier !== 'YEARLY') return;
    this.addItemModal.classList.add('show');
  }

  hideAddItemModal() {
    this.addItemModal.classList.remove('show');
  }

  async handleAddItem(e) {
    e.preventDefault();

    const name = document.getElementById('item-name').value.trim();
    const url = document.getElementById('item-url').value.trim();
    const price = parseFloat(document.getElementById('item-price').value);

    if (!name || !url || !price) {
      this.showNotification('Please fill in all fields', 'error');
      return;
    }

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (this.authToken) {
        headers['Authorization'] = `Bearer ${this.authToken}`;
      }

      const response = await fetch('/api/notifications/manual-items', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          productName: name,
          url,
          targetPrice: price
        })
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.error);

      this.showNotification('✅ Item added successfully', 'success');
      this.addItemForm.reset();
      this.hideAddItemModal();
    } catch (error) {
      console.error('Add item error:', error);
      this.showNotification(error.message || 'Failed to add item', 'error');
    }
  }

  showSettings() {
    alert(`User Settings\n\nEmail: ${this.userEmail}\nTier: ${this.userTier}\n\nMore settings coming soon!`);
  }

  logout() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_tier');
    window.location.href = '/';
  }

  updateTierDisplay() {
    const tierMap = {
      'FREE': { icon: '🎁', name: 'Free', class: '' },
      'PAID': { icon: '⭐', name: 'Paid', class: 'paid' },
      'YEARLY': { icon: '👑', name: 'Yearly', class: 'yearly' }
    };

    const tier = tierMap[this.userTier] || tierMap['FREE'];
    this.tierDisplay.textContent = tier.name;
    this.tierBadge.className = `tier-badge ${tier.class}`;
    this.tierBadge.innerHTML = `<span>${tier.icon}</span> <span id="tier-text">${tier.name}</span>`;
  }

  getRetailerIcon(retailer) {
    const icons = {
      'amazon': '🛍️',
      'walmart': '🏪',
      'target': '🎯',
      'bestbuy': '🔌',
      'pokemon': '🎴',
      'sports': '🏆'
    };
    return icons[retailer.toLowerCase()] || '🛒';
  }

  capitalizeRetailer(retailer) {
    const names = {
      'amazon': 'Amazon',
      'walmart': 'Walmart',
      'target': 'Target',
      'bestbuy': 'Best Buy',
      'pokemon': 'Pokemon TCG',
      'sports': 'Sports Cards'
    };
    return names[retailer.toLowerCase()] || retailer;
  }

  formatDate(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
    }
  }

  formatTime(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  escapeHTML(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notif = document.createElement('div');
    notif.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 16px 24px;
      background: ${type === 'success' ? '#27ae60' : type === 'error' ? '#e74c3c' : '#667eea'};
      color: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1000;
      animation: slideIn 0.3s ease;
      font-weight: 500;
      max-width: 300px;
    `;
    notif.textContent = message;
    document.body.appendChild(notif);

    // Auto-remove after 3 seconds
    setTimeout(() => {
      notif.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => notif.remove(), 300);
    }, 3000);
  }
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Initialize on page load
let dashboard;
document.addEventListener('DOMContentLoaded', () => {
  dashboard = new Dashboard();
});

// Pull-to-refresh support
let pullStartY = 0;
document.addEventListener('touchstart', (e) => {
  pullStartY = e.touches[0].clientY;
});

document.addEventListener('touchmove', (e) => {
  if (document.documentElement.scrollTop === 0) {
    const pullDistance = e.touches[0].clientY - pullStartY;
    if (pullDistance > 80) {
      dashboard.loadFeed();
    }
  }
});
