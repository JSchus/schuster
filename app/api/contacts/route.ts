import { handle, parseJson, requireUser } from "@/lib/api";
import { contactJson } from "@/lib/contacts/contact-json";
import { createContact, deleteAllContacts, listContacts } from "@/lib/db/contacts";
import { contactSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

/** Your own contacts (?q= searches name, company, emails and phones). Nobody else's, ever. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.slice(0, 200) ?? undefined;
  return Response.json((await listContacts(user.id, q)).map(contactJson));
});

/** Add one contact by hand. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = await parseJson(req, contactSchema);
  const contact = await createContact(user.id, { ...body, sourceUid: null });
  return Response.json(contactJson(contact), { status: 201 });
});

/** Delete all of your contacts. */
export const DELETE = handle(async () => {
  const user = await requireUser();
  return Response.json({ deleted: await deleteAllContacts(user.id) });
});
