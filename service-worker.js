const CACHE_NAME = 'work-assistant-v3';
const urlsToCache = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/app.js',
    '/js/storage.js',
    '/js/utils.js',
    '/pages/late-early.html',
    '/pages/paid-leave.html',
    '/pages/compensatory-leave.html',
    '/pages/work-report.html',
    '/pages/night-shift.html',
    '/pages/team-instruction.html',
    '/pages/history.html',
    '/pages/export.html'
];

// インストール時にキャッシュ
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
});

// リクエスト時は常にネットワークを優先（開発中のキャッシュ問題を回避）
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // レスポンスのクローンをキャッシュに保存
                if (response && response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return response;
            })
            .catch(() => {
                // ネットワークエラー時のみキャッシュから返す（オフライン対応）
                return caches.match(event.request);
            })
    );
});

// 古いキャッシュを削除
self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
});
