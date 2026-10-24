import { z } from "zod";
import { HttpError, handle, parseJson, requireUser } from "@/lib/api";
import { findPsxBios } from "@/lib/games/server";
import { PSX_BIOS_FILES } from "@/lib/games/systems";
import { biosKey, getStorage } from "@/lib/storage";

export const maxDuration = 10;

/** Whether a PS1 BIOS has been added (any signed-in user may ask). */
export const GET = handle(async () => {
  await requireUser();
  const bios = await findPsxBios();
  return Response.json({ psx: bios?.filename ?? null });
});

/** Admin only: presigned PUT for a PS1 BIOS, which must use a known filename. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  if (user.role !== "admin") throw new HttpError(403, "Only the admin can add a BIOS");
  const { filename } = await parseJson(req, z.object({ filename: z.string().toLowerCase() }));
  if (!(PSX_BIOS_FILES as readonly string[]).includes(filename)) {
    throw new HttpError(400, `Use one of: ${PSX_BIOS_FILES.join(", ")}`);
  }
  const uploadUrl = await getStorage().presignPut(biosKey("psx", filename), {
    contentType: "application/octet-stream",
    expiresIn: 600,
  });
  return Response.json({ uploadUrl });
});
