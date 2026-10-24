import { handle } from "@/lib/api";
import { playlistTracksFor } from "@/lib/db/playlists";
import { PLAYBACK_URL_TTL } from "@/lib/player/urls";
import { visiblePlaylist } from "@/lib/sharing/playlists";
import { getStorage } from "@/lib/storage";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

export type PlaylistUrls = Record<string, string>;

/**
 * Fresh presigned URLs (6 h) for every song the caller may hear: used when a
 * long listening session outlives the page's URLs, and by "Keep offline".
 */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { user, playlist } = await visiblePlaylist((await params).id);
  const tracks = await playlistTracksFor(playlist.id, user);
  const storage = getStorage();
  const urls = await Promise.all(tracks.map((t) => storage.presignGet(t.fileKey, { expiresIn: PLAYBACK_URL_TTL })));
  const body: PlaylistUrls = Object.fromEntries(tracks.map((t, i) => [t.id, urls[i]!]));
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
});
