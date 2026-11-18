/**
 * HashiBot Advanced Progressive Web App Service Worker
 * Strategy:
 *  - Navigation / HTML: Network-First with Cache fallback & offline shell
 *  - Static Assets (JS, CSS, fonts, icons, manifest): Cache-First with Network fallback & revalidation
 *  - API / Backend calls (Supabase, Websockets, external APIs): Always Network (never stale cache)
 *  - Auto-purge of stale cache versions on upgrade
 */

const CACHE_VERSION = 'hashibot-pwa-v1.0.1';
const STATIC_CACHE_NAME = `hashibot-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE_NAME = `hashibot-dynamic-${CACHE_VERSION}`;

// Core assets to pre-cache immediately on install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Domains / patterns to never cache (real-time trading APIs, Supabase, streaming)
const EXCLUDED_PATTERNS = [
  /supabase\.co/,
  /\/api\//,
  /\/research\//, // Published evidence must not be replaced by an older cached study.
  /\/rest\/v1\//,
  /\/realtime\/v1\//,
  /\/auth\/v1\//,
  /binance\.com/,
  /bybit\.com/,
  /chrome-extension/
];

// Helper: Determine if request should bypass cache entirely
function shouldBypassCache(url) {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(url.href));
}

// Helper: Check if request is for static assets
function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    /\.(js|css|png|jpg|jpeg|svg|webp|woff|woff2|ttf|eot|ico|json)$/i.test(url.pathname)
  );
}

// 1. INSTALL EVENT - Pre-cache core app shell and skip waiting immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE_NAME)
      .then(async (cache) => {
        // Attempt to cache essential assets gracefully without blocking install on missing optional files
        const results = await Promise.allSettled(
          PRECACHE_ASSETS.map((asset) =>
            fetch(asset, { cache: 'no-cache' }).then((response) => {
              if (response && response.ok) {
                return cache.put(asset, response);
              }
            })
          )
        );
        return results;
      })
      .then(() => self.skipWaiting())
  );
});

// 2. ACTIVATE EVENT - Clean up obsolete caches & claim control of clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete any cache that does not match current version
            if (
              cacheName.startsWith('hashibot-') &&
              cacheName !== STATIC_CACHE_NAME &&
              cacheName !== DYNAMIC_CACHE_NAME
            ) {
              console.log(`[PWA ServiceWorker] Purging stale cache: ${cacheName}`);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
      .then(() => {
        // Broadcast update event to active browser tabs if needed
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'PWA_UPDATED', version: CACHE_VERSION });
          });
        });
      })
  );
});

// 3. FETCH EVENT - Intelligent Routing Strategies
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Bypass cache for external APIs, Supabase auth/data, and non-http schemes
  if (!url.protocol.startsWith('http') || shouldBypassCache(url)) {
    return;
  }

  // Strategy A: Navigation / HTML Page Requests (Network First with Cache Fallback)
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          // If valid response, update the dynamic cache with fresh HTML
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Offline: Fall back to cached HTML or app shell
          const cachedPage = await caches.match(request);
          if (cachedPage) return cachedPage;

          const cachedShell = await caches.match('/index.html');
          if (cachedShell) return cachedShell;

          return new Response(
            `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
              <title>HashiBot — Offline</title>
              <style>
                body { background: #09090b; color: #f4f4f5; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; text-align: center; }
                .card { max-width: 380px; padding: 32px 24px; border: 1px solid #27272a; border-radius: 16px; background: #18181b; }
                .btn { display: inline-block; margin-top: 20px; padding: 10px 20px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; cursor: pointer; }
              </style>
            </head>
            <body>
              <div class="card">
                <div style="font-size: 40px; margin-bottom: 16px;">⚡</div>
                <h1 style="font-size: 20px; margin: 0 0 8px 0; font-weight: 700;">HashiBot Offline</h1>
                <p style="font-size: 14px; color: #a1a1aa; margin: 0; line-height: 1.5;">You are currently disconnected. Check your internet connection and reload to resume real-time intelligence.</p>
                <a href="/" class="btn" onclick="window.location.reload(); return false;">Reconnect</a>
              </div>
            </body>
            </html>`,
            {
              headers: { 'Content-Type': 'text/html' }
            }
          );
        })
    );
    return;
  }

  // Strategy B: Static Assets (Cache First, fallback to Network with background refresh)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Revalidate in background to keep cache fresh
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                caches.open(STATIC_CACHE_NAME).then((cache) => {
                  cache.put(request, networkResponse);
                });
              }
            })
            .catch(() => {
              // Ignore background fetch error when offline
            });
          return cachedResponse;
        }

        // Fetch from network and store into static cache
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.ok) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Strategy C: Other requests (Network first with cache fallback)
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(DYNAMIC_CACHE_NAME).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});

// 4. MESSAGE EVENT - Listen for user prompt updates / skip waiting triggers
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
