// Service worker: lets the system be installed as an app and open without a connection.
// Pages and files come from the network first; the saved copy is used only when offline.
// API calls are never stored, so the data shown is always current.
const CACHE = 'obbs-v1';
const SHELL = ['/', '/favicon.svg', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', (event) => {
    event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok && response.type === 'basic') {
                    const copy = response.clone();
                    caches.open(CACHE).then((cache) => cache.put(request, copy));
                }
                return response;
            })
            .catch(async () => (await caches.match(request))
                // Any page of the app opens from the saved start page; React then shows the right one.
                || (request.mode === 'navigate' ? caches.match('/') : Response.error())),
    );
});
