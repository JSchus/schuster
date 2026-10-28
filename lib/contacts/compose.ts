/**
 * Links that open the person's own Messages or Mail app with a message
 * filled in. Nothing is sent by the server: it comes from their own number
 * or address, so there's no email service to set up and nothing lands in spam.
 */

/** iPhone and iPad (including iPads that report as a Mac). */
export function isAppleMobile(ua: string, touchPoints = 0): boolean {
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
}

/** sms: link. iOS reads "&body=", everything else "?body=". */
export function smsHref(phone: string, body: string, apple: boolean): string {
  return `sms:${encodeURIComponent(phone).replace(/%2B/g, "+")}${apple ? "&" : "?"}body=${encodeURIComponent(body)}`;
}

/** mailto: link with subject and body (spaces as %20, which every mail app accepts). */
export function mailtoHref(email: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** "--04-12" / "1985-04-12" → days until the next birthday (0 = today), in Chicago time. */
export function daysUntilBirthday(birthday: string, now = new Date()): number | null {
  const m = /^(?:\d{4}|-)-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const month = Number(m[1]) - 1;
  const day = Number(m[2]);
  let next = Date.UTC(Number(parts.year), month, day);
  if (next < today) next = Date.UTC(Number(parts.year) + 1, month, day);
  return Math.round((next - today) / 86_400_000);
}

/** "1985-04-12" → "April 12"; "--04-12" → "April 12". */
export function formatBirthday(birthday: string): string {
  const m = /^(?:\d{4}|-)-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return birthday;
  return new Date(Date.UTC(2000, Number(m[1]) - 1, Number(m[2]))).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
