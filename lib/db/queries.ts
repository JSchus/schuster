import "server-only";
import { and, arrayContains, desc, eq, exists, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { canEdit, type Viewer, type Visibility } from "@/lib/permissions";
import { db } from "./index";
import {
  itemAccess,
  mediaItems,
  userProgress,
  users,
  type MediaItem,
  type MediaMetadata,
  type MediaType,
  type NewMediaItem,
} from "./schema";

/* ------------------------------------------------------------------ */
/* Visibility                                                           */
/* ------------------------------------------------------------------ */

/**
 * SQL condition: `viewer` may see the media_items row. The TypeScript twin
 * is `canView()` in lib/permissions.ts. Every query that hands items to a
 * signed-in user goes through this.
 */
export function visibleTo(viewer: Viewer): SQL {
  if (viewer.role === "admin") return sql`true`;
  return or(
    eq(mediaItems.visibility, "everyone"),
    eq(mediaItems.addedBy, viewer.id),
    and(
      eq(mediaItems.visibility, "people"),
      exists(
        db()
          .select({ one: sql`1` })
          .from(itemAccess)
          .where(and(eq(itemAccess.itemId, mediaItems.id), eq(itemAccess.userId, viewer.id))),
      ),
    ),
  )!;
}

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

/** A ready item, only if `user` may edit it (its uploader, or an admin). */
export async function getItemForEdit(id: string, user: Viewer): Promise<MediaItem | undefined> {
  const [row] = await db()
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.status, "ready")))
    .limit(1);
  if (!row) return undefined;
  return canEdit(user, row.addedBy) ? row : undefined;
}

export type ItemPatch = {
  title?: string;
  description?: string | null;
  tags?: string[];
  author?: string | null;
  visibility?: Visibility;
};

/** Edit an item's details. `author` lives in the metadata jsonb. */
export async function updateItem(id: string, patch: ItemPatch) {
  const { author, ...columns } = patch;
  const metadata =
    author === undefined
      ? undefined
      : author
        ? sql`${mediaItems.metadata} || jsonb_build_object('author', ${author}::text)`
        : sql`${mediaItems.metadata} - 'author'`;
  if (Object.keys(columns).length === 0 && !metadata) return;
  await db()
    .update(mediaItems)
    .set({ ...columns, ...(metadata ? { metadata } : {}) })
    .where(eq(mediaItems.id, id));
}

/** The people an item is shared with (visibility "people"). */
export async function getItemAccess(itemId: string): Promise<string[]> {
  const rows = await db().select({ userId: itemAccess.userId }).from(itemAccess).where(eq(itemAccess.itemId, itemId));
  return rows.map((r) => r.userId);
}

/** Replace an item's people list. */
export async function setItemAccess(itemId: string, userIds: string[]) {
  await db().delete(itemAccess).where(eq(itemAccess.itemId, itemId));
  if (userIds.length) {
    await db()
      .insert(itemAccess)
      .values(userIds.map((userId) => ({ itemId, userId })))
      .onConflictDoNothing();
  }
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

/** Merge fields into a game's metadata (system, web publish state). */
export async function setGameMeta(id: string, patch: Pick<MediaMetadata, "system" | "web">) {
  await db()
    .update(mediaItems)
    .set({ metadata: sql`${mediaItems.metadata} || ${JSON.stringify(patch)}::jsonb` })
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
  /** Only these ids (a shelf's items). */
  ids?: string[];
  limit?: number;
};

/** Escape LIKE wildcards in user input. */
function likeTerm(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listItems(viewer: Viewer, filter: LibraryFilter = {}): Promise<MediaItem[]> {
  const where: SQL[] = [eq(mediaItems.status, "ready"), visibleTo(viewer)];
  if (filter.ids) {
    if (!filter.ids.length) return [];
    where.push(inArray(mediaItems.id, filter.ids));
  }
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

export function recentItems(viewer: Viewer, limit = 12): Promise<MediaItem[]> {
  return listItems(viewer, { limit });
}

/** Distinct tags across ready items `viewer` can see, most used first. */
export async function allTags(viewer: Viewer, limit = 50): Promise<{ tag: string; count: number }[]> {
  const rows = await db().execute<{ tag: string; count: number }>(sql`
    select tag, count(*)::int as count
    from ${mediaItems}, unnest(${mediaItems.tags}) as tag
    where ${mediaItems.status} = 'ready' and ${visibleTo(viewer)}
    group by tag order by count desc, tag asc limit ${limit}
  `);
  // neon-http returns { rows }, postgres-js returns the array itself.
  return Array.isArray(rows) ? rows : (rows as unknown as { rows: { tag: string; count: number }[] }).rows;
}

export async function getItemWithUploader(id: string, viewer: Viewer) {
  const [row] = await db()
    .select({ item: mediaItems, uploaderName: users.name, uploaderEmail: users.email })
    .from(mediaItems)
    .leftJoin(users, eq(users.id, mediaItems.addedBy))
    .where(and(eq(mediaItems.id, id), eq(mediaItems.status, "ready"), visibleTo(viewer)))
    .limit(1);
  return row;
}

/* ------------------------------------------------------------------ */
/* Reading progress                                                     */
/* ------------------------------------------------------------------ */

export type ProgressRow = { position: string; percent: number; updatedAt: Date };

/** A ready item `viewer` may see. */
export async function getReadyItem(id: string, viewer: Viewer): Promise<MediaItem | undefined> {
  const [row] = await db()
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.id, id), eq(mediaItems.status, "ready"), visibleTo(viewer)))
    .limit(1);
  return row;
}

/** A ready item regardless of visibility (public share links check their own token). */
export async function getReadyItemUnchecked(id: string): Promise<MediaItem | undefined> {
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
export async function continueReading(viewer: Viewer, limit = 12) {
  return db()
    .select({ item: mediaItems, percent: userProgress.percent })
    .from(userProgress)
    .innerJoin(mediaItems, eq(mediaItems.id, userProgress.itemId))
    .where(
      and(
        eq(userProgress.userId, viewer.id),
        eq(mediaItems.status, "ready"),
        visibleTo(viewer),
        sql`${userProgress.percent} > 0 and ${userProgress.percent} < 98`,
      ),
    )
    .orderBy(desc(userProgress.updatedAt))
    .limit(limit);
}

/* ------------------------------------------------------------------ */
/* Housekeeping (admin page)                                            */
/* ------------------------------------------------------------------ */

/** Uploads that never finished (closed tab, lost network), older than `hours`. */
export async function stalePendingItems(hours = 24): Promise<MediaItem[]> {
  return db()
    .select()
    .from(mediaItems)
    .where(and(eq(mediaItems.status, "pending"), lt(mediaItems.createdAt, new Date(Date.now() - hours * 3_600_000))))
    .orderBy(desc(mediaItems.createdAt))
    .limit(200);
}

export async function getItemAnyStatus(id: string): Promise<MediaItem | undefined> {
  const [row] = await db().select().from(mediaItems).where(eq(mediaItems.id, id)).limit(1);
  return row;
}
