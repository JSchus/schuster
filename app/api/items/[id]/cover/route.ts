import { z } from "zod";
import { HttpError, handle, parseId, parseJson, requireUser } from "@/lib/api";
import { getItemForEdit, setItemCover } from "@/lib/db/queries";
import { coverKey, getStorage, isCoverKeyFor } from "@/lib/storage";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

export type CoverStartResponse = { key: string; uploadUrl: string; sourceUrl: string };

/**
 * Start making a cover for an item already in the library. Returns a
 * presigned GET for the media (the browser renders the cover itself) and a
 * presigned PUT for the new, versioned cover key. Uploader or admin only.
 */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const item = await getItemForEdit(parseId((await params).id), user);
  if (!item) throw new HttpError(404, "Not found");

  const storage = getStorage();
  const key = coverKey(item.id, Date.now());
  const [uploadUrl, sourceUrl] = await Promise.all([
    storage.presignPut(key, { contentType: "image/jpeg", expiresIn: 900 }),
    storage.presignGet(item.fileKey, { expiresIn: 900 }),
  ]);
  return Response.json({ key, uploadUrl, sourceUrl } satisfies CoverStartResponse);
});

const confirmSchema = z.object({ key: z.string().max(200) });

/** Confirm the new cover was uploaded, point the item at it, drop the old one. */
export const PUT = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { key } = await parseJson(req, confirmSchema);
  const item = await getItemForEdit(parseId((await params).id), user);
  if (!item) throw new HttpError(404, "Not found");
  if (!isCoverKeyFor(item.id, key)) throw new HttpError(400, "Invalid cover key");

  const storage = getStorage();
  if (!(await storage.head(key))) throw new HttpError(409, "Cover image was not uploaded");

  await setItemCover(item.id, key);
  if (item.coverKey && item.coverKey !== key) {
    await storage.delete(item.coverKey).catch(() => undefined);
  }
  return Response.json({ coverKey: key });
});
