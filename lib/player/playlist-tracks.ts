import "server-only";
import type { PlayerTrack } from "@/components/player/playlist-player";
import { withCoverUrls } from "@/lib/covers";
import type { MediaItem } from "@/lib/db/schema";
import { getStorage } from "@/lib/storage";
import { PLAYBACK_URL_TTL } from "./urls";

/** Songs → what the playlist player needs: presigned audio and cover URLs. */
export async function toPlayerTracks(items: MediaItem[], expiresIn = PLAYBACK_URL_TTL): Promise<PlayerTrack[]> {
  const storage = getStorage();
  const [withCovers, srcs] = await Promise.all([
    withCoverUrls(items),
    Promise.all(items.map((i) => storage.presignGet(i.fileKey, { expiresIn }))),
  ]);
  return withCovers.map((i, n) => ({
    id: i.id,
    title: i.title,
    artist: i.metadata.author ?? null,
    durationSec: i.metadata.durationSec ?? null,
    src: srcs[n]!,
    cover: i.coverUrl,
  }));
}
