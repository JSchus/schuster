import { HttpError, handle, parseJson } from "@/lib/api";
import { addLog, countSentSince, reverseTokenFor } from "@/lib/db/mail";
import { reverseToken } from "@/lib/mail/aliases";
import { assertOutside, sendableAlias } from "@/lib/mail/alias-access";
import { composeMessage, SENDS_PER_DAY } from "@/lib/mail/compose";
import { getMailSender } from "@/lib/mail/sender";
import { aliasSendSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

type Ctx = { params: Promise<{ id: string }> };

/** Write a new plain-text email from an alias, on the site. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { alias, domain, address } = await sendableAlias((await params).id);
  const body = await parseJson(req, aliasSendSchema);
  assertOutside(body.to, domain);
  if ((await countSentSince(alias.id, new Date(Date.now() - 86_400_000))) >= SENDS_PER_DAY) {
    throw new HttpError(429, `That's ${SENDS_PER_DAY} new emails from this alias today. Try again tomorrow.`);
  }
  const raw = composeMessage({ from: address, to: body.to, subject: body.subject, text: body.text, domain });
  await getMailSender().sendRaw(address, [body.to], raw);
  // Same contact as "Email someone from Gmail" and as replies from them.
  await reverseTokenFor(alias.id, body.to, reverseToken());
  await addLog({ aliasId: alias.id, direction: "out", fromAddr: address, toAddr: body.to, subject: body.subject, s3Key: null, outcome: "sent" });
  return Response.json({ ok: true }, { status: 201 });
});
