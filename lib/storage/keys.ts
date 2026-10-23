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

export function coverKey(itemId: string): string {
  return `covers/${itemId}.jpg`;
}
