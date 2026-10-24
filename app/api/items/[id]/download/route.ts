import { HttpError, handle, parseId, requireUser } from "@/lib/api";
import { getItemWithUploader } from "@/lib/db/queries";
import { getStorage } from "@/lib/storage";
import { safeFilename } from "@/lib/storage/keys";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Redirect to a short-lived presigned S3 URL. The bytes flow S3 → browser;
 * this function only signs a URL.
 */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const row = await getItemWithUploader(parseId((await params).id), user);
  if (!row) throw new HttpError(404, "Not found");
  const { item } = row;
  const name = item.metadata.originalFilename ?? safeFilename(item.fileKey);
  const url = await getStorage().presignGet(item.fileKey, { downloadName: name, expiresIn: 300 });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, no-store" },
  });
});
