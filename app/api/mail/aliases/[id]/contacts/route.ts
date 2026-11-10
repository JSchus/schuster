import { handle, parseJson } from "@/lib/api";
import { reverseTokenFor } from "@/lib/db/mail";
import { REVERSE_PREFIX, reverseToken } from "@/lib/mail/aliases";
import { assertOutside, sendableAlias } from "@/lib/mail/alias-access";
import { aliasContactSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/**
 * "Email someone" from Gmail: the hidden address to write to. Mail sent to it
 * from your own inbox goes out as the alias (the same path as replies).
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { alias, domain } = await sendableAlias((await params).id);
  const { email } = await parseJson(req, aliasContactSchema);
  assertOutside(email, domain);
  const token = await reverseTokenFor(alias.id, email, reverseToken());
  return Response.json({ address: `${REVERSE_PREFIX}${token}@${domain}` });
});
