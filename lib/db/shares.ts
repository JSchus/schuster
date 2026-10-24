import "server-only";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { mediaItems, shares, type MediaItem, type Share } from "./schema";

export async function createShare(values: {
  token: string;
  itemId: string;
  createdBy: string;
  expiresAt: Date;
  passwordHash: string | null;
  allowDownload: boolean;
}): Promise<Share> {
  const [row] = await db().insert(shares).values(values).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

/** An item's links that still work, newest first. */
export async function activeSharesForItem(itemId: string): Promise<Share[]> {
  return db()
    .select()
    .from(shares)
    .where(and(eq(shares.itemId, itemId), isNull(shares.revokedAt), gt(shares.expiresAt, new Date())))
    .orderBy(desc(shares.createdAt));
}

export async function getShare(token: string): Promise<Share | undefined> {
  const [row] = await db().select().from(shares).where(eq(shares.token, token)).limit(1);
  return row;
}

export async function revokeShare(token: string) {
  await db().update(shares).set({ revokedAt: new Date() }).where(eq(shares.token, token));
}

/** A working share link and its (ready) item. */
export async function openShare(token: string): Promise<{ share: Share; item: MediaItem } | undefined> {
  const [row] = await db()
    .select({ share: shares, item: mediaItems })
    .from(shares)
    .innerJoin(mediaItems, eq(mediaItems.id, shares.itemId))
    .where(
      and(
        eq(shares.token, token),
        isNull(shares.revokedAt),
        gt(shares.expiresAt, new Date()),
        eq(mediaItems.status, "ready"),
      ),
    )
    .limit(1);
  return row;
}

export async function countShareView(token: string) {
  await db()
    .update(shares)
    .set({ views: sql`${shares.views} + 1` })
    .where(eq(shares.token, token));
}
