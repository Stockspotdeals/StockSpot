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
    this.topOpportunities = [];
    this.watchlistItems = [];
    this.alertItems = [];
    this.isLoading = false;
    this.hasMore = true;
    this.pushEnabled = false;
    this.signalSourceEndpoint = '/api/signals/live';

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
    this.topOpportunitiesContainer = document.getElementById('top-opportunities');
    this.watchlistForm = document.getElementById('watchlist-form');
    this.watchlistKeywordInput = document.getElementById('watchlist-keyword');
    this.watchlistList = document.getElementById('watchlist-list');
    this.recentAlertsList = document.getElementById('recent-alerts-list');
    this.notificationBtn = document.getElementById('notification-btn');
    this.liveStatusBadge = document.getElementById('live-status-badge');

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

    // Watchlist form
    if (this.watchlistForm) {
      this.watchlistForm.addEventListener('submit', (e) => this.handleWatchlistAdd(e));
    }

    if (this.notificationBtn) {
      this.notificationBtn.addEventListener('click', () => this.handleNotificationToggle());
    }

    // Load more button
    if (this.loadMoreBtn) {
      this.loadMoreBtn.addEventListener('click', () => this.loadMoreItems());
    }

    // Check authentication - use safe UI state instead of instant redirect
    if (!this.authToken && !this.userEmail) {
      console.warn('No authentication detected - rendering guest state');
      this.renderAuthRequiredState();
    }
  }

  async loadFeed() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.refreshBtn.disabled = true;
    this.refreshBtn.innerHTML = '<span class="spinner"></span> <span id="refresh-text">Refreshing...</span>';

    try {
      await Promise.all([
        this.loadSignals(),
        this.loadWatchlist(),
        this.loadRecentAlerts()
      ]);
      await this.loadPushSubscriptionState();
      this.applyFilter();
      this.renderTopOpportunities();
      this.showNotification('✅ Signals updated', 'success');
    } catch (error) {
      console.warn('API signals load failed, falling back to RSS feed:', error);
      await this.loadFeedFromAPI();
    } finally {
      this.isLoading = false;
      this.refreshBtn.disabled = false;
      this.refreshBtn.innerHTML = '<span>🔄</span> <span id="refresh-text">Refresh</span>';
    }
  }

  async loadSignals() {
    const headers = {};
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const endpoints = ['/api/signals/live', '/api/signals'];
    let data = null;
    let response = null;

    for (const endpoint of endpoints) {
      try {
        response = await fetch(endpoint, { headers });
        data = await response.json();

        if (response.ok && Array.isArray(data.signals)) {
          this.signalSourceEndpoint = endpoint;
          break;
        }

        console.warn(`Signal fetch from ${endpoint} failed, trying next endpoint.`, response.status, data && data.error);
      } catch (error) {
        console.warn(`Signal fetch from ${endpoint} threw, trying fallback.`, error);
      }
    }

    if (!response || !response.ok || !Array.isArray(data.signals)) {
      this.signalSourceEndpoint = '/api/signals';
      throw new Error((data && data.error) || 'Failed to load signals from live or fallback endpoint');
    }

    const signals = data.signals;
    this.allFeedItems = signals.map(signal => ({
      title: signal.title || signal.productName || 'Signal Opportunity',
      description: signal.description || signal.metadata?.notes || '',
      retailer: (signal.store || 'unknown').toLowerCase(),
      price: typeof signal.price === 'number' ? signal.price.toFixed(2) : signal.price || 'N/A',
      url: signal.affiliateUrl || '#',
      timestamp: new Date(signal.createdAt),
      guid: signal._id,
      source: signal.source || 'signal',
      score: typeof signal.score === 'number' ? signal.score : 0,
      signalType: signal.signalType,
      premiumOnly: signal.premiumOnly
    }));

    this.page = 0;
    this.filteredItems = [...this.allFeedItems];
    this.topOpportunities = [...this.allFeedItems]
      .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.timestamp - a.timestamp))
      .slice(0, 5);

    this.updateLiveStatusBadge(this.signalSourceEndpoint);
  }

  updateLiveStatusBadge(endpoint) {
    if (!this.liveStatusBadge) return;

    const isLive = endpoint === '/api/signals/live';
    this.liveStatusBadge.textContent = isLive ? 'Live feed' : 'Fallback feed';
    this.liveStatusBadge.classList.toggle('fallback', !isLive);
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
    const sorted = itemsToDisplay.sort((a, b) => {
      const scoreA = a.score || 0;
      const scoreB = b.score || 0;
      if (scoreB !== scoreA) {
        return scoreB - scoreA;
      }
      return b.timestamp - a.timestamp;
    });

    // Group by day
    this.feedContainer.innerHTML = this.renderFeedItems(sorted);
    this.loadMoreContainer.style.display = this.hasMore ? 'block' : 'none';
  }

  renderTopOpportunities() {
    if (!this.topOpportunitiesContainer) return;

    if (!this.topOpportunities.length) {
      this.topOpportunitiesContainer.innerHTML = '<div style="color: var(--gray);">No top opportunities available yet.</div>';
      return;
    }

    this.topOpportunitiesContainer.innerHTML = this.topOpportunities.map(item => this.renderTopOpportunityCard(item)).join('');
  }

  renderTopOpportunityCard(item) {
    return `
      <div class="opportunity-card">
        <div>
          <div class="opportunity-badge">${this.escapeHTML(item.signalType || 'Signal')}</div>
          <h3>${this.escapeHTML(item.title)}</h3>
          <div class="opportunity-score">⭐ Opportunity Score: ${item.score ?? 'N/A'}</div>
          <div style="color: var(--gray); font-size: 13px;">${this.escapeHTML(item.description.substring(0, 120))}${item.description.length > 120 ? '...' : ''}</div>
        </div>
        <a href="${item.url}" target="_blank">View Opportunity →</a>
      </div>
    `;
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

        ${item.score != null ? `<div class="feed-price">⭐ Opportunity Score: ${item.score}</div>` : ''}

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

  async loadWatchlist() {
    if (!this.authToken) {
      if (this.watchlistList) {
        this.watchlistList.innerHTML = '<div style="color: var(--gray);">Login to manage your watchlist.</div>';
      }
      this.watchlistItems = [];
      return;
    }

    try {
      const response = await fetch('/api/watchlist', {
        headers: {
          Authorization: `Bearer ${this.authToken}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load watchlist');
      }

      this.watchlistItems = Array.isArray(data.watchlist) ? data.watchlist : [];
      this.renderWatchlist();
    } catch (error) {
      console.error('Watchlist load failed:', error);
      if (this.watchlistList) {
        this.watchlistList.innerHTML = `<div style="color: var(--gray);">Unable to load watchlist.</div>`;
      }
    }
  }

  renderWatchlist() {
    if (!this.watchlistList) return;
    if (!this.watchlistItems.length) {
      this.watchlistList.innerHTML = '<div style="color: var(--gray);">No watchlist keywords yet. Add one to start receiving alerts.</div>';
      return;
    }

    this.watchlistList.innerHTML = this.watchlistItems.map(item => `
      <div class="watchlist-item">
        <div class="watchlist-keyword">${this.escapeHTML(item.keyword)}</div>
        <button class="btn btn-tertiary btn-sm" onclick="dashboard.removeWatchlistItem('${item._id}')">Remove</button>
      </div>
    `).join('');
  }

  async handleWatchlistAdd(e) {
    e.preventDefault();

    if (!this.authToken) {
      this.showNotification('You must be logged in to save watchlist keywords', 'error');
      return;
    }

    const keyword = this.watchlistKeywordInput?.value.trim();
    if (!keyword) {
      this.showNotification('Please enter a keyword to watch for', 'error');
      return;
    }

    try {
      const response = await fetch('/api/watchlist', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ keyword })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Unable to add watchlist keyword');
      }

      this.showNotification('✅ Watchlist keyword added', 'success');
      this.watchlistKeywordInput.value = '';
      await this.loadWatchlist();
    } catch (error) {
      console.error('Watchlist add failed:', error);
      this.showNotification(error.message || 'Failed to add watchlist keyword', 'error');
    }
  }

  async loadPushSubscriptionState() {
    if (!this.authToken || !this.notificationBtn) {
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      this.updateNotificationButton(false, 'Push not supported');
      return;
    }

    try {
      const response = await fetch('/api/push', {
        headers: {
          Authorization: `Bearer ${this.authToken}`
        }
      });
      const data = await response.json();
      const enabled = response.ok && Array.isArray(data.subscriptions) && data.subscriptions.length > 0;
      this.updateNotificationButton(enabled);
    } catch (error) {
      console.error('Failed to load push subscription state:', error);
      this.updateNotificationButton(false);
    }
  }

  async handleNotificationToggle() {
    if (!this.authToken) {
      this.showNotification('You must be logged in to enable notifications', 'error');
      return;
    }

    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      this.showNotification('Push notifications are not supported in this browser', 'error');
      return;
    }

    if (Notification.permission === 'denied') {
      this.showNotification('Please enable browser notifications in your settings', 'error');
      return;
    }

    if (this.pushEnabled) {
      await this.unsubscribeFromPush();
    } else {
      await this.subscribeToPush();
    }
  }

  async subscribeToPush() {
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.showNotification('Notification permission denied', 'error');
        return;
      }

      const keyResponse = await fetch('/api/push/vapid-public-key');
      const keyData = await keyResponse.json();
      if (!keyResponse.ok || !keyData.publicKey) {
        throw new Error('Unable to retrieve VAPID public key');
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(keyData.publicKey)
      });

      const response = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`
        },
        body: JSON.stringify({ subscription })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save push subscription');
      }

      this.showNotification('✅ Push notifications enabled', 'success');
      this.updateNotificationButton(true);
    } catch (error) {
      console.error('Push subscription failed:', error);
      this.showNotification(error.message || 'Unable to enable push notifications', 'error');
      this.updateNotificationButton(false);
    }
  }

  async unsubscribeFromPush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();
        await fetch('/api/push/unsubscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.authToken}`
          },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
      }

      this.showNotification('🔕 Push notifications disabled', 'success');
      this.updateNotificationButton(false);
    } catch (error) {
      console.error('Push unsubscribe failed:', error);
      this.showNotification(error.message || 'Unable to disable push notifications', 'error');
    }
  }

  updateNotificationButton(enabled, label) {
    if (!this.notificationBtn) return;

    this.pushEnabled = enabled;
    this.notificationBtn.textContent = label || (enabled ? '🔕 Disable Push' : '🔔 Enable Push');
    this.notificationBtn.classList.toggle('btn-primary', enabled);
    this.notificationBtn.classList.toggle('btn-secondary', !enabled);
  }

  urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  async removeWatchlistItem(id) {
    if (!this.authToken) {
      this.showNotification('You must be logged in to update watchlist', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/watchlist/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${this.authToken}`
        }
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Unable to remove watchlist item');
      }

      this.showNotification('✅ Watchlist item removed', 'success');
      await this.loadWatchlist();
    } catch (error) {
      console.error('Watchlist remove failed:', error);
      this.showNotification(error.message || 'Failed to remove watchlist item', 'error');
    }
  }

  async loadRecentAlerts() {
    if (!this.authToken) {
      if (this.recentAlertsList) {
        this.recentAlertsList.innerHTML = '<div style="color: var(--gray);">Login to see your recent alerts.</div>';
      }
      this.alertItems = [];
      return;
    }

    try {
      const response = await fetch('/api/alerts', {
        headers: {
          Authorization: `Bearer ${this.authToken}`
        }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load alerts');
      }

      this.alertItems = Array.isArray(data.alerts) ? data.alerts : [];
      this.renderRecentAlerts();
    } catch (error) {
      console.error('Recent alerts load failed:', error);
      if (this.recentAlertsList) {
        this.recentAlertsList.innerHTML = `<div style="color: var(--gray);">Unable to load recent alerts.</div>`;
      }
    }
  }

  renderRecentAlerts() {
    if (!this.recentAlertsList) return;
    if (!this.alertItems.length) {
      this.recentAlertsList.innerHTML = '<div style="color: var(--gray);">No recent alerts yet. Matched signals will appear here.</div>';
      return;
    }

    this.recentAlertsList.innerHTML = this.alertItems.map(alert => {
      const statusClass = alert.delivered ? 'alert-status' : 'alert-status pending';
      const signal = alert.signal || {};
      return `
        <div class="alert-item">
          <div>
            <div class="alert-label">${this.escapeHTML(alert.keyword)} matched</div>
            <div class="alert-details">
              <div>${signal.productName ? this.escapeHTML(signal.productName) : 'Unknown signal'}</div>
              <div>Type: ${this.escapeHTML(signal.signalType || 'Deal')}</div>
              <div>Status: <span class="${statusClass}">${alert.delivered ? 'Delivered' : 'Pending'}</span></div>
            </div>
          </div>
          <div class="alert-actions">
            ${signal.affiliateUrl ? `<a href="${signal.affiliateUrl}" target="_blank" class="btn btn-primary btn-sm">View</a>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  showSettings() {
    alert(`User Settings\n\nEmail: ${this.userEmail}\nTier: ${this.userTier}\n\nMore settings coming soon!`);
  }

  /**
   * Render safe auth-required state instead of redirecting
   * Shows friendly message with login button
   */
  renderAuthRequiredState() {
    this.feedContainer.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem;">
        <h2 style="color: var(--text); margin-bottom: 1rem;">Authentication Required</h2>
        <p style="color: var(--gray); margin-bottom: 1.5rem;">You need to be logged in to view the dashboard.</p>
        <a href="/" style="display: inline-block; padding: 0.75rem 1.5rem; background: var(--primary); color: white; border-radius: 0.5rem; text-decoration: none; font-weight: 600;">
          Return to Login
        </a>
      </div>
    `;
    this.tierDisplay.textContent = 'Guest';
    this.tierBadge.className = 'tier-badge';
    this.tierBadge.innerHTML = '<span>🔓</span> <span id="tier-text">Guest</span>';
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
