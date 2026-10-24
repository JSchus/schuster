import { HttpError, handle, parseJson, requireUser } from "@/lib/api";
import { listPeople } from "@/lib/db/people";
import { createPlaylist, setPlaylistAccess } from "@/lib/db/playlists";
import { playlistSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

/** Create a playlist. Anyone signed in, viewers too. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { people, ...body } = await parseJson(req, playlistSchema);
  if (!body.name) throw new HttpError(400, "A playlist needs a name");
  const playlist = await createPlaylist({
    name: body.name,
    description: body.description ?? null,
    visibility: body.visibility ?? "everyone",
    ownerId: user.id,
  });
  if (people?.length) {
    const known = new Set((await listPeople()).map((p) => p.id));
    await setPlaylistAccess(playlist.id, people.filter((id) => known.has(id) && id !== user.id));
  }
  return Response.json({ id: playlist.id }, { status: 201 });
});
