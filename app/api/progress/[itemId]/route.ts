import { z } from "zod";
import { HttpError, handle, parseId, requireUser } from "@/lib/api";
import type { Viewer } from "@/lib/permissions";
import { getProgress, getReadyItem, upsertProgress, type ProgressRow } from "@/lib/db/queries";
import { isReadable } from "@/lib/reader/progress";

export const maxDuration = 10;

type Ctx = { params: Promise<{ itemId: string }> };

const DAY = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  position: z.string().min(1).max(2000),
  percent: z.number().min(0).max(100),
  at: z.number().int().positive(),
});

export type ProgressResponse = { position: string; percent: number; updatedAt: number } | null;

function toJson(row: ProgressRow | undefined): ProgressResponse {
  return row ? { position: row.position, percent: row.percent, updatedAt: row.updatedAt.getTime() } : null;
}

/** Items that have a position: readable books, and anything played in the video/audio player. */
async function readableItem(itemId: string, user: Viewer) {
  const item = await getReadyItem(parseId(itemId), user);
  const ok = item && (item.type === "video" || item.type === "audio" || (item.type === "book" && isReadable(item.mime)));
  if (!ok) throw new HttpError(404, "Not found");
  return item;
}

/** This user's synced position (or null). */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const item = await readableItem((await params).itemId, user);
  return Response.json(toJson(await getProgress(user.id, item.id)));
});

/**
 * Save a position. Older writes than what's stored are ignored. POST is the
 * same so `navigator.sendBeacon` (POST only, often text/plain) works when a
 * tab closes.
 */
const save = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const item = await readableItem((await params).itemId, user);

  const raw = await req.text();
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) throw new HttpError(400, z.prettifyError(parsed.error));
  const { position, percent, at } = parsed.data;

  const now = Date.now();
  if (at < now - 30 * DAY) throw new HttpError(400, "Position is too old");
  // Clamp clocks running ahead so one device can't lock in a future timestamp.
  const when = new Date(Math.min(at, now));

  const row = await upsertProgress(user.id, item.id, { position, percent: Math.round(percent), at: when });
  return Response.json(toJson(row));
});

export const PUT = save;
export const POST = save;
