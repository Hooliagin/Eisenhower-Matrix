/*
 * Service worker: makes the app open instantly and without network.
 *  - the page itself: network first (so a new deploy is picked up at once), cached copy when offline or slow
 *  - /assets/* (hashed, never change): cache first
 *  - icons, manifest: cached, refreshed in the background
 * Data requests to Supabase are never touched – the app keeps its own snapshot of the last data.
 */
const SHELL = "shell-v1";
const ASSETS = "assets-v1";
const MAX_ASSETS = 80;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== SHELL && key !== ASSETS) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(key); // oldest first
}

async function page(request) {
  const cache = await caches.open(SHELL);
  try {
    const fresh = await Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3500))]);
    if (fresh.ok) await cache.put("/", fresh.clone());
    return fresh;
  } catch {
    return (await cache.match("/")) ?? fetch(request);
  }
}

async function asset(request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    void trim(cache);
  }
  return res;
}

async function refreshing(request) {
  const cache = await caches.open(SHELL);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then((res) => {
      if (res.ok) void cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit ?? update;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (url.pathname.startsWith("/assets/")) event.respondWith(asset(request));
  else if (/\.(png|svg|webmanifest|ico)$/.test(url.pathname)) event.respondWith(refreshing(request));
});
