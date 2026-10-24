import "server-only";
import { HttpError, parseId, requireUser } from "@/lib/api";
import { getPlaylist } from "@/lib/db/playlists";
import { canEditPlaylist } from "@/lib/permissions";

/** A playlist the caller can see, or a 404. */
export async function visiblePlaylist(id: string) {
  const user = await requireUser();
  const playlist = await getPlaylist(parseId(id), user);
  if (!playlist) throw new HttpError(404, "Not found");
  return { user, playlist };
}

/** A playlist the caller may change (its owner, whatever their role, or an admin), or a 404. */
export async function editablePlaylist(id: string) {
  const { user, playlist } = await visiblePlaylist(id);
  if (!canEditPlaylist(user, playlist.ownerId)) throw new HttpError(404, "Not found");
  return { user, playlist };
}
