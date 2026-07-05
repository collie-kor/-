/* 서비스워커 — 오프라인 지원(앱 셸 캐시). 버전 올리면 캐시 갱신됨. */
var CACHE = 'pencil-timelapse-v1';
var ASSETS = [
  '.',
  'index.html',
  'css/styles.css',
  'js/character.js',
  'js/app.js',
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

self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (res) {
        // 동일 출처 GET만 런타임 캐시
        try {
          if (res && res.status === 200 && e.request.url.indexOf(self.location.origin) === 0) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
          }
        } catch (err) {}
        return res;
      }).catch(function () { return caches.match('index.html'); });
    })
  );
});
