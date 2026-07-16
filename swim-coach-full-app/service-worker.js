const CACHE_NAME = "swimcoach-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
];

// Files that change on every deploy — always prefer the network so updates
// show up immediately, falling back to the cached copy only when offline.
const NETWORK_FIRST = ["./", "./index.html", "./app.js", "./manifest.json", "./service-worker.js"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache our own API or the Anthropic API — always go live for data/chat.
  if (url.pathname.startsWith("/api/") || url.hostname.includes("api.anthropic.com") || url.hostname.includes("open-meteo.com")) {
    event.respondWith(fetch(event.request));
    return;
  }

  const isNetworkFirst =
    url.origin === self.location.origin &&
    NETWORK_FIRST.some((path) => url.pathname === path.replace("./", "/") || url.pathname === "/" + path.replace("./", ""));

  if (isNetworkFirst) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Everything else (icons, fonts, CDN scripts): cache-first, network fallback.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (event.request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
