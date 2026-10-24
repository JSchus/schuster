import { HttpError, handle, requireContributor } from "@/lib/api";
import { getItemForEdit } from "@/lib/db/queries";
import { getShare, revokeShare } from "@/lib/db/shares";
import { isTokenShape } from "@/lib/sharing/tokens";

export const maxDuration = 10;

type Ctx = { params: Promise<{ token: string }> };

/** Turn a share link off. Whoever may edit the item. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireContributor();
  const { token } = await params;
  const share = isTokenShape(token) ? await getShare(token) : undefined;
  if (!share || !(await getItemForEdit(share.itemId, user))) throw new HttpError(404, "Not found");
  await revokeShare(token);
  return new Response(null, { status: 204 });
});
