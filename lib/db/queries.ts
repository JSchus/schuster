import "server-only";
import { and, arrayContains, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "./index";
import {
  mediaItems,
  userProgress,
  users,
  type MediaItem,
  type MediaType,
  type NewMediaItem,
} from "./schema";

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

/** Replace a video's subtitle list (kept in the metadata jsonb, no extra table). */
export async function setSubtitles(id: string, subtitles: { lang: string; label: string; key: string }[]) {
  await db()
    .update(mediaItems)
    .set({ metadata: sql`${mediaItems.metadata} || jsonb_build_object('subtitles', ${JSON.stringify(subtitles)}::jsonb)` })
    .where(eq(mediaItems.id, id));
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

/* ------------------------------------------------------------------ */
/* Reading progress                                                     */
/* ------------------------------------------------------------------ */

export type ProgressRow = { position: string; percent: number; updatedAt: Date };

export async function getReadyItem(id: string): Promise<MediaItem | undefined> {
  const [row] = await db()
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.status, "ready")))
    .limit(1);
  return row;
}

export async function getProgress(userId: string, itemId: string): Promise<ProgressRow | undefined> {
  const [row] = await db()
    .select({ position: userProgress.position, percent: userProgress.percent, updatedAt: userProgress.updatedAt })
    .from(userProgress)
    .where(and(eq(userProgress.userId, userId), eq(userProgress.itemId, itemId)))
    .limit(1);
  return row ? { ...row, percent: row.percent ?? 0 } : undefined;
}

/**
 * Save a reading position unless the stored one is newer. `at` is when the
 * reader recorded it, so a device syncing late (e.g. after being offline)
 * can't overwrite progress made since on another device. Returns what's stored.
 */
export async function upsertProgress(
  userId: string,
  itemId: string,
  values: { position: string; percent: number; at: Date },
): Promise<ProgressRow> {
  await db()
    .insert(userProgress)
    .values({ userId, itemId, position: values.position, percent: values.percent, updatedAt: values.at })
    .onConflictDoUpdate({
      target: [userProgress.userId, userProgress.itemId],
      set: { position: values.position, percent: values.percent, updatedAt: values.at },
      setWhere: sql`excluded.updated_at > ${userProgress.updatedAt}`,
    });
  return (await getProgress(userId, itemId))!;
}

/** Books, videos and audio this user has started but not finished, most recent first. */
export async function continueReading(userId: string, limit = 12) {
  return db()
    .select({ item: mediaItems, percent: userProgress.percent })
    .from(userProgress)
    .innerJoin(mediaItems, eq(mediaItems.id, userProgress.itemId))
    .where(
      and(
        eq(userProgress.userId, userId),
        eq(mediaItems.status, "ready"),
        sql`${userProgress.percent} > 0 and ${userProgress.percent} < 98`,
      ),
    )
    .orderBy(desc(userProgress.updatedAt))
    .limit(limit);
}
