/* CURSED WORLD — service worker: офлайн-режим без внешних зависимостей.
   Стратегия: навигация — network-first с откатом на кэш; статика — stale-while-revalidate.
   При установке кэшируются все файлы из precache.json (генерируется при сборке: JS/CSS всех страниц, шрифты),
   плюс то, на что ссылается index.html. */
const CACHE = 'cursed-world-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './favicon.svg', './icons/icon-192.png', './icons/icon-512.png'];

async function precache() {
  const cache = await caches.open(CACHE);
  await cache.addAll(CORE).catch(() => {});
  try {
    const list = await (await fetch('./precache.json', { cache: 'no-store' })).json();
    if (Array.isArray(list)) await Promise.all(list.map((f) => cache.add(new URL(f, self.registration.scope).href).catch(() => {})));
  } catch (e) {
    /* в dev-режиме precache.json нет — работаем по index.html */
  }
  try {
    const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png|svg|webmanifest))"/g)].map((m) => new URL(m[1], self.registration.scope).href);
    await Promise.all(assets.map((u) => cache.add(u).catch(() => {})));
    for (const css of assets.filter((u) => u.endsWith('.css'))) {
      const text = await (await fetch(css)).text();
      const fonts = [...text.matchAll(/url\(([^)]+)\)/g)]
        .map((m) => m[1].replace(/["']/g, ''))
        .filter((u) => !u.startsWith('data:'))
        .map((u) => new URL(u, css).href);
      await Promise.all(fonts.map((u) => cache.add(u).catch(() => {})));
    }
  } catch (e) {
    /* офлайн при установке — докэшируем на лету */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // обои-манифест и ICS-образцы — всегда свежие, если есть сеть
  if (url.pathname.endsWith('/wallpapers/manifest.json') || url.pathname.endsWith('/precache.json')) {
    event.respondWith(fetch(req).catch(async () => (await caches.match(req)) || new Response('[]', { headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => undefined);
      return cached || (await network) || Response.error();
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (all.length) return all[0].focus();
      return self.clients.openWindow('./');
    })(),
  );
});
