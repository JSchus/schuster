import { handle } from "@/lib/api";
import { allTrackIds } from "@/lib/db/playlists";
import { listItems } from "@/lib/db/queries";
import { editablePlaylist } from "@/lib/sharing/playlists";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

export type Candidate = { id: string; title: string; artist: string | null; durationSec: number | null };

/** Audio the editor can see and could add (?q= searches title, artist, description). */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const { user, playlist } = await editablePlaylist((await params).id);
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 200) ?? "";
  const [items, onList] = await Promise.all([listItems(user, { type: "audio", q, limit: 40 }), allTrackIds(playlist.id)]);
  const taken = new Set(onList);
  const body: Candidate[] = items
    .filter((i) => !taken.has(i.id))
    .slice(0, 20)
    .map((i) => ({ id: i.id, title: i.title, artist: i.metadata.author ?? null, durationSec: i.metadata.durationSec ?? null }));
  return Response.json(body);
});
