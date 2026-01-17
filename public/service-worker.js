/**
 * StockSpot Service Worker
 * Handles offline functionality, caching, and background sync
 */

const CACHE_NAME = 'stockspot-v2.0.0';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/style.css',
  '/css/dashboard.css',
  '/js/app.js',
  '/js/dashboard.js',
  '/js/auth.js',
  '/manifest.json'
];

const API_CACHE = 'stockspot-api-v1';
const FEED_CACHE = 'stockspot-feeds-v1';

/**
 * Installation: Cache essential assets
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

/**
 * Activation: Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && 
              cacheName !== API_CACHE && 
              cacheName !== FEED_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

/**
 * Fetch: Network-first with fallback to cache
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // API requests - network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          // Cache successful responses
          if (response && response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(API_CACHE).then(cache => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cached API response
          return caches.match(request)
            .then(response => {
              if (response) {
                console.log('[Service Worker] Using cached API:', request.url);
                return response;
              }
              // Return offline page if available
              return caches.match('/offline.html')
                .then(offlinePage => offlinePage || new Response('Offline', { status: 503 }));
            });
        })
    );
    return;
  }

  // Feed requests - cache-first with network update
  if (url.pathname.includes('/feeds/')) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          const fetchPromise = fetch(request)
            .then(response => {
              if (response && response.status === 200) {
                const clonedResponse = response.clone();
                caches.open(FEED_CACHE).then(cache => {
                  cache.put(request, clonedResponse);
                });
              }
              return response;
            })
            .catch(error => {
              console.log('[Service Worker] Feed fetch failed:', error);
              return cached || new Response('Feed unavailable', { status: 503 });
            });

          return cached || fetchPromise;
        })
    );
    return;
  }

  // Static assets - cache-first
  if (request.destination === 'style' || 
      request.destination === 'script' || 
      request.destination === 'image' ||
      request.destination === 'font') {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          return cached || fetch(request)
            .then(response => {
              if (response && response.status === 200) {
                const clonedResponse = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, clonedResponse);
                });
              }
              return response;
            })
            .catch(() => {
              // Return placeholder for images
              if (request.destination === 'image') {
                return new Response(
                  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="#f0f0f0" width="100" height="100"/></svg>',
                  { headers: { 'Content-Type': 'image/svg+xml' } }
                );
              }
              return new Response('Resource unavailable', { status: 503 });
            });
        })
    );
    return;
  }

  // HTML pages - network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clonedResponse = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, clonedResponse);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then(cached => {
              return cached || caches.match('/offline.html')
                .then(offlinePage => offlinePage || new Response('Offline', { status: 503 }));
            });
        })
    );
    return;
  }

  // Default: network-first
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
  );
});

/**
 * Background Sync: Sync notifications when back online
 */
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    console.log('[Service Worker] Syncing notifications...');
    event.waitUntil(
      fetch('/api/notifications/process', { method: 'POST' })
        .then(response => {
          if (response.ok) {
            console.log('[Service Worker] Notifications synced');
            // Notify all clients
            self.clients.matchAll().then(clients => {
              clients.forEach(client => {
                client.postMessage({
                  type: 'notification-sync',
                  status: 'success'
                });
              });
            });
          }
        })
        .catch(error => {
          console.error('[Service Worker] Sync failed:', error);
          // Retry later
          return Promise.reject();
        })
    );
  }
});

/**
 * Push Notifications
 */
self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push received');
  
  const options = {
    body: event.data ? event.data.text() : 'New deal available!',
    icon: '/images/icon-192x192.png',
    badge: '/images/badge-72x72.png',
    tag: 'stockspot-notification',
    requireInteraction: false,
    actions: [
      {
        action: 'open',
        title: 'View Deal'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('StockSpot Deal Alert', options)
  );
});

/**
 * Notification Click Handler
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        // Check if app is already open
        for (let client of clientList) {
          if (client.url === '/' && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if not open
        if (clients.openWindow) {
          return clients.openWindow('/dashboard.html');
        }
      })
    );
  }
});

/**
 * Notification Close Handler
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[Service Worker] Notification dismissed');
});

/**
 * Message Handler: Receive messages from clients
 */
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.delete(event.data.cacheName).then(() => {
      event.ports[0].postMessage({
        type: 'cache-cleared',
        cacheName: event.data.cacheName
      });
    });
  }

  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    let totalSize = 0;
    caches.keys().then(cacheNames => {
      Promise.all(
        cacheNames.map(cacheName => {
          return caches.open(cacheName).then(cache => {
            return cache.keys().then(requests => {
              return Promise.all(
                requests.map(request => {
                  return cache.match(request).then(response => {
                    return response.blob().then(blob => blob.size);
                  });
                })
              );
            });
          });
        })
      ).then(sizes => {
        sizes.forEach(size => {
          if (Array.isArray(size)) {
            totalSize += size.reduce((a, b) => a + b, 0);
          }
        });

        event.ports[0].postMessage({
          type: 'cache-size',
          size: totalSize
        });
      });
    });
  }
});

console.log('[Service Worker] Loaded and ready');
