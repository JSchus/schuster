import { z } from "zod";
import { HttpError, handle, parseJson } from "@/lib/api";
import { editableGame } from "@/lib/games/server";
import { contentTypeFor, safeGamePath } from "@/lib/games/web";
import { getStorage, webGameKey } from "@/lib/storage";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

export type WebFilesResponse = { files: { path: string; url: string; contentType: string }[] };

/** Presigned PUTs (batches of up to 100) for a web game's files under webgames/{id}/. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const item = await editableGame((await params).id);
  if (!item.metadata.web) throw new HttpError(400, "Not a web game");
  const { paths } = await parseJson(req, z.object({ paths: z.array(z.string()).min(1).max(100) }));
  if (paths.some((p) => !safeGamePath(p))) throw new HttpError(400, "Invalid file path in game");
  const storage = getStorage();
  const files = await Promise.all(
    paths.map(async (path) => {
      const contentType = contentTypeFor(path);
      const url = await storage.presignPut(webGameKey(item.id, path), { contentType, expiresIn: 1800 });
      return { path, url, contentType };
    }),
  );
  return Response.json({ files } satisfies WebFilesResponse);
});
