/**
 * App.js - Common utilities and service worker registration
 */

// Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
      updateViaCache: 'none'
    })
      .then(registration => {
        console.log('✅ Service Worker registered:', registration.scope);

        // Check for updates periodically
        setInterval(() => {
          registration.update().catch(err => {
            console.error('SW update check failed:', err);
          });
        }, 60000); // Every minute

        // Listen for new versions
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') {
              showUpdatePrompt();
            }
          });
        });
      })
      .catch(error => {
        console.error('Service Worker registration failed:', error);
      });

    // Listen for messages from Service Worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      const { type, data } = event.data;

      if (type === 'NEW_VERSION_AVAILABLE') {
        showUpdatePrompt();
      } else if (type === 'CACHE_CLEARED') {
        console.log('Cache cleared:', data);
      } else if (type === 'BACKGROUND_SYNC') {
        console.log('Background sync triggered:', data);
      }
    });
  });
}

// Update Prompt
function showUpdatePrompt() {
  const updateBar = document.createElement('div');
  updateBar.id = 'update-bar';
  updateBar.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 16px 20px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.15);
    z-index: 999;
    animation: slideUp 0.3s ease;
  `;

  updateBar.innerHTML = `
    <div>
      <strong>✨ New version available</strong>
      <p style="margin: 4px 0 0 0; font-size: 13px; opacity: 0.9;">Reload to get the latest features</p>
    </div>
    <div style="display: flex; gap: 12px;">
      <button id="update-dismiss" style="background: rgba(255,255,255,0.2); color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 500;">Dismiss</button>
      <button id="update-accept" style="background: white; color: #667eea; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">Reload</button>
    </div>
  `;

  document.body.appendChild(updateBar);

  document.getElementById('update-dismiss').addEventListener('click', () => {
    updateBar.remove();
  });

  document.getElementById('update-accept').addEventListener('click', () => {
    window.location.reload();
  });
}

// Install Prompt (App Installation)
let installPromptEvent;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPromptEvent = e;
  showInstallPrompt();
});

function showInstallPrompt() {
  // Check if already installed
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return; // Already installed
  }

  const installBar = document.createElement('div');
  installBar.id = 'install-bar';
  installBar.style.cssText = `
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: white;
    padding: 20px;
    border-top: 1px solid #ecf0f1;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 -2px 8px rgba(0,0,0,0.1);
    z-index: 998;
    animation: slideUp 0.3s ease;
  `;

  installBar.innerHTML = `
    <div>
      <strong style="color: #2c3e50;">📱 Install StockSpot</strong>
      <p style="margin: 4px 0 0 0; font-size: 13px; color: #95a5a6;">Get deal alerts faster as an app</p>
    </div>
    <div style="display: flex; gap: 12px;">
      <button id="install-dismiss" style="background: #f5f7fa; color: #2c3e50; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 500;">Later</button>
      <button id="install-accept" style="background: #667eea; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 600;">Install</button>
    </div>
  `;

  document.body.appendChild(installBar);

  document.getElementById('install-dismiss').addEventListener('click', () => {
    installBar.remove();
    localStorage.setItem('install-prompt-dismissed', Date.now());
  });

  document.getElementById('install-accept').addEventListener('click', () => {
    if (installPromptEvent) {
      installPromptEvent.prompt();
      installPromptEvent.userChoice.then((choiceResult) => {
        if (choiceResult.outcome === 'accepted') {
          console.log('App installed');
        }
        installBar.remove();
        installPromptEvent = null;
      });
    }
  });
}

// Check if app is running in standalone mode
if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log('🎯 Running as standalone app');
}

// Handle app visibility (pause/resume tasks)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('App hidden');
  } else {
    console.log('App visible - refreshing data');
    // Could trigger data refresh here
  }
});

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideUp {
    from {
      transform: translateY(100%);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @keyframes slideDown {
    from {
      transform: translateY(0);
      opacity: 1;
    }
    to {
      transform: translateY(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Utility: Get auth token
export function getAuthToken() {
  return localStorage.getItem('auth_token') || '';
}

// Utility: Make authenticated API call
export async function apiCall(endpoint, options = {}) {
  const headers = options.headers || {};
  const token = getAuthToken();

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `API Error: ${response.status}`);
  }

  return data;
}

// Utility: Check if online
export function isOnline() {
  return navigator.onLine;
}

// Listen for online/offline changes
window.addEventListener('online', () => {
  console.log('🌐 Back online');
  // Could trigger sync here
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(reg => {
      reg.sync.register('sync-notifications');
    });
  }
});

window.addEventListener('offline', () => {
  console.log('📴 Going offline');
});

// Push notification permission
export async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }

  return false;
}

// Register background sync
export async function registerBackgroundSync(tag = 'sync-notifications') {
  if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
    console.log('Background sync not supported');
    return false;
  }

  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.sync.register(tag);
    console.log(`✅ Background sync registered: ${tag}`);
    return true;
  } catch (error) {
    console.error('Background sync registration failed:', error);
    return false;
  }
}

// Export for use in other scripts
window.AppUtils = {
  getAuthToken,
  apiCall,
  isOnline,
  requestNotificationPermission,
  registerBackgroundSync,
  showUpdatePrompt,
  showInstallPrompt
};
