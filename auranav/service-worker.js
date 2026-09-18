const SHELL_CACHE = "chartplotter-shell-v3";
const BASE = new URL("./", self.registration.scope);
const STATIC_ASSETS = ["./", "./index.html", "./manifest.webmanifest", "./app-icon-192.png", "./app-icon-512.png", "./fonts/Noto%20Sans%20Regular/0-255.pbf", "./fonts/Noto%20Sans%20Regular/9984-10239.pbf", "./fonts/OFL.txt", "./fonts/README.txt"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    const indexResponse = await fetch(new URL("./index.html", BASE));
    await cache.put(new URL("./index.html", BASE), indexResponse.clone());
    await cache.put(new URL("./", BASE), indexResponse.clone());
    const html = await indexResponse.text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((path) => path && !path.startsWith("data:"))
      .map((path) => new URL(path, BASE));
    const uniqueAssets = new Map([...STATIC_ASSETS.slice(2).map((path) => new URL(path, BASE)), ...assets]
      .map((url) => [url.href, url]));
    await cache.addAll([...uniqueAssets.values()]);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("chartplotter-") && key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.headers.has("range")) return;
  event.respondWith((async () => {
    if (request.cache === "no-cache" || request.cache === "reload") {
      try {
        return await fetch(request);
      } catch {
        const fallback = await (await caches.open(SHELL_CACHE)).match(request);
        if (fallback) return fallback;
      }
    }
    const cached = await (await caches.open(SHELL_CACHE)).match(request);
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (error) {
      if (request.mode === "navigate") {
        const fallback = await (await caches.open(SHELL_CACHE)).match(new URL("./index.html", BASE));
        if (fallback) return fallback;
      }
      throw error;
    }
  })());
});
