import { HttpError, handle } from "@/lib/api";
import { getStorage, safeFilename } from "@/lib/storage";
import { inlineKind, resolveShare, sharedPlaylistTracks } from "@/lib/sharing/open";

export const maxDuration = 10;

type Ctx = { params: Promise<{ token: string }> };

/**
 * Public: 302 to a short-lived presigned download for a share link's file,
 * or (?item=) one song of a shared playlist when downloads are on.
 */
export const GET = handle(async (req: Request, { params }: Ctx) => {
  const found = await resolveShare((await params).token);
  if (!found || found.locked) throw new HttpError(404, "Not found");
  const { share } = found;
  let item;
  if (found.kind === "item") {
    item = found.item;
    // Hiding the button only applies to things the page can play inline.
    if (!share.allowDownload && inlineKind(item)) throw new HttpError(403, "Downloads are off for this link");
  } else {
    if (!share.allowDownload) throw new HttpError(403, "Downloads are off for this link");
    const wanted = new URL(req.url).searchParams.get("item");
    item = (await sharedPlaylistTracks(share)).find((t) => t.id === wanted);
    if (!item) throw new HttpError(404, "Not found");
  }
  const name = item.metadata.originalFilename ?? safeFilename(item.fileKey);
  const url = await getStorage().presignGet(item.fileKey, { downloadName: name, expiresIn: 300 });
  return new Response(null, {
    status: 302,
    headers: { Location: url, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
});
