'use strict';
// [FEAT-F84] Network-first shell.
//
// This worker used to serve the shell cache-first, which meant an updated build could keep being
// masked by the cached copy long after a release. It now prefers the network and only falls back
// to the cache when the network fails (offline play), so online visitors always get the newest build.
const CACHE_NAME = 'scrap-gun-shell-v8';
const SHELL = ['./', './index.html', './styles.css', './game.min.js', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME)
    .then(cache => cache.addAll(SHELL))
    .catch(() => {})
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys
      .filter(key => key.startsWith('scrap-gun-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(event.request);
      if (fresh && fresh.ok) {
        try {
          const copy = fresh.clone();
          const cache = await caches.open(CACHE_NAME);
          await cache.put(event.request, copy);
        } catch (e) {}
      }
      return fresh;
    } catch (e) {
      const hit = await caches.match(event.request);
      if (hit) return hit;
      const shell = await caches.match('./index.html');
      if (shell) return shell;
      return new Response('', { status: 503, statusText: 'offline' });
    }
  })());
});
