import type { Contact } from "@/lib/db/schema";

/** What the browser sees of a contact. */
export type ContactJson = {
  id: string;
  name: string;
  emails: string[];
  phones: string[];
  birthday: string | null;
  org: string | null;
  note: string | null;
};

export function contactJson(c: Contact): ContactJson {
  return { id: c.id, name: c.name, emails: c.emails, phones: c.phones, birthday: c.birthday, org: c.org, note: c.note };
}
