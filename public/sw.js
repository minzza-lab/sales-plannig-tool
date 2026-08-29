const CACHE_NAME = 'whp-sales-shell-v2'
const SHELL = ['/', '/index.html', '/manifest.json', '/app-icons/whp-sales-192.png', '/app-icons/whp-sales-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))))
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html'))))
})
