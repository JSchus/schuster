import "server-only";
import { HttpError, parseId, requireContributor } from "@/lib/api";
import { getShelf } from "@/lib/db/shelves";
import { canEdit } from "@/lib/permissions";

/** A shelf the caller may change (its owner or an admin), or a 404. */
export async function editableShelf(id: string) {
  const user = await requireContributor();
  const shelf = await getShelf(parseId(id), user);
  if (!shelf || !canEdit(user, shelf.ownerId)) throw new HttpError(404, "Not found");
  return { ...shelf, editor: user };
}
