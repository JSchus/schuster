import { randomUUID } from "node:crypto";

/** New emails per alias per day written on the site (protects the SES sending reputation). */
export const SENDS_PER_DAY = 30;

/** A header-safe subject: one line, RFC 2047 when it isn't plain ASCII. */
export function encodeSubject(subject: string): string {
  const clean = subject.replace(/[\r\n\t]+/g, " ").trim();
  return /[^\x20-\x7e]/.test(clean) ? `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=` : clean;
}

/** A new plain-text email from an alias. The body is base64 so any text survives as-is. */
export function composeMessage(opts: { from: string; to: string; subject: string; text: string; domain: string; now?: Date }): Uint8Array {
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, "");
  const body = Buffer.from(opts.text.replace(/\r?\n/g, "\r\n"), "utf8")
    .toString("base64")
    .replace(/.{1,76}/g, "$&\r\n");
  const headers = [
    `From: ${oneLine(opts.from)}`,
    `To: ${oneLine(opts.to)}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `Date: ${(opts.now ?? new Date()).toUTCString()}`,
    `Message-ID: <${randomUUID()}@${opts.domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: base64",
  ].join("\r\n");
  return new Uint8Array(Buffer.from(`${headers}\r\n\r\n${body}`, "utf8"));
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const b64 = (s: string) => Buffer.from(s.replace(/\r?\n/g, "\r\n"), "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n");

/** A text + HTML email (multipart/alternative). `from` and `to` are full header values. */
export function composeMultipart(opts: { from: string; to: string; subject: string; text: string; html: string; domain: string; now?: Date }): Uint8Array {
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, "");
  const boundary = `sm-${randomUUID()}`;
  const headers = [
    `From: ${oneLine(opts.from)}`,
    `To: ${oneLine(opts.to)}`,
    `Subject: ${encodeSubject(opts.subject)}`,
    `Date: ${(opts.now ?? new Date()).toUTCString()}`,
    `Message-ID: <${randomUUID()}@${opts.domain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const part = (type: string, body: string) =>
    `--${boundary}\r\nContent-Type: ${type}; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(body)}`;
  const raw = `${headers}\r\n\r\n${part("text/plain", opts.text)}${part("text/html", opts.html)}--${boundary}--\r\n`;
  return new Uint8Array(Buffer.from(raw, "utf8"));
}

/** "John shared “Grandma's recipes” with you": subject, text and HTML. */
export function fileEmail(opts: { senderName: string; title: string; note?: string | null; url: string; until?: Date | null; replies: boolean }) {
  const subject = `${opts.senderName} shared “${opts.title}” with you`;
  const until = opts.until
    ? `This link works until ${opts.until.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Chicago" })}.`
    : "";
  const footer = opts.replies ? "Sent with Schuster Media. You can reply to this email." : "Sent with Schuster Media. Replies to this email aren't received.";
  const note = opts.note?.trim();
  const text = [`${opts.senderName} shared “${opts.title}” with you.`, "", ...(note ? [note, ""] : []), `Open it: ${opts.url}`, ...(until ? [until] : []), "", footer].join("\n");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:24px"><tr><td>
<p style="margin:0 0 12px;font-size:16px"><strong>${escapeHtml(opts.senderName)}</strong> shared <strong>${escapeHtml(opts.title)}</strong> with you.</p>
${note ? `<p style="margin:0 0 16px;padding:12px;background:#f4f4f5;border-radius:8px;white-space:pre-line">${escapeHtml(note)}</p>` : ""}
<p style="margin:0 0 16px"><a href="${escapeHtml(opts.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600">Open</a></p>
${until ? `<p style="margin:0 0 8px;font-size:13px;color:#71717a">${escapeHtml(until)}</p>` : ""}
<p style="margin:16px 0 0;font-size:12px;color:#a1a1aa">${escapeHtml(footer)}</p>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
