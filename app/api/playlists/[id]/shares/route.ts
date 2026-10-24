import { handle, parseJson, requireContributor } from "@/lib/api";
import { activeSharesForPlaylist, createShare } from "@/lib/db/shares";
import { editablePlaylist } from "@/lib/sharing/playlists";
import { shareCreateSchema } from "@/lib/sharing/protocol";
import { shareJson } from "@/lib/sharing/share-json";
import { hashPassword, randomToken } from "@/lib/sharing/tokens";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Public links need a member or admin (viewers can't share outside the family). */
async function shareable(params: Ctx["params"]) {
  await requireContributor();
  return editablePlaylist((await params).id);
}

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { playlist } = await shareable(params);
  return Response.json((await activeSharesForPlaylist(playlist.id)).map(shareJson));
});

/** A public, expiring link to the playlist (optionally password-protected). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { user, playlist } = await shareable(params);
  const body = await parseJson(req, shareCreateSchema);
  const share = await createShare({
    token: randomToken(),
    playlistId: playlist.id,
    createdBy: user.id,
    expiresAt: new Date(Date.now() + body.days * 86_400_000),
    passwordHash: body.password ? await hashPassword(body.password) : null,
    allowDownload: body.allowDownload,
  });
  return Response.json(shareJson(share), { status: 201 });
});
