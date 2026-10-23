import "server-only";
import { and, eq, notExists, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

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

export async function getUserRole(userId: string) {
  const rows = await db().select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.role;
}
