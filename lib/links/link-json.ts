import type { LinkRow } from "@/lib/db/links";

/** What the browser sees of a short link (never the password hash). */
export type LinkJson = {
  slug: string;
  target: string;
  note: string | null;
  hasPassword: boolean;
  expiresAt: number | null;
  disabled: boolean;
  clicks: number;
  lastClickedAt: number | null;
  createdAt: number;
  ownerName: string | null;
  mine: boolean;
};

export function linkJson(l: Omit<LinkRow, "ownerName"> & { ownerName?: string | null }, viewerId: string): LinkJson {
  return {
    slug: l.slug,
    target: l.targetUrl,
    note: l.note,
    hasPassword: !!l.passwordHash,
    expiresAt: l.expiresAt?.getTime() ?? null,
    disabled: !!l.disabledAt,
    clicks: l.clicks,
    lastClickedAt: l.lastClickedAt?.getTime() ?? null,
    createdAt: l.createdAt.getTime(),
    ownerName: l.ownerName ?? null,
    mine: l.ownerId === viewerId,
  };
}
