'use strict';
// Migration kill-switch.
//
// An earlier release of this site registered a root-scoped, cache-first service worker while the
// game itself was served from the site root. That worker cached the game as the entry point and
// kept serving it at "/" after the landing page replaced it.
//
// This file exists only to retire that worker: it clears the stale caches, claims no clients and
// unregisters itself. It deliberately installs no fetch handler, so nothing is ever served from
// cache here. No page registers this worker; browsers pick it up as an update to the old one.
const PREFIX = 'scrap-gun-shell-';

async function purgeStaleCaches() {
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX)).map(k => caches.delete(k)));
  } catch (err) {
    // Cache storage unavailable: nothing to clean up.
  }
}

self.addEventListener('install', event => {
  event.waitUntil(purgeStaleCaches().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await purgeStaleCaches();
    try { await self.clients.claim(); } catch (err) {}
    try { await self.registration.unregister(); } catch (err) {}
  })());
});
