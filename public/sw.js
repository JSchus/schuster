/* Schuster Media service worker.
 *
 * - Precaches the offline page and icons.
 * - Navigations: network-first, falling back to the cached page, then /offline.
 * - /_next/static/*: cache-first (content-hashed, immutable).
 * - Never touches /api/*, auth, or cross-origin requests (S3 presigned URLs,
 *   which carry expiring signatures and can be gigabytes).
 */
const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const PAGES_CACHE = `pages-${VERSION}`;
const PRECACHE = ["/offline", "/icons/192.png", "/icons/512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.endsWith(`-${VERSION}`)).map((k) => caches.delete(k)),
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
  if (url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(networkFirstPage(req));
  }
});

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
