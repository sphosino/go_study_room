const CACHE_NAME = 'django-pwa-v2'; // バージョンを上げて古いキャッシュを捨てやすくします
const DEBUG = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

function debugLog(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

const ASSETS = [
  '/',
  '/static/base.css',
  '/static/manifest.json',
  '/static/chat/css/lobby.css',
  '/static/chat/css/room.css',
  '/static/chat/js/goban/goban.js',
  '/static/chat/js/util/logging.js',
  '/static/chat/js/chat.js',
  '/static/chat/js/elements.js',
  '/static/chat/js/lobby.js',
  '/static/chat/js/room.js',
  '/static/chat/js/userlist.js',
  '/static/chat/js/websocket.js',
  '/static/icons/icon-192.png',
  '/static/icons/icon-512.png'
];

// --- 1. インストールと更新の強制 ---
self.addEventListener('install', event => {
  debugLog('Service Worker: Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      debugLog('Service Worker: Caching Assets');
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting(); // 新しいSWを待機させずに即時適用
});

self.addEventListener('activate', event => {
  debugLog('Service Worker: Activated');
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            debugLog('Service Worker: Clearing Old Cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  return self.clients.claim(); // 全てのタブを即座に新しいSWの支配下に置く
});

// --- 2. ネットワーク優先 (Network-First) ストラテジー ---
self.addEventListener('fetch', event => {
  // APIリクエストはキャッシュしない
  if (event.request.url.includes('/api/')) return;
  //chrome-extension などはスキップ
  if (!(event.request.url.indexOf('http') === 0)) {
    return;
  }

  // HTMLや静的ファイルはまずネットワークを確認し、ダメならキャッシュを出す
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // ネットワークが成功したらキャッシュを更新して返す
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // オフラインまたはネットワークエラー時のみキャッシュを返す
        return caches.match(event.request);
      })
  );
});

// --- 3. プッシュ通知 (既存のまま) ---
self.addEventListener("push", (event) => {
  let data = { title: "通知", body: "メッセージがあります" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/static/icons/icon-192.png",
      badge: "/static/icons/icon-192.png",
      data: data.url || "/chat/lobby/"
    })
  );
});

// --- 4. 通知クリック (既存のまま) ---
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data || "/chat/lobby/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && "focus" in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});