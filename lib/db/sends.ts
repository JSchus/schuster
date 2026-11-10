import "server-only";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/permissions";
import { db } from "./index";
import { visibleTo } from "./queries";
import { fileSends, mediaItems, users, type FileSend, type MediaItem } from "./schema";

export async function addSends(rows: Omit<FileSend, "id" | "createdAt">[]) {
  if (rows.length) await db().insert(fileSends).values(rows);
}

/** Everything this person sent (to members or by email) since `since`, for the daily cap. */
export async function countSendsSince(userId: string, since: Date): Promise<number> {
  const [row] = await db()
    .select({ n: sql<number>`count(*)::int` })
    .from(fileSends)
    .where(and(eq(fileSends.fromUser, userId), gt(fileSends.createdAt, since)));
  return row?.n ?? 0;
}

export type SharedWithMe = { item: MediaItem; fromName: string | null; fromEmail: string | null; note: string | null; at: Date };

/** Files members sent to `viewer`, newest send per file, only while the viewer can still see them. */
export async function sharedWithMe(viewer: Viewer): Promise<SharedWithMe[]> {
  const rows = await db()
    .select({ item: mediaItems, fromName: users.name, fromEmail: users.email, note: fileSends.note, at: fileSends.createdAt })
    .from(fileSends)
    .innerJoin(mediaItems, eq(mediaItems.id, fileSends.itemId))
    .leftJoin(users, eq(users.id, fileSends.fromUser))
    .where(and(eq(fileSends.toUser, viewer.id), eq(mediaItems.status, "ready"), visibleTo(viewer)))
    .orderBy(desc(fileSends.createdAt))
    .limit(300);
  const seen = new Set<string>();
  return rows.filter((r) => !seen.has(r.item.id) && seen.add(r.item.id));
}
