import { HttpError, handle, parseId, parseJson, requireUser } from "@/lib/api";
import { getPendingItem, markItemReady } from "@/lib/db/queries";
import { coverKey, getStorage } from "@/lib/storage";
import { completeRequestSchema, type CompleteResponse } from "@/lib/upload/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Assemble the uploaded parts, verify the object, and publish the item. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const body = await parseJson(req, completeRequestSchema);
  const item = await getPendingItem(parseId((await params).id), user.id);
  if (!item?.uploadId) throw new HttpError(404, "Not found");

  const storage = getStorage();
  await storage.completeMultipartUpload(item.fileKey, item.uploadId, body.parts);

  const head = await storage.head(item.fileKey);
  if (!head || head.size !== item.size) {
    await storage.delete(item.fileKey).catch(() => undefined);
    throw new HttpError(422, `Uploaded size ${head?.size ?? 0} does not match ${item.size}`);
  }

  const cover = body.hasCover && (await storage.head(coverKey(item.id))) ? coverKey(item.id) : null;
  await markItemReady(item.id, { coverKey: cover });
  return Response.json({ itemId: item.id } satisfies CompleteResponse);
});
