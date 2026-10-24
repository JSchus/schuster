import { z } from "zod";
import { handle, parseJson } from "@/lib/api";
import { setGameMeta } from "@/lib/db/queries";
import { editableGame } from "@/lib/games/server";
import { SYSTEM_IDS } from "@/lib/games/systems";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Set a retro game's console (for ROMs whose extension didn't say, e.g. .bin). */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const item = await editableGame((await params).id);
  const { system } = await parseJson(req, z.object({ system: z.enum(SYSTEM_IDS as [string, ...string[]]) }));
  await setGameMeta(item.id, { system });
  return Response.json({ system });
});
