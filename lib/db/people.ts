import "server-only";
import { and, asc, count, desc, eq, gt, isNull, lt, ne, notExists, sql, sum } from "drizzle-orm";
import type { Role } from "@/lib/permissions";
import { db } from "./index";
import { approvedEmails, invites, mediaItems, users, type Invite } from "./schema";

/* ------------------------------------------------------------------ */
/* People (pickers and the admin page)                                  */
/* ------------------------------------------------------------------ */

export type Person = { id: string; name: string | null; email: string | null };

/** Everyone with an account, for "share with…" pickers. */
export async function listPeople(): Promise<Person[]> {
  return db()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .orderBy(asc(sql`lower(coalesce(${users.name}, ${users.email}))`));
}

export type UserWithStats = Person & { role: Role; createdAt: Date; items: number; bytes: number };

/** Users with how many items they uploaded and how much storage those use. */
export async function listUsersWithStats(): Promise<UserWithStats[]> {
  const rows = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      items: count(mediaItems.id),
      bytes: sum(mediaItems.size),
    })
    .from(users)
    .leftJoin(mediaItems, and(eq(mediaItems.addedBy, users.id), eq(mediaItems.status, "ready")))
    .groupBy(users.id)
    .orderBy(asc(users.createdAt));
  return rows.map((r) => ({ ...r, bytes: Number(r.bytes ?? 0) }));
}

/** Total bytes of ready items, including ones whose uploader was removed. */
export async function totalStorage(): Promise<{ items: number; bytes: number }> {
  const [row] = await db()
    .select({ items: count(), bytes: sum(mediaItems.size) })
    .from(mediaItems)
    .where(eq(mediaItems.status, "ready"));
  return { items: row?.items ?? 0, bytes: Number(row?.bytes ?? 0) };
}

const otherAdmin = (userId: string) =>
  db()
    .select({ one: sql`1` })
    .from(users)
    .where(and(eq(users.role, "admin"), ne(users.id, userId)));

/**
 * Change a role. Refuses (returns false) to demote the last admin, in one
 * atomic UPDATE so two admins demoting each other can't both succeed.
 */
export async function setUserRole(userId: string, role: Role): Promise<boolean> {
  const guard = role === "admin" ? sql`true` : sql`exists (${otherAdmin(userId)})`;
  const rows = await db()
    .update(users)
    .set({ role })
    .where(and(eq(users.id, userId), guard))
    .returning({ id: users.id });
  return rows.length > 0;
}

/**
 * Remove an account (sessions, passkeys, progress and shelves go with it;
 * their uploads stay in the library). Refuses to remove the last admin.
 */
export async function deleteUser(userId: string): Promise<boolean> {
  const rows = await db()
    .delete(users)
    .where(and(eq(users.id, userId), sql`(${users.role} <> 'admin' or exists (${otherAdmin(userId)}))`))
    .returning({ email: users.email });
  const email = rows[0]?.email;
  // Without this, the approval would let them straight back in.
  if (email) await db().delete(approvedEmails).where(eq(approvedEmails.email, email.toLowerCase()));
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Approved emails                                                      */
/* ------------------------------------------------------------------ */

/** Approve an email (or change the role it will get). */
export async function approveEmail(email: string, role: Role, by: { inviteId?: string; addedBy?: string }) {
  await db()
    .insert(approvedEmails)
    .values({ email: email.toLowerCase(), role, inviteId: by.inviteId, addedBy: by.addedBy })
    .onConflictDoUpdate({ target: approvedEmails.email, set: { role } });
}

/** Approved emails that haven't created an account yet. */
export async function pendingApprovals() {
  return db()
    .select({ email: approvedEmails.email, role: approvedEmails.role, createdAt: approvedEmails.createdAt })
    .from(approvedEmails)
    .where(
      notExists(
        db()
          .select({ one: sql`1` })
          .from(users)
          .where(eq(sql`lower(${users.email})`, approvedEmails.email)),
      ),
    )
    .orderBy(desc(approvedEmails.createdAt));
}

export async function removeApproval(email: string) {
  await db().delete(approvedEmails).where(eq(approvedEmails.email, email.toLowerCase()));
}

export async function isApproved(email: string): Promise<boolean> {
  const rows = await db()
    .select({ email: approvedEmails.email })
    .from(approvedEmails)
    .where(eq(approvedEmails.email, email.toLowerCase()))
    .limit(1);
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Invites                                                              */
/* ------------------------------------------------------------------ */

export async function createInvite(values: {
  token: string;
  role: Role;
  note?: string;
  createdBy: string;
  expiresAt: Date;
  maxUses: number;
}): Promise<Invite> {
  const [row] = await db().insert(invites).values(values).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

/** Invites that can still be used, newest first. */
export async function activeInvites(): Promise<Invite[]> {
  return db()
    .select()
    .from(invites)
    .where(and(isNull(invites.revokedAt), gt(invites.expiresAt, new Date()), lt(invites.uses, invites.maxUses)))
    .orderBy(desc(invites.createdAt));
}

export async function revokeInvite(id: string) {
  await db().update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, id));
}

/** An invite by its link token, if it can still be used. */
export async function usableInvite(token: string): Promise<Invite | undefined> {
  const [row] = await db()
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.token, token),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
        lt(invites.uses, invites.maxUses),
      ),
    )
    .limit(1);
  return row;
}

/**
 * Use one of an invite's uses. A single conditional UPDATE, so the last use
 * can't be taken twice. Returns the invite, or undefined if it's used up,
 * expired or revoked.
 */
export async function consumeInvite(token: string): Promise<Pick<Invite, "id" | "role"> | undefined> {
  const [row] = await db()
    .update(invites)
    .set({ uses: sql`${invites.uses} + 1` })
    .where(
      and(
        eq(invites.token, token),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
        lt(invites.uses, invites.maxUses),
      ),
    )
    .returning({ id: invites.id, role: invites.role });
  return row;
}
