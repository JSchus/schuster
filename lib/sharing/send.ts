import "server-only";
import { HttpError } from "@/lib/api";
import { countSendsSince } from "@/lib/db/sends";
import { formatAddress } from "@/lib/mail/headers";

/** Members' sends plus outside emails, per person per day. */
export const SENDS_PER_PERSON_PER_DAY = 100;

/** "John" from the account name, else the part of the email before @. */
export function senderName(user: { name?: string | null; email?: string | null }): string {
  return user.name?.trim().split(/\s+/)[0] || user.email?.split("@")[0] || "Someone";
}

/** `"John via Schuster Media" <noreply@m.schuster.me>`: can't receive replies. */
export function siteFrom(name: string, domain: string) {
  return { header: formatAddress(`${name} via Schuster Media`, `noreply@${domain}`), address: `noreply@${domain}` };
}

export async function checkDailyCap(userId: string, adding: number) {
  const used = await countSendsSince(userId, new Date(Date.now() - 86_400_000));
  if (used + adding > SENDS_PER_PERSON_PER_DAY) {
    throw new HttpError(429, `That's more than ${SENDS_PER_PERSON_PER_DAY} sends today. Try again tomorrow.`);
  }
}
