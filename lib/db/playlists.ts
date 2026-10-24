import "server-only";
import { and, asc, desc, eq, exists, inArray, or, sql, type SQL } from "drizzle-orm";
import type { Viewer, Visibility } from "@/lib/permissions";
import { db } from "./index";
import { visibleTo } from "./queries";
import { mediaItems, playlistAccess, playlists, playlistTracks, users, type MediaItem, type Playlist } from "./schema";

/** SQL condition: `viewer` may see the playlist (same rules as items and shelves). */
function playlistVisibleTo(viewer: Viewer): SQL {
  if (viewer.role === "admin") return sql`true`;
  return or(
    eq(playlists.visibility, "everyone"),
    eq(playlists.ownerId, viewer.id),
    and(
      eq(playlists.visibility, "people"),
      exists(
        db()
          .select({ one: sql`1` })
          .from(playlistAccess)
          .where(and(eq(playlistAccess.playlistId, playlists.id), eq(playlistAccess.userId, viewer.id))),
      ),
    ),
  )!;
}

/** Tracks of a playlist that `viewer` may hear, in play order. */
function visibleTracks(playlistId: SQL | string, viewer: Viewer) {
  return and(
    eq(playlistTracks.playlistId, playlistId as string),
    eq(mediaItems.status, "ready"),
    eq(mediaItems.type, "audio"),
    visibleTo(viewer),
  );
}

export type PlaylistSummary = Playlist & { ownerName: string | null; tracks: number; seconds: number };

/** Playlists `viewer` can see, with the count and length of the tracks they may hear. Their own first. */
export async function listPlaylists(viewer: Viewer): Promise<PlaylistSummary[]> {
  const stats = db()
    .select({
      n: sql<number>`count(*)::int`.as("n"),
      s: sql<number>`coalesce(sum((${mediaItems.metadata}->>'durationSec')::float), 0)::int`.as("s"),
    })
    .from(playlistTracks)
    .innerJoin(mediaItems, eq(mediaItems.id, playlistTracks.itemId))
    .where(visibleTracks(sql`${playlists.id}`, viewer));
  const rows = await db()
    .select({
      playlist: playlists,
      ownerName: sql<string | null>`coalesce(${users.name}, ${users.email})`,
      stats: sql<{ n: number; s: number }>`(select row_to_json(x) from (${stats}) x)`,
    })
    .from(playlists)
    .leftJoin(users, eq(users.id, playlists.ownerId))
    .where(playlistVisibleTo(viewer))
    .orderBy(desc(sql`${playlists.ownerId} = ${viewer.id}`), asc(sql`lower(${playlists.name})`));
  return rows.map((r) => ({ ...r.playlist, ownerName: r.ownerName, tracks: r.stats?.n ?? 0, seconds: r.stats?.s ?? 0 }));
}

export async function getPlaylist(id: string, viewer: Viewer): Promise<(Playlist & { ownerName: string | null }) | undefined> {
  const [row] = await db()
    .select({ playlist: playlists, ownerName: sql<string | null>`coalesce(${users.name}, ${users.email})` })
    .from(playlists)
    .leftJoin(users, eq(users.id, playlists.ownerId))
    .where(and(eq(playlists.id, id), playlistVisibleTo(viewer)))
    .limit(1);
  return row ? { ...row.playlist, ownerName: row.ownerName } : undefined;
}

/** A playlist by id, ignoring visibility (public share links check their own token). */
export async function getPlaylistUnchecked(id: string): Promise<Playlist | undefined> {
  const [row] = await db().select().from(playlists).where(eq(playlists.id, id)).limit(1);
  return row;
}

/** The tracks `viewer` may hear, in order. */
export async function playlistTracksFor(playlistId: string, viewer: Viewer): Promise<MediaItem[]> {
  const rows = await db()
    .select({ item: mediaItems })
    .from(playlistTracks)
    .innerJoin(mediaItems, eq(mediaItems.id, playlistTracks.itemId))
    .where(visibleTracks(playlistId, viewer))
    .orderBy(asc(playlistTracks.position), asc(playlistTracks.addedAt));
  return rows.map((r) => r.item);
}

/** Every track id on the playlist, in order, regardless of visibility. */
export async function allTrackIds(playlistId: string): Promise<string[]> {
  const rows = await db()
    .select({ itemId: playlistTracks.itemId })
    .from(playlistTracks)
    .where(eq(playlistTracks.playlistId, playlistId))
    .orderBy(asc(playlistTracks.position), asc(playlistTracks.addedAt));
  return rows.map((r) => r.itemId);
}

export async function createPlaylist(values: { name: string; description?: string | null; ownerId: string; visibility: Visibility }) {
  const [row] = await db().insert(playlists).values(values).returning();
  if (!row) throw new Error("Insert returned no row");
  return row;
}

export async function updatePlaylist(id: string, patch: { name?: string; description?: string | null; visibility?: Visibility }) {
  if (Object.keys(patch).length === 0) return;
  await db().update(playlists).set(patch).where(eq(playlists.id, id));
}

export async function deletePlaylist(id: string) {
  await db().delete(playlists).where(eq(playlists.id, id));
}

export async function getPlaylistAccess(playlistId: string): Promise<string[]> {
  const rows = await db()
    .select({ userId: playlistAccess.userId })
    .from(playlistAccess)
    .where(eq(playlistAccess.playlistId, playlistId));
  return rows.map((r) => r.userId);
}

export async function setPlaylistAccess(playlistId: string, userIds: string[]) {
  await db().delete(playlistAccess).where(eq(playlistAccess.playlistId, playlistId));
  if (userIds.length) {
    await db()
      .insert(playlistAccess)
      .values(userIds.map((userId) => ({ playlistId, userId })))
      .onConflictDoNothing();
  }
}

/** Append a track (no-op if it's already on the playlist). */
export async function addTrack(playlistId: string, itemId: string) {
  await db()
    .insert(playlistTracks)
    .values({
      playlistId,
      itemId,
      position: sql`(select coalesce(max(${playlistTracks.position}), -1) + 1 from ${playlistTracks} where ${playlistTracks.playlistId} = ${playlistId})`,
    })
    .onConflictDoNothing();
}

export async function removeTrack(playlistId: string, itemId: string) {
  await db()
    .delete(playlistTracks)
    .where(and(eq(playlistTracks.playlistId, playlistId), eq(playlistTracks.itemId, itemId)));
}

/** Set the play order to `itemIds` (callers check it's a permutation of the current tracks). */
export async function reorderTracks(playlistId: string, itemIds: string[]) {
  if (!itemIds.length) return;
  const values = sql.join(
    itemIds.map((id, i) => sql`(${id}::uuid, ${i}::int)`),
    sql`, `,
  );
  await db().execute(sql`
    update ${playlistTracks} set position = v.pos
    from (values ${values}) as v(item_id, pos)
    where ${playlistTracks.playlistId} = ${playlistId} and ${playlistTracks.itemId} = v.item_id
  `);
}

/** Of the given playlists, the ids that hold `itemId`. */
export async function playlistsHolding(itemId: string, playlistIds: string[]): Promise<string[]> {
  if (!playlistIds.length) return [];
  const rows = await db()
    .select({ playlistId: playlistTracks.playlistId })
    .from(playlistTracks)
    .where(and(eq(playlistTracks.itemId, itemId), inArray(playlistTracks.playlistId, playlistIds)));
  return rows.map((r) => r.playlistId);
}
