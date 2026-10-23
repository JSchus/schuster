import { HttpError, handle, parseId, parseJson, requireUser } from "@/lib/api";
import { getPendingItem } from "@/lib/db/queries";
import { getStorage } from "@/lib/storage";
import { partsRequestSchema, type PartsResponse } from "@/lib/upload/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Presign PUT URLs for a batch of parts. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { partNumbers } = await parseJson(req, partsRequestSchema);
  const item = await getPendingItem(parseId((await params).id), user.id);
  if (!item?.uploadId) throw new HttpError(404, "Not found");

  const parts = await getStorage().presignUploadParts(item.fileKey, item.uploadId, partNumbers, {
    expiresIn: 3600,
  });
  return Response.json({ parts } satisfies PartsResponse);
});
