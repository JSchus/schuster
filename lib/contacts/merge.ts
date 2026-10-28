import type { ParsedContact } from "./vcard";

export type ExistingContact = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  birthday: string | null;
  org: string | null;
  note: string | null;
  sourceUid: string | null;
};

export type ContactFields = Omit<ExistingContact, "id">;

/**
 * Decide, for an import batch, which contacts update existing ones and which
 * are new. A match is the same vCard UID, or else any shared email or phone
 * number, so re-importing a phone export never creates duplicates. Updated
 * contacts take the imported name/birthday/org/note where present and keep
 * every email and phone from both sides.
 */
export function planImport(
  existing: ExistingContact[],
  incoming: ParsedContact[],
): { updates: (ContactFields & { id: string })[]; inserts: ContactFields[] } {
  const byUid = new Map<string, ExistingContact>();
  const byKey = new Map<string, ExistingContact>();
  const index = (c: ExistingContact) => {
    if (c.sourceUid) byUid.set(c.sourceUid, c);
    for (const e of c.emails) byKey.set(`e:${e}`, c);
    for (const p of c.phones) byKey.set(`p:${p}`, c);
  };
  existing.forEach(index);

  const updated = new Map<string, ExistingContact>();
  const inserts: (ContactFields & { id: string })[] = [];
  let tmp = 0;

  for (const c of incoming) {
    const match =
      (c.uid ? byUid.get(c.uid) : undefined) ??
      c.emails.map((e) => byKey.get(`e:${e}`)).find(Boolean) ??
      c.phones.map((p) => byKey.get(`p:${p}`)).find(Boolean);
    const fields: ContactFields = {
      name: c.name,
      emails: c.emails,
      phones: c.phones,
      birthday: c.birthday,
      org: c.org,
      note: c.note,
      sourceUid: c.uid,
    };
    if (!match) {
      // New (but later rows in this same file may still match it).
      const row = { ...fields, id: `new:${tmp++}` };
      inserts.push(row);
      index(row);
      continue;
    }
    const merged: ExistingContact = {
      id: match.id,
      name: fields.name || match.name,
      emails: [...new Set([...fields.emails, ...match.emails])].slice(0, 10),
      phones: [...new Set([...fields.phones, ...match.phones])].slice(0, 10),
      birthday: fields.birthday ?? match.birthday,
      org: fields.org ?? match.org,
      note: fields.note ?? match.note,
      sourceUid: match.sourceUid ?? fields.sourceUid,
    };
    Object.assign(match, merged);
    index(match);
    if (!match.id.startsWith("new:")) updated.set(match.id, match);
  }

  return {
    updates: [...updated.values()],
    inserts: inserts.map(({ name, emails, phones, birthday, org, note, sourceUid }) => ({
      name,
      emails,
      phones,
      birthday,
      org,
      note,
      sourceUid,
    })),
  };
}
