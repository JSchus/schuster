import { HttpError, handle, parseId, parseJson, requireUser } from "@/lib/api";
import { getItemForEdit, setItemAccess, updateItem } from "@/lib/db/queries";
import { listPeople } from "@/lib/db/people";
import { purgeItem } from "@/lib/items/purge";
import { itemPatchSchema } from "@/lib/sharing/protocol";

export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

async function editable(params: Ctx["params"]) {
  const user = await requireUser();
  const item = await getItemForEdit(parseId((await params).id), user);
  if (!item) throw new HttpError(404, "Not found");
  return item;
}

/** Edit details and who can see it. Uploader or admin. */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const item = await editable(params);
  const { people, ...patch } = await parseJson(req, itemPatchSchema);
  await updateItem(item.id, patch);
  if (people) {
    const known = new Set((await listPeople()).map((p) => p.id));
    await setItemAccess(item.id, people.filter((id) => known.has(id) && id !== item.addedBy));
  }
  return Response.json({ ok: true });
});

/** Delete the item and every S3 object that belongs to it. Uploader or admin. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const item = await editable(params);
  const userIds = (await listPeople()).map((p) => p.id);
  await purgeItem(item, userIds);
  return new Response(null, { status: 204 });
});
