import { createHash, randomUUID } from "node:crypto";

/** Confirmation links last a day. */
export const CONFIRM_HOURS = 24;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function confirmUrl(origin: string, token: string) {
  return `${origin}/mail-confirm/${token}`;
}

/** A plain-text "confirm this address" email, sent from noreply@ on the alias domain. */
export function confirmationMessage(opts: { to: string; accountEmail: string; url: string; domain: string; now?: Date }): {
  from: string;
  raw: Uint8Array;
} {
  const from = `noreply@${opts.domain}`;
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ");
  const body = [
    "Hi,",
    "",
    `${clean(opts.accountEmail)} asked to reply to Schuster Media email aliases from this address (${clean(opts.to)}).`,
    "",
    "To allow it, open this link (it works for 24 hours):",
    opts.url,
    "",
    "If that wasn't you, ignore this email and nothing changes.",
    "",
    "Schuster Media",
  ].join("\r\n");
  const headers = [
    `From: "Schuster Media" <${from}>`,
    `To: ${clean(opts.to)}`,
    "Subject: Confirm replies from this address",
    `Date: ${(opts.now ?? new Date()).toUTCString()}`,
    `Message-ID: <${randomUUID()}@${opts.domain}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
  ].join("\r\n");
  return { from, raw: new Uint8Array(Buffer.from(`${headers}\r\n\r\n${body}\r\n`, "utf8")) };
}
