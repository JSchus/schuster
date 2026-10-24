import { HttpError, handle, parseJson } from "@/lib/api";
import { getReadyItem } from "@/lib/db/queries";
import { addToShelf, removeFromShelf } from "@/lib/db/shelves";
import { editableShelf } from "@/lib/sharing/shelves";
import { shelfItemSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

async function target(req: Request, params: Ctx["params"]) {
  const shelf = await editableShelf((await params).id);
  const { itemId } = await parseJson(req, shelfItemSchema);
  return { shelf, itemId };
}

/** Put an item you can see on a shelf you own (or any shelf, for admins). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { shelf, itemId } = await target(req, params);
  if (!(await getReadyItem(itemId, shelf.editor))) throw new HttpError(404, "Item not found");
  await addToShelf(shelf.id, itemId);
  return Response.json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: Ctx) => {
  const { shelf, itemId } = await target(req, params);
  await removeFromShelf(shelf.id, itemId);
  return new Response(null, { status: 204 });
});
