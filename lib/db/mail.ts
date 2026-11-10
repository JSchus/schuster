import "server-only";
import { and, arrayContains, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "./index";
import { mailAliases, mailLog, mailReplyAddresses, mailReverse, users, type MailAlias, type MailLogRow, type MailReplyAddress } from "./schema";

/*
 * Every alias query for the UI is scoped to its owner or (group aliases)
 * its members. Admins see only their own, like contacts.
 */

const visibleTo = (userId: string) => or(eq(mailAliases.ownerId, userId), arrayContains(mailAliases.memberIds, [userId]))!;

export async function listAliases(userId: string): Promise<MailAlias[]> {
  return db().select().from(mailAliases).where(visibleTo(userId)).orderBy(desc(mailAliases.createdAt));
}

/** An alias the user owns or is a member of. */
export async function getVisibleAlias(userId: string, id: string): Promise<MailAlias | undefined> {
  const [row] = await db()
    .select()
    .from(mailAliases)
    .where(and(eq(mailAliases.id, id), visibleTo(userId)))
    .limit(1);
  return row;
}

export async function getAliasByLocal(localPart: string): Promise<MailAlias | undefined> {
  const [row] = await db().select().from(mailAliases).where(eq(mailAliases.localPart, localPart)).limit(1);
  return row;
}

/** undefined if the name is taken. */
export async function createAlias(values: {
  localPart: string;
  ownerId: string;
  label: string | null;
  kind: "personal" | "group";
  memberIds: string[];
  expiresAt: Date | null;
}): Promise<MailAlias | undefined> {
  const [row] = await db().insert(mailAliases).values(values).onConflictDoNothing().returning();
  return row;
}

export async function updateAlias(
  id: string,
  patch: Partial<Pick<MailAlias, "label" | "active" | "memberIds" | "expiresAt" | "pausedReason">>,
) {
  if (Object.keys(patch).length === 0) return;
  await db().update(mailAliases).set(patch).where(eq(mailAliases.id, id));
}

export async function deleteAlias(id: string) {
  await db().delete(mailAliases).where(eq(mailAliases.id, id));
}

/** Count a message: forwarded ("received") or dropped ("blocked"). */
export async function countMessage(id: string, delivered: boolean) {
  await db()
    .update(mailAliases)
    .set(
      delivered
        ? { received: sql`${mailAliases.received} + 1`, lastReceivedAt: new Date() }
        : { blocked: sql`${mailAliases.blocked} + 1` },
    )
    .where(eq(mailAliases.id, id));
}

/* ------------------------------------------------------------------ */
/* Hidden reply addresses                                              */
/* ------------------------------------------------------------------ */

/** The reply token for (alias, outside sender), made on first use. */
export async function reverseTokenFor(aliasId: string, externalAddress: string, newToken: string): Promise<string> {
  await db().insert(mailReverse).values({ token: newToken, aliasId, externalAddress }).onConflictDoNothing();
  const [row] = await db()
    .select({ token: mailReverse.token })
    .from(mailReverse)
    .where(and(eq(mailReverse.aliasId, aliasId), eq(mailReverse.externalAddress, externalAddress)))
    .limit(1);
  return row!.token;
}

export async function getReverse(token: string): Promise<{ externalAddress: string; alias: MailAlias } | undefined> {
  const [row] = await db()
    .select({ externalAddress: mailReverse.externalAddress, alias: mailAliases })
    .from(mailReverse)
    .innerJoin(mailAliases, eq(mailAliases.id, mailReverse.aliasId))
    .where(eq(mailReverse.token, token))
    .limit(1);
  if (row) await db().update(mailReverse).set({ lastUsedAt: new Date() }).where(eq(mailReverse.token, token));
  return row;
}

/* ------------------------------------------------------------------ */
/* People                                                              */
/* ------------------------------------------------------------------ */

/** Account emails (lower-case) for these user ids. */
export async function emailsFor(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await db().select({ email: users.email }).from(users).where(inArray(users.id, userIds));
  return rows.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e);
}

export async function adminEmails(): Promise<string[]> {
  const rows = await db().select({ email: users.email }).from(users).where(eq(users.role, "admin"));
  return rows.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e);
}

/* ------------------------------------------------------------------ */
/* Extra reply-from addresses                                          */
/* ------------------------------------------------------------------ */

export const MAX_REPLY_ADDRESSES = 3;

export async function listReplyAddresses(userId: string): Promise<MailReplyAddress[]> {
  return db().select().from(mailReplyAddresses).where(eq(mailReplyAddresses.userId, userId)).orderBy(mailReplyAddresses.createdAt);
}

/** Add (or re-send for) an address. A confirmed address stays confirmed. */
export async function saveReplyAddress(userId: string, email: string, tokenHash: string, tokenExpiresAt: Date): Promise<MailReplyAddress> {
  const [row] = await db()
    .insert(mailReplyAddresses)
    .values({ userId, email, tokenHash, tokenExpiresAt })
    .onConflictDoUpdate({
      target: [mailReplyAddresses.userId, mailReplyAddresses.email],
      set: { tokenHash, tokenExpiresAt },
      setWhere: sql`${mailReplyAddresses.confirmedAt} is null`,
    })
    .returning();
  if (row) return row;
  const [existing] = await db()
    .select()
    .from(mailReplyAddresses)
    .where(and(eq(mailReplyAddresses.userId, userId), eq(mailReplyAddresses.email, email)));
  return existing!;
}

/** Confirm by token hash; undefined if unknown or expired. */
export async function confirmReplyAddress(tokenHash: string, now = new Date()): Promise<MailReplyAddress | undefined> {
  const [row] = await db()
    .update(mailReplyAddresses)
    .set({ confirmedAt: now, tokenHash: null, tokenExpiresAt: null })
    .where(and(eq(mailReplyAddresses.tokenHash, tokenHash), gt(mailReplyAddresses.tokenExpiresAt, now)))
    .returning();
  return row;
}

export async function deleteReplyAddress(userId: string, id: string): Promise<boolean> {
  const rows = await db()
    .delete(mailReplyAddresses)
    .where(and(eq(mailReplyAddresses.id, id), eq(mailReplyAddresses.userId, userId)))
    .returning({ id: mailReplyAddresses.id });
  return rows.length > 0;
}

/** Confirmed extra reply-from addresses for these user ids. */
export async function replyEmailsFor(userIds: string[]): Promise<string[]> {
  if (!userIds.length) return [];
  const rows = await db()
    .select({ email: mailReplyAddresses.email })
    .from(mailReplyAddresses)
    .where(and(inArray(mailReplyAddresses.userId, userIds), sql`${mailReplyAddresses.confirmedAt} is not null`));
  return rows.map((r) => r.email);
}

/* ------------------------------------------------------------------ */
/* Log (14 days)                                                        */
/* ------------------------------------------------------------------ */

export const LOG_DAYS = 14;

export async function addLog(row: Omit<MailLogRow, "id" | "createdAt">) {
  await db().insert(mailLog).values(row);
}

/** New emails written on the site from this alias since `since` (for the daily cap). */
export async function countSentSince(aliasId: string, since: Date): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(mailLog)
    .where(and(eq(mailLog.aliasId, aliasId), eq(mailLog.outcome, "sent"), gt(mailLog.createdAt, since)));
  return row?.n ?? 0;
}

export async function listLog(aliasId: string): Promise<MailLogRow[]> {
  const since = new Date(Date.now() - LOG_DAYS * 86_400_000);
  return db()
    .select()
    .from(mailLog)
    .where(and(eq(mailLog.aliasId, aliasId), gt(mailLog.createdAt, since)))
    .orderBy(desc(mailLog.createdAt))
    .limit(200);
}

/** A log entry, only if `userId` can see its alias. */
export async function getVisibleLog(userId: string, id: string): Promise<MailLogRow | undefined> {
  const [row] = await db()
    .select({ log: mailLog })
    .from(mailLog)
    .innerJoin(mailAliases, eq(mailAliases.id, mailLog.aliasId))
    .where(and(eq(mailLog.id, id), visibleTo(userId)))
    .limit(1);
  return row?.log;
}

export async function pruneLog(now = new Date()) {
  await db()
    .delete(mailLog)
    .where(lt(mailLog.createdAt, new Date(now.getTime() - LOG_DAYS * 86_400_000)));
}
