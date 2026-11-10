import { HttpError, handle, parseJson, requireContributor } from "@/lib/api";
import { listReplyAddresses, MAX_REPLY_ADDRESSES, saveReplyAddress } from "@/lib/db/mail";
import { env } from "@/lib/env";
import { splitAddress } from "@/lib/mail/aliases";
import { CONFIRM_HOURS, confirmationMessage, confirmUrl, hashToken } from "@/lib/mail/confirm";
import { getMailSender } from "@/lib/mail/sender";
import { randomToken } from "@/lib/sharing/tokens";
import { replyAddressSchema } from "@/lib/sharing/protocol";

export const maxDuration = 10;

export type ReplyAddressJson = { id: string; email: string; confirmed: boolean };

/** Extra addresses you may reply from (e.g. the Gmail your account email forwards to). */
export const GET = handle(async () => {
  const user = await requireContributor();
  const rows = await listReplyAddresses(user.id);
  return Response.json(rows.map((r): ReplyAddressJson => ({ id: r.id, email: r.email, confirmed: !!r.confirmedAt })));
});

/** Add one; a link is emailed to it and it only counts once that link is opened. */
export const POST = handle(async (req: Request) => {
  const user = await requireContributor();
  const { email } = await parseJson(req, replyAddressSchema);
  const domain = env().MAIL_DOMAIN;
  if (email === user.email?.toLowerCase()) throw new HttpError(400, "That's already your sign-in address, so replies from it work.");
  if (splitAddress(email).domain === domain) throw new HttpError(400, `Use your real address, not an @${domain} alias.`);

  const existing = await listReplyAddresses(user.id);
  const same = existing.find((r) => r.email === email);
  if (same?.confirmedAt) return Response.json({ id: same.id, email, confirmed: true } satisfies ReplyAddressJson);
  if (!same && existing.length >= MAX_REPLY_ADDRESSES) throw new HttpError(400, `You can add up to ${MAX_REPLY_ADDRESSES} addresses. Remove one first.`);

  const token = randomToken();
  const row = await saveReplyAddress(user.id, email, hashToken(token), new Date(Date.now() + CONFIRM_HOURS * 3_600_000));
  const message = confirmationMessage({
    to: email,
    accountEmail: user.email ?? "A Schuster Media member",
    url: confirmUrl(new URL(req.url).origin, token),
    domain,
  });
  await getMailSender().sendRaw(message.from, [email], message.raw);
  return Response.json({ id: row.id, email, confirmed: false } satisfies ReplyAddressJson, { status: 201 });
});
