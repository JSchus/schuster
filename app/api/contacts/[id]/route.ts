import { HttpError, handle, parseId, parseJson, requireUser } from "@/lib/api";
import { contactJson } from "@/lib/contacts/contact-json";
import { deleteContact, getContact, updateContact } from "@/lib/db/contacts";
import { contactPatchSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** One of your own contacts, or a 404 (also for anyone else's, admins included). */
async function own(params: Ctx["params"]) {
  const user = await requireUser();
  const contact = await getContact(user.id, parseId((await params).id));
  if (!contact) throw new HttpError(404, "Not found");
  return { user, contact };
}

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { user, contact } = await own(params);
  const patch = await parseJson(req, contactPatchSchema);
  await updateContact(user.id, contact.id, patch);
  return Response.json(contactJson({ ...contact, ...patch }));
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { user, contact } = await own(params);
  await deleteContact(user.id, contact.id);
  return new Response(null, { status: 204 });
});
