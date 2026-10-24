/* Schuster Media service worker.
 *
 * - Precaches the offline page and icons.
 * - Navigations: network-first, falling back to the cached page, then /offline.
 * - /_next/static/*: cache-first (content-hashed, immutable).
 * - Never touches /api/*, auth, or cross-origin requests (S3 presigned URLs,
 *   which carry expiring signatures and can be gigabytes).
 * - The "books" cache (written by the page for "Keep offline") holds book
 *   files and their /read/{id} pages; it is never cleared on upgrade.
 * - The "audio" cache holds songs of offline playlists (and their pages).
 *   /offline-audio/{id} is answered from it with Range support (sw-range.js),
 *   which Safari needs to play media. Never cleared on upgrade either.
 */
importScripts("/sw-range.js");

const VERSION = "v3";
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
const PRECACHE = ["/offline", "/icons/192.png", "/icons/512.png", "/manifest.webmanifest", "/pdf.worker.min.mjs"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE);
      // Also precache the scripts the offline page needs, so its list of
      // offline books works even if those chunks were never loaded before.
      const html = await (await cache.match("/offline"))?.text();
      const assets = [...new Set(html?.match(/\/_next\/static\/[^"'\s)]+/g) ?? [])];
      await Promise.all(assets.map((a) => cache.add(a).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => /^(static|pages)-/.test(k) && !k.endsWith(`-${VERSION}`))
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/offline-audio/")) {
    event.respondWith(offlineAudio(req, url));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/pdf.worker.min.mjs"
  ) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
  }
});

async function offlineAudio(req, url) {
  const cached = await (await caches.open("audio")).match(url.pathname);
  if (!cached) return new Response("Not kept offline", { status: 404 });
  return self.SwRange.rangeResponse(cached, req.headers.get("Range"));
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) (await caches.open(STATIC_CACHE)).put(req, res.clone());
  return res;
}

async function networkFirstPage(req) {
  try {
    const res = await fetch(req);
    // Cache successful, non-redirected pages for offline fallback.
    if (res.ok && !res.redirected) (await caches.open(PAGES_CACHE)).put(req, res.clone());
    return res;
  } catch {
    return (await caches.match(req)) || (await caches.match("/offline")) || Response.error();
  }
}
