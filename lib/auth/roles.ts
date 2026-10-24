import "server-only";
import { and, eq, notExists, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/lib/db";
import { approvedEmails, users } from "@/lib/db/schema";

/**
 * Promote `userId` to admin iff no admin exists yet. A single atomic UPDATE,
 * so two simultaneous first sign-ups can't both become admin (and it works on
 * the Neon HTTP driver, which has no interactive transactions).
 */
export async function promoteIfFirstUser(userId: string): Promise<boolean> {
  const admins = db()
    .select({ one: sql`1` })
    .from(users)
    .where(eq(users.role, "admin"));
  const updated = await db()
    .update(users)
    .set({ role: "admin" })
    .where(and(eq(users.id, userId), notExists(admins)))
    .returning({ id: users.id });
  return updated.length > 0;
}

export async function adminExists(): Promise<boolean> {
  const rows = await db().select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  return rows.length > 0;
}

export async function findUserByEmail(email: string) {
  const rows = await db()
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.toLowerCase()))
    .limit(1);
  return rows[0];
}

/**
 * A user's current role. Cached per server render, since the layout, page
 * and metadata each call auth() and the session re-checks the role.
 */
export const getUserRole = cache(async (userId: string) => {
  const rows = await db().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.role;
});

/** The role an approved (invited) email gets, if it was approved. */
export async function findApprovedEmail(email: string) {
  const rows = await db()
    .select({ role: approvedEmails.role })
    .from(approvedEmails)
    .where(eq(approvedEmails.email, email.toLowerCase()))
    .limit(1);
  return rows[0];
}

/**
 * Called once when an account is created: the first user becomes admin;
 * anyone else gets the role their invite or approval named.
 */
export async function assignInitialRole(userId: string, email: string | null | undefined) {
  if (await promoteIfFirstUser(userId)) return;
  const approved = email ? await findApprovedEmail(email) : undefined;
  if (approved && approved.role !== "member") {
    await db().update(users).set({ role: approved.role }).where(eq(users.id, userId));
  }
}
