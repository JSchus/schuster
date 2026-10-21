import { HttpError, handle, parseId, parseJson, requireUser } from "@/lib/api";
import { getPendingItem } from "@/lib/db/queries";
import { coverKey, getStorage } from "@/lib/storage";
import { coverRequestSchema, type CoverResponse } from "@/lib/upload/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Presign a PUT for the item's cover image (extracted in the browser). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { contentType } = await parseJson(req, coverRequestSchema);
  const item = await getPendingItem(parseId((await params).id), user.id);
  if (!item) throw new HttpError(404, "Not found");

  const url = await getStorage().presignPut(coverKey(item.id), { contentType, expiresIn: 600 });
  return Response.json({ url } satisfies CoverResponse);
});
