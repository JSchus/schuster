import { HttpError, handle, parseId, requireAdmin } from "@/lib/api";
import { getItemAnyStatus } from "@/lib/db/queries";
import { purgeItem } from "@/lib/items/purge";

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

/** Clean up an upload that never finished: abort it in S3 and drop the row. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  await requireAdmin();
  const item = await getItemAnyStatus(parseId((await params).id));
  if (!item || item.status !== "pending") throw new HttpError(404, "Not found");
  await purgeItem(item, []);
  return new Response(null, { status: 204 });
});
