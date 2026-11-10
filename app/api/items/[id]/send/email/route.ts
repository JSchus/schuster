import { HttpError, handle, parseId, parseJson, requireContributor } from "@/lib/api";
import { addLog, countSentSince, reverseTokenFor } from "@/lib/db/mail";
import { getItemForEdit } from "@/lib/db/queries";
import { addSends } from "@/lib/db/sends";
import { createShare } from "@/lib/db/shares";
import { env } from "@/lib/env";
import { reverseToken } from "@/lib/mail/aliases";
import { assertOutside, sendableAlias } from "@/lib/mail/alias-access";
import { composeMultipart, fileEmail, openLabel, SENDS_PER_DAY } from "@/lib/mail/compose";
import { getMailSender } from "@/lib/mail/sender";
import { inlineKind } from "@/lib/sharing/open";
import { isForever, sendEmailSchema, shareExpiry, shareUrl } from "@/lib/sharing/protocol";
import { checkDailyCap, senderName, siteFrom } from "@/lib/sharing/send";
import { randomToken } from "@/lib/sharing/tokens";

export const maxDuration = 20;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Email a link to the file to outside addresses (contacts or typed). One
 * expiring share link; one email per person so nobody sees the others.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireContributor();
  const item = await getItemForEdit(parseId((await params).id), user);
  if (!item) throw new HttpError(404, "Not found");
  const body = await parseJson(req, sendEmailSchema);
  const to = [...new Set(body.to)];
  const domain = env().MAIL_DOMAIN;
  for (const t of to) assertOutside(t, domain);
  await checkDailyCap(user.id, to.length);

  const name = senderName(user);
  let from: { header: string; address: string };
  let aliasId: string | null = null;
  if (body.from === "site") from = siteFrom(name, domain);
  else {
    const { alias, address } = await sendableAlias(body.from);
    if ((await countSentSince(alias.id, new Date(Date.now() - 86_400_000))) + to.length > SENDS_PER_DAY) {
      throw new HttpError(429, `That's more than ${SENDS_PER_DAY} emails from ${address} today. Try again tomorrow.`);
    }
    from = { header: address, address };
    aliasId = alias.id;
  }

  const token = randomToken();
  const expiresAt = shareExpiry(body.days);
  // Books, games and plain files can only be downloaded from a share page, so
  // "watch/listen only" is just for video, audio and images.
  const inline = !!inlineKind(item);
  await createShare({ token, itemId: item.id, createdBy: user.id, expiresAt, passwordHash: null, allowDownload: inline ? body.allowDownload : true });
  const mail = fileEmail({
    senderName: name,
    title: item.title,
    note: body.note,
    url: shareUrl(new URL(req.url).origin, token),
    until: isForever(expiresAt) ? null : expiresAt,
    replies: !!aliasId,
    button: openLabel(item.type, inline),
  });

  const sender = getMailSender();
  const sent: string[] = [];
  for (const t of to) {
    try {
      await sender.sendRaw(from.address, [t], composeMultipart({ from: from.header, to: t, domain, ...mail }));
      sent.push(t);
      if (aliasId) {
        await reverseTokenFor(aliasId, t, reverseToken());
        await addLog({ aliasId, direction: "out", fromAddr: from.address, toAddr: t, subject: mail.subject, s3Key: null, outcome: "sent" });
      }
    } catch (err) {
      console.error("[send] email failed:", (err as Error).message);
    }
  }
  await addSends(sent.map((t) => ({ itemId: item.id, fromUser: user.id, toUser: null, toEmail: t, note: body.note || null, shareToken: token })));
  if (!sent.length) throw new HttpError(502, "Couldn't send the email. Please try again in a minute.");
  return Response.json({ sent: sent.length, failed: to.filter((t) => !sent.includes(t)) }, { status: 201 });
});
