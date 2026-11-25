/* Costco checklist service worker: app shell cache + network-first list.json */
const CACHE = "costco-checklist-v7";
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./list.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function isListRequest(url) {
  return url.pathname.endsWith("/list.json") || url.pathname.endsWith("list.json");
}

function listCacheRequest() {
  return new Request(new URL("./list.json", self.registration.scope), { cache: "reload" });
}

async function networkFirstList(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response && response.ok) {
      await cache.put(listCacheRequest(), response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(listCacheRequest()) || await cache.match("./list.json");
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  const network = fetch(request).then((response) => {
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  if (cached) return cached;
  const response = await network;
  if (response) return response;
  if (request.mode === "navigate") {
    return (await cache.match("./index.html")) || (await cache.match("./"));
  }
  throw new Error("Offline and not cached: " + request.url);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isListRequest(url)) {
    event.respondWith(networkFirstList(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});
