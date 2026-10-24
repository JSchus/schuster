import "server-only";
import { HttpError, parseId, requireUser } from "@/lib/api";
import { getItemForEdit, getReadyItem } from "@/lib/db/queries";
import { PSX_BIOS_FILES } from "@/lib/games/systems";
import { biosKey, getStorage } from "@/lib/storage";

/** A ready game item any signed-in user can play. */
export async function playableGame(id: string) {
  const user = await requireUser();
  const item = await getReadyItem(parseId(id), user);
  if (!item || item.type !== "game") throw new HttpError(404, "Not found");
  return { user, item };
}

/** A game the caller may edit (uploader or admin). */
export async function editableGame(id: string) {
  const user = await requireUser();
  const item = await getItemForEdit(parseId(id), user);
  if (!item || item.type !== "game") throw new HttpError(404, "Not found");
  return item;
}

/** The uploaded PS1 BIOS, if any: checks the known filenames in order. */
export async function findPsxBios(): Promise<{ filename: string; key: string } | undefined> {
  const storage = getStorage();
  for (const filename of PSX_BIOS_FILES) {
    const key = biosKey("psx", filename);
    if (await storage.head(key)) return { filename, key };
  }
  return undefined;
}
