// v3: fetch handler 가 undefined 를 respondWith 하지 않도록 fallback 추가.
//     Cache name 도 bump 해서 이전 v2 캐시(잘못된 응답을 들고 있을 수 있음)는 activate 시 정리.
const CACHE_NAME = 'transaction-record-v3';

const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (
    event.request.method !== 'GET' ||
    !(url.startsWith('http://') || url.startsWith('https://')) ||
    url.includes('supabase') ||
    url.includes('/rest/') ||
    url.includes('/auth/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(event.request, clone))
            .catch(() => { /* cache.put can reject for unsupported schemes — ignore */ });
        }
        return response;
      })
      .catch(async () => {
        // 오프라인 fallback. caches.match() 가 undefined 면 respondWith 가 깨지므로
        // 빈 503 Response 로 graceful fallback.
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('', { status: 503, statusText: 'Service Unavailable (offline)' });
      })
  );
});
