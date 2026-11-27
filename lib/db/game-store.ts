import "server-only";
import { and, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "./index";
import { gamePurchases, type GamePurchase } from "./schema";

export async function addPurchase(row: Omit<GamePurchase, "grantedAt" | "createdAt">) {
  await db().insert(gamePurchases).values(row);
}

export async function getPurchase(id: string): Promise<GamePurchase | undefined> {
  const [row] = await db().select().from(gamePurchases).where(eq(gamePurchases.id, id)).limit(1);
  return row;
}

/** Mark as handed out; false if it already was (so packs are only given once). */
export async function markGranted(id: string): Promise<boolean> {
  const rows = await db()
    .update(gamePurchases)
    .set({ grantedAt: new Date() })
    .where(and(eq(gamePurchases.id, id), isNull(gamePurchases.grantedAt)))
    .returning({ id: gamePurchases.id });
  return rows.length > 0;
}

/** Deals this device has already received (for once-only deals). */
export async function grantedOffers(deviceId: string): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ offer: gamePurchases.offer })
    .from(gamePurchases)
    .where(and(eq(gamePurchases.deviceId, deviceId), isNotNull(gamePurchases.grantedAt)));
  return rows.map((r) => r.offer);
}

/** Checkouts started by this device since `since` (to stop runaway clicking). */
export async function recentCheckouts(deviceId: string, since: Date): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(gamePurchases)
    .where(and(eq(gamePurchases.deviceId, deviceId), gt(gamePurchases.createdAt, since)));
  return row?.n ?? 0;
}
