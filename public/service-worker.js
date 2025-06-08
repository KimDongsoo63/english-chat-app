// 버전 정보를 URL 파라미터로 관리
const VERSION = '1.0.4';
const CACHE_NAME = `english-chat-app-v${VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

// 설치 단계 - 캐시 초기화
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(STATIC_ASSETS);
      })
      // .then(() => {
      //   // 이전 버전의 서비스 워커를 즉시 대체
      //   self.skipWaiting();
      // })
  );
});

// 활성화 단계 - 이전 캐시 정리
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // 이전 캐시 삭제
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
      }),
      // 새로운 서비스 워커가 즉시 페이지 제어
      // clients.claim()
    ])
  );
});

// 네트워크 요청 처리
self.addEventListener('fetch', event => {
  // API 요청은 항상 네트워크 우선
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => new Response(JSON.stringify({ error: 'Network error' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        }))
    );
    return;
  }

  // 나머지 요청은 캐시 우선, 네트워크 폴백
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request)
          .then(networkResponse => {
            // 성공한 응답만 캐시에 저장
            if (networkResponse.ok) {
              const responseToCache = networkResponse.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return networkResponse;
          });
      })
  );
}); 