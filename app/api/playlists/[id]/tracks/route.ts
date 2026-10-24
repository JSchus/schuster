import { HttpError, handle, parseJson } from "@/lib/api";
import { addTrack, allTrackIds, removeTrack, reorderTracks } from "@/lib/db/playlists";
import { getReadyItem } from "@/lib/db/queries";
import { editablePlaylist } from "@/lib/sharing/playlists";
import { reorderSchema, trackSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Add a song you can see to the end of the playlist. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { user, playlist } = await editablePlaylist((await params).id);
  const { itemId } = await parseJson(req, trackSchema);
  const item = await getReadyItem(itemId, user);
  if (!item) throw new HttpError(404, "Song not found");
  if (item.type !== "audio") throw new HttpError(400, "Only audio can go on a playlist");
  await addTrack(playlist.id, item.id);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { playlist } = await editablePlaylist((await params).id);
  const { itemId } = await parseJson(req, trackSchema);
  await removeTrack(playlist.id, itemId);
  return new Response(null, { status: 204 });
});

/**
 * Set the order. `itemIds` must be exactly the playlist's songs; the editor
 * may not see all of them (e.g. an admin-only song), so songs they can't see
 * keep their place at the end.
 */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const { playlist } = await editablePlaylist((await params).id);
  const { itemIds } = await parseJson(req, reorderSchema);
  const current = await allTrackIds(playlist.id);
  const known = new Set(current);
  const wanted = new Set(itemIds);
  if (wanted.size !== itemIds.length || itemIds.some((id) => !known.has(id))) {
    throw new HttpError(400, "The order must list each song on the playlist once");
  }
  await reorderTracks(playlist.id, [...itemIds, ...current.filter((id) => !wanted.has(id))]);
  return Response.json({ ok: true });
});
