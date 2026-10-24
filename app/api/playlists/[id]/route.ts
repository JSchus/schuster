import { handle, parseJson } from "@/lib/api";
import { listPeople } from "@/lib/db/people";
import { deletePlaylist, setPlaylistAccess, updatePlaylist } from "@/lib/db/playlists";
import { editablePlaylist } from "@/lib/sharing/playlists";
import { playlistSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Rename, describe, or change who can see a playlist. Owner or admin. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { playlist } = await editablePlaylist((await params).id);
  const { people, ...patch } = await parseJson(req, playlistSchema);
  await updatePlaylist(playlist.id, patch);
  if (people) {
    const known = new Set((await listPeople()).map((p) => p.id));
    await setPlaylistAccess(playlist.id, people.filter((id) => known.has(id) && id !== playlist.ownerId));
  }
  return Response.json({ ok: true });
});

/** Delete a playlist (the songs stay in the library). Owner or admin. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { playlist } = await editablePlaylist((await params).id);
  await deletePlaylist(playlist.id);
  return new Response(null, { status: 204 });
});
