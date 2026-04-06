/* Namerl Service Worker */
"use strict";

const CACHE = "namerl-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/filters.js",
  "/js/chart.js",
  "/js/swipe.js",
  "/js/app.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];
const DATA_FILES = [
  "/data/boys.json",
  "/data/girls.json",
  "/data/mixed.json"
];

// Cache app shell on install
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll([...APP_SHELL, ...DATA_FILES]))
      .then(() => self.skipWaiting())
  );
});

// Clean up old caches on activate
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// App shell: cache-first. Data files: network-first with cache fallback.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  if (DATA_FILES.includes(url.pathname)) {
    // Network-first: data updates weekly
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  } else {
    // Cache-first: app shell is stable between deploys
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    );
  }
});
