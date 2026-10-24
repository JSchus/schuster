import "server-only";
import type { MediaItem } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";

export const PLAYBACK_URL_TTL = 6 * 60 * 60;

export type PlaybackUrls = {
  src: string;
  subtitles: { lang: string; label: string; src: string }[];
};

/** Presigned URLs for playing a video or audio item and its subtitle tracks. */
export async function playbackUrls(item: MediaItem): Promise<PlaybackUrls> {
  const storage = getStorage();
  const [src, ...subs] = await Promise.all([
    storage.presignGet(item.fileKey, { expiresIn: PLAYBACK_URL_TTL }),
    ...(item.metadata.subtitles ?? []).map((t) => storage.presignGet(t.key, { expiresIn: PLAYBACK_URL_TTL })),
  ]);
  return {
    src: src!,
    subtitles: (item.metadata.subtitles ?? []).map((t, i) => ({ lang: t.lang, label: t.label, src: subs[i]! })),
  };
}

export function isPlayable(item: MediaItem | undefined): item is MediaItem {
  return !!item && item.status === "ready" && (item.type === "video" || item.type === "audio");
}
