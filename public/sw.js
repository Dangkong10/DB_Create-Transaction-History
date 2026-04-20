const CACHE_NAME = 'transaction-record-v1';

// 앱 셸에 필수적인 정적 자산만 프리캐시
const PRECACHE_URLS = [
  '/',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
];

// 설치: 핵심 자산 프리캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// 활성화: 이전 버전 캐시 정리
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

// 페치: Network First 전략 (오프라인 시 캐시 폴백)
self.addEventListener('fetch', (event) => {
  // API 요청(supabase 등)은 캐시하지 않음
  if (
    event.request.method !== 'GET' ||
    event.request.url.includes('supabase') ||
    event.request.url.includes('/rest/') ||
    event.request.url.includes('/auth/')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 성공 응답이면 캐시에 복사 저장
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 서빙
        return caches.match(event.request);
      })
  );
});
