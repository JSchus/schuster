import "server-only";
import { and, asc, count, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Viewer, Visibility } from "@/lib/permissions";
import { db } from "./index";
import { visibleTo } from "./queries";
import { mediaItems, shelfAccess, shelfItems, shelves, users, type Shelf } from "./schema";

/** SQL condition: `viewer` may see the shelf (same rules as items). */
function shelfVisibleTo(viewer: Viewer): SQL {
  if (viewer.role === "admin") return sql`true`;
  return or(
    eq(shelves.visibility, "everyone"),
    eq(shelves.ownerId, viewer.id),
    and(
      eq(shelves.visibility, "people"),
      exists(
        db()
          .select({ one: sql`1` })
          .from(shelfAccess)
          .where(and(eq(shelfAccess.shelfId, shelves.id), eq(shelfAccess.userId, viewer.id))),
      ),
    ),
  )!;
}

export type ShelfSummary = Shelf & { ownerName: string | null; items: number };

/**
 * Shelves `viewer` can see, with how many items on each are visible to them.
 * Your own shelves come first.
 */
export async function listShelves(viewer: Viewer): Promise<ShelfSummary[]> {
  const visibleCount = db()
    .select({ n: count() })
    .from(shelfItems)
    .innerJoin(mediaItems, eq(mediaItems.id, shelfItems.itemId))
    .where(and(eq(shelfItems.shelfId, shelves.id), eq(mediaItems.status, "ready"), visibleTo(viewer)));
  const rows = await db()
    .select({ shelf: shelves, ownerName: sql<string | null>`coalesce(${users.name}, ${users.email})`, items: sql<number>`(${visibleCount})::int` })
    .from(shelves)
    .leftJoin(users, eq(users.id, shelves.ownerId))
    .where(shelfVisibleTo(viewer))
    .orderBy(desc(sql`${shelves.ownerId} = ${viewer.id}`), asc(sql`lower(${shelves.name})`));
  return rows.map((r) => ({ ...r.shelf, ownerName: r.ownerName, items: Number(r.items) }));
}

export async function getShelf(id: string, viewer: Viewer): Promise<(Shelf & { ownerName: string | null }) | undefined> {
  const [row] = await db()
    .select({ shelf: shelves, ownerName: sql<string | null>`coalesce(${users.name}, ${users.email})` })
    .from(shelves)
    .leftJoin(users, eq(users.id, shelves.ownerId))
    .where(and(eq(shelves.id, id), shelfVisibleTo(viewer)))
    .limit(1);
  return row ? { ...row.shelf, ownerName: row.ownerName } : undefined;
}

/** Item ids on a shelf, most recently added first (callers filter by visibility). */
export async function shelfItemIds(shelfId: string): Promise<string[]> {
  const rows = await db()
    .select({ itemId: shelfItems.itemId })
    .from(shelfItems)
    .where(eq(shelfItems.shelfId, shelfId))
    .orderBy(desc(shelfItems.addedAt));
  return rows.map((r) => r.itemId);
}

export async function createShelf(values: { name: string; description?: string | null; ownerId: string; visibility: Visibility }) {
  const [row] = await db().insert(shelves).values(values).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function updateShelf(id: string, patch: { name?: string; description?: string | null; visibility?: Visibility }) {
  if (Object.keys(patch).length === 0) return;
  await db().update(shelves).set(patch).where(eq(shelves.id, id));
}

export async function deleteShelf(id: string) {
  await db().delete(shelves).where(eq(shelves.id, id));
}

export async function getShelfAccess(shelfId: string): Promise<string[]> {
  const rows = await db().select({ userId: shelfAccess.userId }).from(shelfAccess).where(eq(shelfAccess.shelfId, shelfId));
  return rows.map((r) => r.userId);
}

export async function setShelfAccess(shelfId: string, userIds: string[]) {
  await db().delete(shelfAccess).where(eq(shelfAccess.shelfId, shelfId));
  if (userIds.length) {
    await db()
      .insert(shelfAccess)
      .values(userIds.map((userId) => ({ shelfId, userId })))
      .onConflictDoNothing();
  }
}

export async function addToShelf(shelfId: string, itemId: string) {
  await db().insert(shelfItems).values({ shelfId, itemId }).onConflictDoNothing();
}

export async function removeFromShelf(shelfId: string, itemId: string) {
  await db().delete(shelfItems).where(and(eq(shelfItems.shelfId, shelfId), eq(shelfItems.itemId, itemId)));
}

/** Of the given shelves, the ids that hold `itemId`. */
export async function shelvesHolding(itemId: string, shelfIds: string[]): Promise<string[]> {
  if (!shelfIds.length) return [];
  const rows = await db()
    .select({ shelfId: shelfItems.shelfId })
    .from(shelfItems)
    .where(and(eq(shelfItems.itemId, itemId), inArray(shelfItems.shelfId, shelfIds)));
  return rows.map((r) => r.shelfId);
}
