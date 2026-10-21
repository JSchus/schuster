import "server-only";
import type { MediaItem } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

export type ItemWithCover = MediaItem & { coverUrl: string | null };

/**
 * Attach presigned cover URLs. Signing is local CPU work (no S3 round-trip),
 * and the hourly-stable signature lets browsers cache cover images.
 */
export async function withCoverUrls(items: MediaItem[]): Promise<ItemWithCover[]> {
  const storage = getStorage();
  return Promise.all(
    items.map(async (item) => ({
      ...item,
      coverUrl: item.coverKey
        ? await storage.presignGet(item.coverKey, { expiresIn: 7200, stableFor: 3600 })
        : null,
    })),
  );
}
