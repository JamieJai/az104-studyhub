const VERSION = 'az104-pwa-20260926-v149-md-exam';
const CACHE_NAME = VERSION;
const BASE = new URL('./', self.location.href);
const rel = p => new URL(p, BASE).href;
// 정적 자산만 미리 받아둔다. HTML 페이지는 캐시하지 않는다 — 로그인 리다이렉트를 캐시가 가로채면 안 된다.
const CORE = [
  'manifest.webmanifest','pwa-manager.js','cbt-theme.css',
  'icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png',
  'AZ-104_CBT/styles.css','AZ-104_CBT/data.js','AZ-104_CBT/annotations.js','AZ-104_CBT/hotspot_keys.js','AZ-104_CBT/yn_answers.js','AZ-104_CBT/choices.js','AZ-104_CBT/positions.js','AZ-104_CBT/hints.js','AZ-104_CBT/explanations_v2.js','AZ-104_CBT/current_azure_verified.js','AZ-104_CBT/app.js',
  'AZ-104_Lab_Portal/styles.css','AZ-104_Lab_Portal/data.js','AZ-104_Lab_Portal/app.js',
  'AZ-802_CBT/styles.css','AZ-802_CBT/data.js','AZ-802_CBT/app.js',
  'SC-300_CBT/styles.css','SC-300_CBT/data.js','SC-300_CBT/app.js',
  'AZ-305_CBT/styles.css','AZ-305_CBT/data.js','AZ-305_CBT/app.js',
  'AZ-900_CBT/styles.css','AZ-900_CBT/data.js','AZ-900_CBT/app.js',
  'AI-103_CBT/styles.css','AI-103_CBT/data.js','AI-103_CBT/app.js'
].map(rel);
// 리다이렉트를 거친 응답은 그대로 캐시하지 않는다
const clean = res => res && res.redirected
  ? new Response(res.body, {status: res.status, statusText: res.statusText, headers: res.headers})
  : res;
const keyOf = req => { const u = new URL(req.url); u.search = ''; return u.href; };
const isPage = req => req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(CORE.map(async url => {
      try { const r = await fetch(url, {cache:'reload'}); if (r.ok) await cache.put(url, clean(r)); } catch (_) {}
    }));
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('az104-pwa-') && k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API 와 페이지 이동은 항상 네트워크로 (세션 확인·리다이렉트는 서버가 한다)
  if (url.pathname.startsWith('/api/') || isPage(req)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const key = keyOf(req);
    const hit = await cache.match(key);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res && res.ok && !res.redirected) await cache.put(key, res.clone());
      return res;
    } catch (err) {
      return Response.error();
    }
  })());
});
