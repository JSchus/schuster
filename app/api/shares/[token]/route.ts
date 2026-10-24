import { HttpError, handle, requireContributor } from "@/lib/api";
import { getPlaylist } from "@/lib/db/playlists";
import { getItemForEdit } from "@/lib/db/queries";
import { canEditPlaylist, type Viewer } from "@/lib/permissions";
import type { Share } from "@/lib/db/schema";
import { getShare, revokeShare } from "@/lib/db/shares";
import { isTokenShape } from "@/lib/sharing/tokens";

export const maxDuration = 10;

type Ctx = { params: Promise<{ token: string }> };

/** Turn a share link off. Whoever may edit the item or playlist. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireContributor();
  const { token } = await params;
  const share = isTokenShape(token) ? await getShare(token) : undefined;
  if (!share || !(await mayManage(share, user))) throw new HttpError(404, "Not found");
  await revokeShare(token);
  return new Response(null, { status: 204 });
});

async function mayManage(share: Share, user: Viewer): Promise<boolean> {
  if (share.itemId) return !!(await getItemForEdit(share.itemId, user));
  const playlist = share.playlistId ? await getPlaylist(share.playlistId, user) : undefined;
  return !!playlist && canEditPlaylist(user, playlist.ownerId);
}
