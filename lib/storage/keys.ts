/**
 * Object key layout. Keys are always generated server-side from the item id;
 * clients never choose where bytes land.
 */

/** Strip path separators and unsafe characters; keep the extension. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .slice(-120);
  return cleaned || "file";
}

export function mediaKey(itemId: string, filename: string): string {
  return `media/${itemId}/${safeFilename(filename)}`;
}

/**
 * Cover image key. Covers made after upload ("Make cover") carry a version
 * so browsers don't keep showing a cached older image under the same URL.
 */
export function coverKey(itemId: string, version?: number): string {
  return version ? `covers/${itemId}-${version}.jpg` : `covers/${itemId}.jpg`;
}

/** A web game's files live under webgames/{itemId}/ (the only public prefix). */
export function webGameKey(itemId: string, path: string): string {
  return `webgames/${itemId}/${path}`;
}

export const SAVE_KINDS = ["state", "screenshot", "sram"] as const;
export type SaveKind = (typeof SAVE_KINDS)[number];

/** Per-user cloud saves; the user id always comes from the session, never the client. */
export function saveKey(userId: string, itemId: string, kind: SaveKind): string {
  return `saves/${userId}/${itemId}/${kind}.bin`;
}

export function biosKey(system: string, filename: string): string {
  return `bios/${system}/${filename}`;
}

/** Versioned WebVTT key for one subtitle language. */
export function subtitleKey(itemId: string, lang: string, version: number): string {
  return `subs/${itemId}/${lang}-${version}.vtt`;
}

export function isSubtitleKeyFor(itemId: string, key: string): boolean {
  return new RegExp(`^subs/${itemId}/[a-z]{2,3}(-[a-z0-9]{2,8})?-\\d{10,16}\\.vtt$`).test(key);
}

/** True if `key` is a versioned cover key for `itemId` (never trust client-sent keys). */
export function isCoverKeyFor(itemId: string, key: string): boolean {
  return new RegExp(`^covers/${itemId}-\\d{10,16}\\.jpg$`).test(key);
}
