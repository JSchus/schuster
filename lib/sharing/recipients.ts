/** One row in Send → Email contacts. */
export type Recipient = { name: string; email: string; sent: number };

/**
 * Address-book emails plus anyone you've emailed a file to, ranked by how
 * often you've sent to them (then most recent, then name). Emails match
 * case-insensitively.
 */
export function rankRecipients(
  contacts: { name: string; emails: string[] }[],
  counts: { email: string; count: number; last: Date }[],
): Recipient[] {
  const byEmail = new Map<string, Recipient & { last: number }>();
  for (const c of contacts) {
    for (const raw of c.emails) {
      const email = raw.trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, { name: c.name, email, sent: 0, last: 0 });
    }
  }
  for (const c of counts) {
    const email = c.email.toLowerCase();
    const row = byEmail.get(email) ?? { name: email, email, sent: 0, last: 0 };
    row.sent += c.count;
    row.last = Math.max(row.last, c.last.getTime());
    byEmail.set(email, row);
  }
  return [...byEmail.values()]
    .sort((a, b) => b.sent - a.sent || b.last - a.last || a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
    .map(({ name, email, sent }) => ({ name, email, sent }));
}
