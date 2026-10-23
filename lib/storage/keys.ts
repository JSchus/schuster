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

/** True if `key` is a versioned cover key for `itemId` (never trust client-sent keys). */
export function isCoverKeyFor(itemId: string, key: string): boolean {
  return new RegExp(`^covers/${itemId}-\\d{10,16}\\.jpg$`).test(key);
}
