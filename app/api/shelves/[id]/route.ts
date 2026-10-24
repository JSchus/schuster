import { handle, parseJson } from "@/lib/api";
import { listPeople } from "@/lib/db/people";
import { deleteShelf, setShelfAccess, updateShelf } from "@/lib/db/shelves";
import { editableShelf } from "@/lib/sharing/shelves";
import { shelfSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Rename, describe, or change who can see a shelf. Owner or admin. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const shelf = await editableShelf((await params).id);
  const { people, ...patch } = await parseJson(req, shelfSchema);
  await updateShelf(shelf.id, patch);
  if (people) {
    const known = new Set((await listPeople()).map((p) => p.id));
    await setShelfAccess(shelf.id, people.filter((id) => known.has(id) && id !== shelf.ownerId));
  }
  return Response.json({ ok: true });
});

/** Delete a shelf (the items stay in the library). Owner or admin. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const shelf = await editableShelf((await params).id);
  await deleteShelf(shelf.id);
  return new Response(null, { status: 204 });
});
