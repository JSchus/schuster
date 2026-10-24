import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { shares, type Share } from "./schema";

export async function createShare(values: {
  token: string;
  /** Exactly one of itemId / playlistId. */
  itemId?: string;
  playlistId?: string;
  createdBy: string;
  expiresAt: Date;
  passwordHash: string | null;
  allowDownload: boolean;
}): Promise<Share> {
  const [row] = await db().insert(shares).values(values).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

const working = () => and(isNull(shares.revokedAt), gt(shares.expiresAt, new Date()));

/** An item's links that still work, newest first. */
export async function activeSharesForItem(itemId: string): Promise<Share[]> {
  return db().select().from(shares).where(and(eq(shares.itemId, itemId), working())).orderBy(desc(shares.createdAt));
}

/** A playlist's links that still work, newest first. */
export async function activeSharesForPlaylist(playlistId: string): Promise<Share[]> {
  return db()
    .select()
    .from(shares)
    .where(and(eq(shares.playlistId, playlistId), working()))
    .orderBy(desc(shares.createdAt));
}

export async function getShare(token: string): Promise<Share | undefined> {
  const [row] = await db().select().from(shares).where(eq(shares.token, token)).limit(1);
  return row;
}

export async function revokeShare(token: string) {
  await db().update(shares).set({ revokedAt: new Date() }).where(eq(shares.token, token));
}

/** A share link that still works (not turned off, not expired). */
export async function workingShare(token: string): Promise<Share | undefined> {
  const [row] = await db().select().from(shares).where(and(eq(shares.token, token), working())).limit(1);
  return row;
}

export async function countShareView(token: string) {
  await db()
    .update(shares)
    .set({ views: sql`${shares.views} + 1` })
    .where(eq(shares.token, token));
}
