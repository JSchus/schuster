import { HttpError, handle, parseJson, requireContributor } from "@/lib/api";
import { listPeople } from "@/lib/db/people";
import { createShelf, setShelfAccess } from "@/lib/db/shelves";
import { shelfSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

/** Create a shelf. Members and admins. */
export const POST = handle(async (req: Request) => {
  const user = await requireContributor();
  const { people, ...body } = await parseJson(req, shelfSchema);
  if (!body.name) throw new HttpError(400, "A shelf needs a name");
  const shelf = await createShelf({
    name: body.name,
    description: body.description ?? null,
    visibility: body.visibility ?? "everyone",
    ownerId: user.id,
  });
  if (people?.length) {
    const known = new Set((await listPeople()).map((p) => p.id));
    await setShelfAccess(shelf.id, people.filter((id) => known.has(id) && id !== user.id));
  }
  return Response.json({ id: shelf.id }, { status: 201 });
});
