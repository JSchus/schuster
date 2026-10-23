import { HttpError, handle, parseId, requireUser } from "@/lib/api";
import { deleteItem, getPendingItem } from "@/lib/db/queries";
import { getStorage } from "@/lib/storage";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Cancel an in-flight upload: abort the multipart upload and drop the row. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const item = await getPendingItem(parseId((await params).id), user.id);
  if (!item) throw new HttpError(404, "Not found");
  const storage = getStorage();
  if (item.uploadId) {
    await storage.abortMultipartUpload(item.fileKey, item.uploadId).catch(() => undefined);
  }
  if (item.coverKey) await storage.delete(item.coverKey).catch(() => undefined);
  await deleteItem(item.id);
  return new Response(null, { status: 204 });
});
