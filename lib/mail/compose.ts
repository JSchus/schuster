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
