import { z } from "zod";
import { HttpError, handle, parseJson } from "@/lib/api";
import { setGameMeta } from "@/lib/db/queries";
import { editableGame } from "@/lib/games/server";
import { MAX_WEB_FILES, safeGamePath } from "@/lib/games/web";
import { getStorage, webGameKey } from "@/lib/storage";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Mark a web game playable once its entry page is in S3. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const item = await editableGame((await params).id);
  if (!item.metadata.web) throw new HttpError(400, "Not a web game");
  const body = await parseJson(
    req,
    z.object({ entry: z.string().max(300), files: z.number().int().min(1).max(MAX_WEB_FILES) }),
  );
  if (!safeGamePath(body.entry)) throw new HttpError(400, "Invalid entry path");
  if (!(await getStorage().head(webGameKey(item.id, body.entry)))) {
    throw new HttpError(409, "The game's start page wasn't uploaded");
  }
  const web = { entry: body.entry, status: "ready" as const, files: body.files, publishedAt: new Date().toISOString() };
  await setGameMeta(item.id, { web });
  return Response.json({ web });
});
