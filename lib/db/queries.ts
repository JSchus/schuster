import "server-only";
import { and, arrayContains, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "./index";
import { mediaItems, users, type MediaItem, type MediaType, type NewMediaItem } from "./schema";

/* ------------------------------------------------------------------ */
/* Upload lifecycle                                                    */
/* ------------------------------------------------------------------ */

export async function createPendingItem(values: NewMediaItem & { id: string }): Promise<MediaItem> {
  const [row] = await db().insert(mediaItems).values({ ...values, status: "pending" }).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

/** A pending item, only if `userId` started the upload. */
export async function getPendingItem(id: string, userId: string): Promise<MediaItem | undefined> {
  const [row] = await db()
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.status, "pending"), eq(mediaItems.addedBy, userId)))
    .limit(1);
  return row;
}

export async function markItemReady(id: string, values: { coverKey: string | null }) {
  await db()
    .update(mediaItems)
    .set({ status: "ready", uploadId: null, coverKey: values.coverKey })
    .where(eq(mediaItems.id, id));
}

/** A ready item, only if `user` uploaded it or is an admin. */
export async function getItemForEdit(
  id: string,
  user: { id: string; role: "admin" | "member" },
): Promise<MediaItem | undefined> {
  const [row] = await db()
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.status, "ready")))
    .limit(1);
  if (!row) return undefined;
  return user.role === "admin" || row.addedBy === user.id ? row : undefined;
}

export async function setItemCover(id: string, coverKey: string) {
  await db().update(mediaItems).set({ coverKey }).where(eq(mediaItems.id, id));
}

export async function deleteItem(id: string) {
  await db().delete(mediaItems).where(eq(mediaItems.id, id));
}

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

export type LibraryFilter = {
  type?: MediaType;
  q?: string;
  tag?: string;
  limit?: number;
};

/** Escape LIKE wildcards in user input. */
function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listItems(filter: LibraryFilter = {}): Promise<MediaItem[]> {
  const where: SQL[] = [eq(mediaItems.status, "ready")];
  if (filter.type) where.push(eq(mediaItems.type, filter.type));
  if (filter.tag) where.push(arrayContains(mediaItems.tags, [filter.tag]));
  if (filter.q?.trim()) {
    const term = likeTerm(filter.q.trim());
    where.push(
      or(
        ilike(mediaItems.title, term),
        ilike(mediaItems.description, term),
        sql`${mediaItems.metadata}->>'author' ilike ${term}`,
      )!,
    );
  }
  return db()
    .select()
    .from(mediaItems)
    .where(and(...where))
    .orderBy(desc(mediaItems.createdAt))
    .limit(filter.limit ?? 200);
}

export function recentItems(limit = 12): Promise<MediaItem[]> {
  return listItems({ limit });
}

/** Distinct tags across ready items, most used first. */
export async function allTags(limit = 50): Promise<{ tag: string; count: number }[]> {
  const rows = await db().execute<{ tag: string; count: number }>(sql`
    select tag, count(*)::int as count
    from ${mediaItems}, unnest(${mediaItems.tags}) as tag
    where ${mediaItems.status} = 'ready'
    group by tag order by count desc, tag asc limit ${limit}
  `);
  // neon-http returns { rows }, postgres-js returns the array itself.
  return Array.isArray(rows) ? rows : (rows as unknown as { rows: { tag: string; count: number }[] }).rows;
}

export async function getItemWithUploader(id: string) {
  const [row] = await db()
    .select({ item: mediaItems, uploaderName: users.name, uploaderEmail: users.email })
    .from(mediaItems)
    .leftJoin(users, eq(users.id, mediaItems.addedBy))
    .where(and(eq(mediaItems.id, id), eq(mediaItems.status, "ready")))
    .limit(1);
  return row;
}
