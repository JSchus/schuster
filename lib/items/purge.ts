import "server-only";
import { deleteItem } from "@/lib/db/queries";
import type { MediaItem } from "@/lib/db/schema";
import { getStorage, saveKey } from "@/lib/storage";
import { SAVE_KINDS } from "@/lib/storage/keys";

/**
 * S3 prefixes that hold an item's objects: the file, every cover version,
 * subtitles and a web game's published files. Item ids are fixed-length
 * UUIDs, so `covers/{id}` can't match another item's covers.
 */
export function itemPrefixes(itemId: string): string[] {
  return [`media/${itemId}/`, `covers/${itemId}`, `subs/${itemId}/`, `webgames/${itemId}/`];
}

/**
 * Delete an item: its S3 objects first (including everyone's cloud saves for
 * it), then the row, which cascades to progress, shelves, shares and access
 * lists. If S3 fails the row stays, so the delete can simply be retried.
 */
export async function purgeItem(item: MediaItem, userIds: string[]) {
  const storage = getStorage();
  if (item.uploadId) {
    await storage.abortMultipartUpload(item.fileKey, item.uploadId).catch(() => undefined);
  }
  await Promise.all(itemPrefixes(item.id).map((p) => storage.deletePrefix(p)));
  if (item.coverKey) await storage.delete(item.coverKey);
  await storage.deleteMany(userIds.flatMap((u) => SAVE_KINDS.map((k) => saveKey(u, item.id, k))));
  await deleteItem(item.id);
}
