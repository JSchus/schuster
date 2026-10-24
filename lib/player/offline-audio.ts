/**
 * "Keep offline" playlists: each song lives once in the Cache API under
 * /offline-audio/{itemId} (the service worker serves it with Range support),
 * and a small index in localStorage lists the playlists and their songs for
 * the /offline page. A song on two offline playlists is stored once and
 * removed only when no offline playlist needs it. Cache and storage are
 * injectable for tests.
 */

export const AUDIO_CACHE = "audio";
const INDEX_KEY = "offline-playlists";

export type OfflineTrack = { id: string; title: string; artist: string | null; durationSec: number | null; mime: string; size: number };
export type OfflinePlaylist = { id: string; name: string; tracks: OfflineTrack[]; savedAt: number };

type CacheLike = Pick<Cache, "match" | "put" | "delete">;
type Deps = { cache: () => Promise<CacheLike>; storage: Pick<Storage, "getItem" | "setItem"> };

const browserDeps = (): Deps => ({ cache: () => caches.open(AUDIO_CACHE), storage: localStorage });

/** Same-origin URL a kept song plays from (served by the service worker). */
export function offlineAudioUrl(itemId: string): string {
  return `/offline-audio/${itemId}`;
}

/** The playlist page, cached so it opens with no connection. */
export function playlistPageKey(id: string): string {
  return `/playlists/${id}`;
}

export function listOfflinePlaylists(deps: Pick<Deps, "storage"> = browserDeps()): OfflinePlaylist[] {
  try {
    const parsed = JSON.parse(deps.storage.getItem(INDEX_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((p) => p && typeof p.id === "string" && Array.isArray(p.tracks)) : [];
  } catch {
    return [];
  }
}

function writeIndex(list: OfflinePlaylist[], deps: Pick<Deps, "storage">) {
  deps.storage.setItem(INDEX_KEY, JSON.stringify(list));
}

export function isPlaylistOffline(id: string, deps: Pick<Deps, "storage"> = browserDeps()): boolean {
  return listOfflinePlaylists(deps).some((p) => p.id === id);
}

/** Ids of every song kept on this device (any playlist). */
export function offlineTrackIds(deps: Pick<Deps, "storage"> = browserDeps()): Set<string> {
  return new Set(listOfflinePlaylists(deps).flatMap((p) => p.tracks.map((t) => t.id)));
}

export type SaveProgress = { done: number; total: number };

/**
 * Download every song (skipping ones already kept), two at a time, then
 * record the playlist. `fetchTrack` returns the song's bytes (normally a
 * fetch of its presigned S3 URL). Throws if any download fails; songs that
 * did arrive stay cached and are reused by the next attempt.
 */
export async function savePlaylistOffline(
  playlist: { id: string; name: string },
  tracks: Omit<OfflineTrack, "size">[],
  fetchTrack: (track: Omit<OfflineTrack, "size">) => Promise<Blob>,
  onProgress: (p: SaveProgress) => void = () => {},
  deps: Deps = browserDeps(),
): Promise<OfflinePlaylist> {
  const cache = await deps.cache();
  const saved: OfflineTrack[] = new Array(tracks.length);
  let done = 0;
  let next = 0;
  onProgress({ done, total: tracks.length });

  async function worker() {
    while (next < tracks.length) {
      const i = next++;
      const t = tracks[i]!;
      const existing = await cache.match(offlineAudioUrl(t.id));
      let size = Number(existing?.headers.get("Content-Length") ?? 0);
      if (!existing) {
        const blob = await fetchTrack(t);
        size = blob.size;
        await cache.put(
          offlineAudioUrl(t.id),
          new Response(blob, { headers: { "Content-Type": t.mime, "Content-Length": String(size) } }),
        );
      }
      saved[i] = { ...t, size };
      onProgress({ done: ++done, total: tracks.length });
    }
  }
  await Promise.all([worker(), worker()]);

  const entry: OfflinePlaylist = { ...playlist, tracks: saved, savedAt: Date.now() };
  writeIndex([...listOfflinePlaylists(deps).filter((p) => p.id !== playlist.id), entry], deps);
  return entry;
}

/** Forget a playlist; delete its songs unless another offline playlist has them. */
export async function removePlaylistOffline(id: string, deps: Deps = browserDeps()): Promise<void> {
  const all = listOfflinePlaylists(deps);
  const gone = all.find((p) => p.id === id);
  const rest = all.filter((p) => p.id !== id);
  writeIndex(rest, deps);
  const stillNeeded = new Set(rest.flatMap((p) => p.tracks.map((t) => t.id)));
  const cache = await deps.cache();
  await Promise.all([
    cache.delete(playlistPageKey(id)),
    ...(gone?.tracks ?? []).filter((t) => !stillNeeded.has(t.id)).map((t) => cache.delete(offlineAudioUrl(t.id))),
  ]);
}

/** Bytes used by all kept songs (each counted once). */
export function offlineAudioBytes(deps: Pick<Deps, "storage"> = browserDeps()): number {
  const sizes = new Map<string, number>();
  for (const p of listOfflinePlaylists(deps)) for (const t of p.tracks) sizes.set(t.id, t.size);
  return [...sizes.values()].reduce((a, b) => a + b, 0);
}
