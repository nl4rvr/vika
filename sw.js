/* ============================================================
   Service worker: офлайн-кэш приложения.

   - навигация: network-first, при сбое/5xx — index.html из кэша
   - свои файлы: stale-while-revalidate
   - Firebase CDN: network-first с кэш-фолбэком

   Предзагрузка оболочки выполняется из страницы (js/pwa.js),
   потому что это надёжнее и предсказуемее, чем install в SW.
   Здесь — только установка, активация и стратегии.
   ============================================================ */

const VERSION = 'vika-v1.3.1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

function isFirebase(url) {
  return url.hostname === 'www.gstatic.com'
    || url.hostname.endsWith('firebaseio.com')
    || url.hostname.endsWith('googleapis.com')
    || url.hostname.endsWith('firebase.com');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  if (req.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(req));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (isFirebase(url)) {
    event.respondWith(networkFirst(req));
  }
});

async function networkFirstNavigation(req) {
  const shell = await caches.open(SHELL_CACHE);
  const shellUrl = new URL('./index.html', self.location.href).href;
  const rootUrl = new URL('./', self.location.href).href;
  try {
    const fresh = await fetch(req);
    if (!fresh || !fresh.ok) throw new Error('bad-status');
    shell.put(shellUrl, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return (await shell.match(shellUrl))
      || (await shell.match(rootUrl))
      || (await shell.match(req))
      || new Response(
        '<!doctype html><meta charset="utf-8"><title>Нет сети</title><body style="font:16px system-ui;padding:40px">Нет сети. Откройте приложение с иконки — оно работает офлайн.</body>',
        { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  const shell = await caches.open(SHELL_CACHE);
  const cached = (await cache.match(req)) || (await shell.match(req));

  if (cached) {
    fetch(req)
      .then((res) => { if (res && res.ok) cache.put(req, res.clone()).catch(() => {}); })
      .catch(() => {});
    return cached;
  }

  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) {
      cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    }
    // 4xx/5xx от прокси или хостинга — пробуем кэш ещё раз
    return (await shell.match(req)) || (await cache.match(req)) || fresh;
  } catch {
    return (await shell.match(req)) || new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone()).catch(() => {});
    return fresh;
  } catch {
    return (await cache.match(req)) || new Response('', { status: 504, statusText: 'Offline' });
  }
}
