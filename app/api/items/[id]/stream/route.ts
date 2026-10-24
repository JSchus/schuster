import { HttpError, handle, parseId, requireUser } from "@/lib/api";
import { getReadyItem } from "@/lib/db/queries";
import { isPlayable, playbackUrls } from "@/lib/player/urls";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Fresh presigned URLs, for when a long playback session outlives the old ones. */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  await requireUser();
  const item = await getReadyItem(parseId((await params).id));
  if (!isPlayable(item)) throw new HttpError(404, "Not found");
  return Response.json(await playbackUrls(item), { headers: { "Cache-Control": "private, no-store" } });
});
