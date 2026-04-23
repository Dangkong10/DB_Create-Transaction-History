// 자폭 Service Worker - 기존 SW와 캐시를 모두 제거
// (문제가 된 캐싱 로직을 완전히 제거하고 SW 자체를 언레지스터)

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 모든 캐시 삭제
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));

    // SW 자체 언레지스터
    await self.registration.unregister();

    // 열려있는 모든 클라이언트 페이지 새로고침
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      client.navigate(client.url);
    }
  })());
});

// fetch 이벤트는 처리하지 않음 (브라우저 기본 동작으로 fallthrough)
