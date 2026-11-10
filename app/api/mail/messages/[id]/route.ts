import PostalMime from "postal-mime";
import { HttpError, handle, parseId, requireContributor } from "@/lib/api";
import { getVisibleLog } from "@/lib/db/mail";
import { INBOUND_PREFIX, MAX_MESSAGE_BYTES } from "@/lib/mail/inbound";
import { getStorage } from "@/lib/storage";

export const maxDuration = 20;

type Ctx = { params: Promise<{ id: string }> };

export type MailMessageJson = {
  subject: string;
  from: string;
  date: string | null;
  text: string | null;
  html: string | null;
  attachments: { filename: string; size: number }[];
};

/** Read one stored message (owner or group members, within 14 days). */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireContributor();
  const log = await getVisibleLog(user.id, parseId((await params).id));
  if (!log?.s3Key?.startsWith(INBOUND_PREFIX)) throw new HttpError(404, "Not found");
  const raw = await getStorage().getBytes(log.s3Key, MAX_MESSAGE_BYTES);
  if (!raw) throw new HttpError(410, "This message is older than 14 days and was deleted.");
  const mail = await PostalMime.parse(raw);
  const body: MailMessageJson = {
    subject: mail.subject ?? "",
    from: mail.from ? `${mail.from.name ? `${mail.from.name} ` : ""}<${mail.from.address ?? ""}>` : log.fromAddr,
    date: mail.date ?? null,
    text: mail.text ?? null,
    html: mail.html ?? null,
    attachments: (mail.attachments ?? []).map((a) => ({
      filename: a.filename ?? "attachment",
      size: typeof a.content === "string" ? a.content.length : (a.content as ArrayBuffer).byteLength,
    })),
  };
  return Response.json(body, { headers: { "Cache-Control": "private, no-store" } });
});
