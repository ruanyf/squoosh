import {
  cacheOrNetworkAndCache,
  cleanupCache,
  cacheOrNetwork,
  cacheBasics,
  cacheAdditionalProcessors,
  serveShareTarget,
} from './util';
import { get } from 'idb-keyval';
import { shouldCacheDynamically } from './to-cache';

// Give TypeScript the correct global.
declare var self: ServiceWorkerGlobalScope;

// The app may be deployed under a subdirectory (e.g. `/squoosh/`), so routes
// like `/editor` and `/` become `<base>/editor` and `<base>/`. `__BASE_PATH__`
// always ends with `/` (`/` for a root deployment).
const ROUTE_EDITOR = __BASE_PATH__ + 'editor';

const versionedCache = 'static-' + VERSION;
const dynamicCache = 'dynamic';
const expectedCaches = [versionedCache, dynamicCache];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async function () {
      const promises = [];
      promises.push(cacheBasics(versionedCache));

      // If the user has already interacted with the app, update the codecs too.
      if (await get('user-interacted')) {
        promises.push(cacheAdditionalProcessors(versionedCache));
      }

      await Promise.all(promises);
    })(),
  );
});

self.addEventListener('activate', (event) => {
  self.clients.claim();

  event.waitUntil(
    (async function () {
      // Remove old caches.
      const promises = (await caches.keys()).map((cacheName) => {
        if (!expectedCaches.includes(cacheName))
          return caches.delete(cacheName);
      });

      await Promise.all<any>(promises);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Don't care about other-origin URLs
  if (url.origin !== location.origin) return;

  if (url.pathname === ROUTE_EDITOR) {
    event.respondWith(Response.redirect(__BASE_PATH__));
    return;
  }

  if (
    url.pathname === __BASE_PATH__ &&
    url.searchParams.has('share-target') &&
    event.request.method === 'POST'
  ) {
    serveShareTarget(event);
    return;
  }

  // We only care about GET from here on in.
  if (event.request.method !== 'GET') return;

  if (shouldCacheDynamically(url.pathname)) {
    cacheOrNetworkAndCache(event, dynamicCache);
    cleanupCache(event, dynamicCache, ASSETS);
    return;
  }

  cacheOrNetwork(event);
});

self.addEventListener('message', (event) => {
  switch (event.data) {
    case 'cache-all':
      event.waitUntil(cacheAdditionalProcessors(versionedCache));
      break;
    case 'skip-waiting':
      self.skipWaiting();
      break;
  }
});
