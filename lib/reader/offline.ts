/**
 * "Keep offline" books: the file lives in the Cache API under a stable key
 * (presigned URLs expire), and a small index in localStorage lists them for
 * the /offline page. Cache and storage are injectable for tests.
 */

export const BOOKS_CACHE = "books";
const INDEX_KEY = "offline-books";

export type OfflineBook = { id: string; title: string; mime: string; size: number; savedAt: number };

type CacheLike = Pick<Cache, "match" | "put" | "delete">;
type Deps = { cache: () => Promise<CacheLike>; storage: Pick<Storage, "getItem" | "setItem"> };

const browserDeps = (): Deps => ({ cache: () => caches.open(BOOKS_CACHE), storage: localStorage });

/** Synthetic same-origin URL used as the cache key for a book. */
export function offlineKey(id: string): string {
  return `/offline-books/${id}`;
}

/** The reader page itself, cached so /read/{id} opens with no connection. */
export function readerPageKey(id: string): string {
  return `/read/${id}`;
}

export function listOffline(deps: Pick<Deps, "storage"> = browserDeps()): OfflineBook[] {
  try {
    const parsed = JSON.parse(deps.storage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIndex(books: OfflineBook[], deps: Pick<Deps, "storage">) {
  deps.storage.setItem(INDEX_KEY, JSON.stringify(books));
}

export function isOffline(id: string, deps: Pick<Deps, "storage"> = browserDeps()): boolean {
  return listOffline(deps).some((b) => b.id === id);
}

/** The cached file, if this book was kept offline. */
export async function readOffline(id: string, deps: Deps = browserDeps()): Promise<ArrayBuffer | undefined> {
  const res = await (await deps.cache()).match(offlineKey(id));
  return res ? res.arrayBuffer() : undefined;
}

/** Store `data` for offline reading and add it to the index. */
export async function saveOffline(
  book: Omit<OfflineBook, "savedAt" | "size">,
  data: ArrayBuffer,
  deps: Deps = browserDeps(),
): Promise<void> {
  await (await deps.cache()).put(
    offlineKey(book.id),
    new Response(data, { headers: { "Content-Type": book.mime, "Content-Length": String(data.byteLength) } }),
  );
  const rest = listOffline(deps).filter((b) => b.id !== book.id);
  writeIndex([...rest, { ...book, size: data.byteLength, savedAt: Date.now() }], deps);
}

export async function removeOffline(id: string, deps: Deps = browserDeps()): Promise<void> {
  const cache = await deps.cache();
  await cache.delete(offlineKey(id));
  await cache.delete(readerPageKey(id));
  writeIndex(listOffline(deps).filter((b) => b.id !== id), deps);
}
