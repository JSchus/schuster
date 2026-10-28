import "server-only";
import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import type { ContactFields } from "@/lib/contacts/merge";
import { db } from "./index";
import { contacts, profiles, users, type Contact, type Profile } from "./schema";

/*
 * Every contacts query is scoped to the owner. There is deliberately no
 * admin exception: a person's address book is theirs alone.
 */

const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function listContacts(ownerId: string, q?: string): Promise<Contact[]> {
  const where = [eq(contacts.ownerId, ownerId)];
  if (q?.trim()) {
    const term = likeTerm(q.trim());
    where.push(
      or(
        ilike(contacts.name, term),
        ilike(contacts.org, term),
        sql`array_to_string(${contacts.emails}, ' ') ilike ${term}`,
        sql`array_to_string(${contacts.phones}, ' ') ilike ${term}`,
      )!,
    );
  }
  return db()
    .select()
    .from(contacts)
    .where(and(...where))
    .orderBy(asc(sql`lower(${contacts.name})`))
    .limit(10_000);
}

export async function getContact(ownerId: string, id: string): Promise<Contact | undefined> {
  const [row] = await db()
    .select()
    .from(contacts)
    .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)))
    .limit(1);
  return row;
}

export async function createContact(ownerId: string, fields: ContactFields): Promise<Contact> {
  const [row] = await db().insert(contacts).values({ ...fields, ownerId }).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

/** Apply an import plan (lib/contacts/merge.ts) in two statements: one UPDATE, one INSERT. */
export async function applyImport(
  ownerId: string,
  plan: { updates: (ContactFields & { id: string })[]; inserts: ContactFields[] },
) {
  if (plan.updates.length) {
    const rows = JSON.stringify(
      plan.updates.map((u) => ({
        id: u.id,
        name: u.name,
        emails: u.emails,
        phones: u.phones,
        birthday: u.birthday,
        org: u.org,
        note: u.note,
        source_uid: u.sourceUid,
      })),
    );
    await db().execute(sql`
      update ${contacts} c set
        name = v.name, emails = v.emails, phones = v.phones, birthday = v.birthday,
        org = v.org, note = v.note, source_uid = v.source_uid, updated_at = now()
      from jsonb_to_recordset(${rows}::jsonb)
        as v(id uuid, name text, emails text[], phones text[], birthday text, org text, note text, source_uid text)
      where c.id = v.id and c.owner_id = ${ownerId}
    `);
  }
  if (plan.inserts.length) {
    await db()
      .insert(contacts)
      .values(plan.inserts.map((f) => ({ ...f, ownerId })))
      .onConflictDoNothing();
  }
}

export async function updateContact(ownerId: string, id: string, patch: Partial<ContactFields>) {
  if (Object.keys(patch).length === 0) return;
  await db()
    .update(contacts)
    .set(patch)
    .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)));
}

export async function deleteContact(ownerId: string, id: string) {
  await db()
    .delete(contacts)
    .where(and(eq(contacts.ownerId, ownerId), eq(contacts.id, id)));
}

export async function deleteAllContacts(ownerId: string): Promise<number> {
  const rows = await db().delete(contacts).where(eq(contacts.ownerId, ownerId)).returning({ id: contacts.id });
  return rows.length;
}

/* ------------------------------------------------------------------ */
/* Family directory                                                     */
/* ------------------------------------------------------------------ */

export async function getProfile(userId: string): Promise<Profile | undefined> {
  const [row] = await db().select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return row;
}

export type ProfileFields = Pick<Profile, "displayName" | "phone" | "birthday" | "address" | "note" | "listed">;

export async function upsertProfile(userId: string, fields: ProfileFields) {
  await db()
    .insert(profiles)
    .values({ userId, ...fields })
    .onConflictDoUpdate({ target: profiles.userId, set: fields });
}

export type DirectoryEntry = Profile & { email: string | null; accountName: string | null };

/** Everyone who chose to be listed, by name. */
export async function listDirectory(): Promise<DirectoryEntry[]> {
  const rows = await db()
    .select({ profile: profiles, email: users.email, accountName: users.name })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.listed, true))
    .orderBy(asc(sql`lower(coalesce(${profiles.displayName}, ${users.name}, ${users.email}))`));
  return rows.map((r) => ({ ...r.profile, email: r.email, accountName: r.accountName }));
}
