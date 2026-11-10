import { HttpError, handle, parseId, parseJson, requireContributor } from "@/lib/api";
import { listPeople } from "@/lib/db/people";
import { getItemAccess, getItemForEdit, setItemAccess, updateItem } from "@/lib/db/queries";
import { addSends } from "@/lib/db/sends";
import { env } from "@/lib/env";
import { composeMultipart, fileEmail } from "@/lib/mail/compose";
import { getMailSender } from "@/lib/mail/sender";
import { sendMembersSchema } from "@/lib/sharing/protocol";
import { checkDailyCap, senderName, siteFrom } from "@/lib/sharing/send";

export const maxDuration = 20;

type Ctx = { params: Promise<{ id: string }> };

/**
 * Send a file to members: they get access (if they didn't have it), an
 * email with an Open button, and it shows in their "Shared with me".
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireContributor();
  const item = await getItemForEdit(parseId((await params).id), user);
  if (!item) throw new HttpError(404, "Not found");
  const body = await parseJson(req, sendMembersSchema);
  const wanted = new Set(body.userIds);
  const targets = (await listPeople()).filter((p) => wanted.has(p.id) && p.id !== user.id);
  if (!targets.length) throw new HttpError(400, "Pick at least one person.");
  await checkDailyCap(user.id, targets.length);

  if (item.visibility !== "everyone") {
    const current = item.visibility === "people" ? await getItemAccess(item.id) : [];
    await setItemAccess(item.id, [...new Set([...current, ...targets.map((t) => t.id)])]);
    if (item.visibility === "private") await updateItem(item.id, { visibility: "people" });
  }
  await addSends(targets.map((t) => ({ itemId: item.id, fromUser: user.id, toUser: t.id, toEmail: null, note: body.note || null, shareToken: null })));

  const domain = env().MAIL_DOMAIN;
  const name = senderName(user);
  const from = siteFrom(name, domain);
  const url = `${new URL(req.url).origin}/items/${item.id}`;
  const mail = fileEmail({ senderName: name, title: item.title, note: body.note, url, replies: false });
  const sender = getMailSender();
  let emailed = 0;
  for (const t of targets) {
    if (!t.email) continue;
    try {
      await sender.sendRaw(from.address, [t.email], composeMultipart({ from: from.header, to: t.email, domain, ...mail }));
      emailed++;
    } catch (err) {
      // Access and "Shared with me" already worked; one failed email shouldn't undo them.
      console.error("[send] member email failed:", (err as Error).message);
    }
  }
  return Response.json({ sent: targets.length, emailed }, { status: 201 });
});
