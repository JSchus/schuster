import { HttpError, handle, parseId, parseJson, requireContributor } from "@/lib/api";
import { getItemForEdit } from "@/lib/db/queries";
import { activeSharesForItem, createShare } from "@/lib/db/shares";
import { shareCreateSchema } from "@/lib/sharing/protocol";
import { shareJson } from "@/lib/sharing/share-json";
import { hashPassword, randomToken } from "@/lib/sharing/tokens";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

async function editable(params: Ctx["params"]) {
  const user = await requireContributor();
  const item = await getItemForEdit(parseId((await params).id), user);
  if (!item) throw new HttpError(404, "Not found");
  return { user, item };
}

/** The item's working share links. Uploader or admin. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { item } = await editable(params);
  return Response.json((await activeSharesForItem(item.id)).map(shareJson));
});

/** Make a public, expiring link (optionally password-protected). Uploader or admin. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { user, item } = await editable(params);
  const body = await parseJson(req, shareCreateSchema);
  const share = await createShare({
    token: randomToken(),
    itemId: item.id,
    createdBy: user.id,
    expiresAt: new Date(Date.now() + body.days * 86_400_000),
    passwordHash: body.password ? await hashPassword(body.password) : null,
    allowDownload: body.allowDownload,
  });
  return Response.json(shareJson(share), { status: 201 });
});
