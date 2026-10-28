import "server-only";
import { desc, eq, sql } from "drizzle-orm";
import type { Viewer } from "@/lib/permissions";
import { db } from "./index";
import { shortLinks, users, type ShortLink } from "./schema";

/** Insert a link; undefined if the slug is taken. */
export async function createLink(values: {
  slug: string;
  targetUrl: string;
  ownerId: string;
  note: string | null;
  passwordHash: string | null;
  expiresAt: Date | null;
}): Promise<ShortLink | undefined> {
  const [row] = await db().insert(shortLinks).values(values).onConflictDoNothing().returning();
  return row;
}

export type LinkRow = ShortLink & { ownerName: string | null };

/** Your own links, newest first; admins see everyone's. */
export async function listLinks(viewer: Viewer): Promise<LinkRow[]> {
  const rows = await db()
    .select({ link: shortLinks, ownerName: sql<string | null>`coalesce(${users.name}, ${users.email})` })
    .from(shortLinks)
    .leftJoin(users, eq(users.id, shortLinks.ownerId))
    .where(viewer.role === "admin" ? sql`true` : eq(shortLinks.ownerId, viewer.id))
    .orderBy(desc(shortLinks.createdAt))
    .limit(500);
  return rows.map((r) => ({ ...r.link, ownerName: r.ownerName }));
}

export async function getLink(slug: string): Promise<ShortLink | undefined> {
  const [row] = await db().select().from(shortLinks).where(eq(shortLinks.slug, slug)).limit(1);
  return row;
}

export async function updateLink(slug: string, patch: { targetUrl?: string; note?: string | null; disabledAt?: Date | null }) {
  if (Object.keys(patch).length === 0) return;
  await db().update(shortLinks).set(patch).where(eq(shortLinks.slug, slug));
}

export async function deleteLink(slug: string) {
  await db().delete(shortLinks).where(eq(shortLinks.slug, slug));
}

export async function countClick(slug: string) {
  await db()
    .update(shortLinks)
    .set({ clicks: sql`${shortLinks.clicks} + 1`, lastClickedAt: new Date() })
    .where(eq(shortLinks.slug, slug));
}

/** Usable now: exists, not turned off, not expired. */
export function isLive(link: ShortLink | undefined, now = new Date()): link is ShortLink {
  return !!link && !link.disabledAt && (!link.expiresAt || link.expiresAt > now);
}
