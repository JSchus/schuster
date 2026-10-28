import { z } from "zod";
import { HttpError, handle, parseJson, requireAdmin } from "@/lib/api";
import { getContact } from "@/lib/db/contacts";
import { createInvite } from "@/lib/db/people";
import { randomToken } from "@/lib/sharing/tokens";

export const maxDuration = 10;

const schema = z.object({
  contactId: z.string().uuid(),
  role: z.enum(["member", "viewer"]),
});

/**
 * Admins: a single-use, 7-day invite for one of your contacts. The browser
 * then opens Messages or Mail with the link filled in.
 */
export const POST = handle(async (req: Request) => {
  const admin = await requireAdmin();
  const { contactId, role } = await parseJson(req, schema);
  const contact = await getContact(admin.id, contactId);
  if (!contact) throw new HttpError(404, "Not found");
  const invite = await createInvite({
    token: randomToken(),
    role,
    note: contact.name.slice(0, 200),
    createdBy: admin.id,
    expiresAt: new Date(Date.now() + 7 * 86_400_000),
    maxUses: 1,
  });
  return Response.json({ token: invite.token }, { status: 201 });
});
