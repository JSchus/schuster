import { handle, parseJson, requireUser } from "@/lib/api";
import { planImport } from "@/lib/contacts/merge";
import { cleanBirthday, cleanEmail, cleanPhone } from "@/lib/contacts/vcard";
import { applyImport, listContacts } from "@/lib/db/contacts";
import { contactImportSchema } from "@/lib/sharing/protocol";

export const maxDuration = 30;

/**
 * Import a batch of contacts the browser read from a .vcf file. Matches
 * existing contacts (same UID, email or phone) and updates them, so
 * importing the same phone export again never creates duplicates.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { contacts } = await parseJson(req, contactImportSchema);
  const incoming = contacts.map((c) => ({
    name: c.name,
    emails: [...new Set(c.emails.map(cleanEmail).filter(Boolean))],
    phones: [...new Set(c.phones.map(cleanPhone).filter(Boolean))],
    birthday: c.birthday ? cleanBirthday(c.birthday) : null,
    org: c.org || null,
    note: c.note || null,
    uid: c.uid || null,
  }));
  const existing = await listContacts(user.id);
  const plan = planImport(existing, incoming);
  await applyImport(user.id, plan);
  return Response.json({ added: plan.inserts.length, updated: plan.updates.length });
});
