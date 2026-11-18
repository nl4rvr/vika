/* Общие константы PWA: версия кэша и список файлов оболочки.
   Используются и страницей (предзагрузка кэша), и service worker'ом. */

export const PWA_VERSION = 'vika-v1.3.1';
export const SHELL_CACHE = `${PWA_VERSION}-shell`;
export const RUNTIME_CACHE = `${PWA_VERSION}-runtime`;

export const SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './js/dates.js',
  './js/cycle.js',
  './js/tips.js',
  './js/store.js',
  './js/firebase.js',
  './js/pwa.js',
  './data/tips/menstrual.js',
  './data/tips/follicular.js',
  './data/tips/ovulation.js',
  './data/tips/luteal.js',
  './icons/favicon.svg',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

/* Предзагрузка оболочки из окна: надёжнее, чем install в SW,
   и работает одинаково во всех браузерах. Повторно не качаем,
   если оболочка уже в кэше. */
export async function precacheFromPage() {
  if (!('caches' in window)) return false;
  const base = new URL('./', location.href).href;
  const cache = await caches.open(SHELL_CACHE);
  const entry = new URL('./index.html', base).href;

  if (await cache.match(entry)) return true;

  await Promise.allSettled(
    SHELL_FILES.map(async (file) => {
      const url = new URL(file, base).href;
      const res = await fetch(url, { cache: 'reload' });
      if (!res || !res.ok) throw new Error('bad ' + file);
      await cache.put(url, res.clone());
    })
  );
  return Boolean(await cache.match(entry));
}

export async function clearOldCaches() {
  if (!('caches' in window)) return;
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => (k.endsWith('-shell') || k.endsWith('-runtime')) && !k.startsWith(PWA_VERSION))
      .map((k) => caches.delete(k))
  );
}
