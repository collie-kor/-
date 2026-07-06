/* 서비스워커 — 오프라인 지원(앱 셸 캐시). 버전 올리면 캐시 갱신됨. */
var CACHE = 'pencil-timelapse-v8';
var ASSETS = [
  '.',
  'index.html',
  'css/styles.css',
  'js/character.js',
  'js/app.js',
  'js/supabase-config.js',
  'js/modal.js',
  'js/friends.js',
  'manifest.webmanifest',
  'assets/pencil_1h.png', 'assets/pencil_2h.png', 'assets/pencil_3h.png',
  'assets/pencil_4h.png', 'assets/pencil_5h.png', 'assets/pencil_6h.png',
  'assets/pencil_7h.png', 'assets/pencil_8h.png',
  'assets/icon-192.png', 'assets/icon-512.png', 'assets/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // 개별 실패해도 설치는 진행 (외부 폰트 등)
      return Promise.all(ASSETS.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 네트워크 우선: 온라인이면 항상 최신 코드, 오프라인이면 캐시 폴백.
// (동일 출처만 처리. 크로스 출처 — Supabase API, CDN — 는 브라우저에 맡김)
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  var url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(e.request).then(function (hit) {
        return hit || caches.match('index.html');
      });
    })
  );
});
