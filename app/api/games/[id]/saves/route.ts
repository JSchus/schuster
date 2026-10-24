import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { playableGame } from "@/lib/games/server";
import { getStorage, saveKey, type SaveKind } from "@/lib/storage";
import { SAVE_KINDS } from "@/lib/storage/keys";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

export type CloudSave = { url: string; savedAt: number | null; size: number };
export type SavesResponse = Partial<Record<SaveKind, CloudSave>>;

/**
 * This user's cloud saves for a game: the save state, its screenshot and the
 * in-game (SRAM) save. Keys always use the session's user id, so one family
 * member can never read or overwrite another's saves.
 */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { user, item } = await playableGame((await params).id);
  const storage = getStorage();
  const entries = await Promise.all(
    SAVE_KINDS.map(async (kind) => {
      const key = saveKey(user.id, item.id, kind);
      const head = await storage.head(key);
      if (!head) return null;
      const url = await storage.presignGet(key, { expiresIn: 3600 });
      return [kind, { url, savedAt: head.lastModified?.getTime() ?? null, size: head.size }] as const;
    }),
  );
  return Response.json(Object.fromEntries(entries.filter(Boolean) as [SaveKind, CloudSave][]) satisfies SavesResponse, {
    headers: { "Cache-Control": "private, no-store" },
  });
});

/** Presigned PUT for one of this user's save slots. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { user, item } = await playableGame((await params).id);
  const { kind } = await parseJson(req, z.object({ kind: z.enum(SAVE_KINDS) }));
  const contentType = kind === "screenshot" ? "image/png" : "application/octet-stream";
  const uploadUrl = await getStorage().presignPut(saveKey(user.id, item.id, kind), { contentType, expiresIn: 600 });
  return Response.json({ uploadUrl, contentType });
});
