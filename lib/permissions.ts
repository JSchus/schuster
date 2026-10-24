/**
 * Roles and visibility rules. Pure and edge-safe (no DB), shared by the
 * schema, server routes, pages and tests.
 *
 * - admin:  everything, including the admin page and every item.
 * - member: uploads, edits their own items, makes share links.
 * - viewer: reads, watches and plays; can't upload or share.
 */
export const ROLES = ["admin", "member", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", member: "Member", viewer: "Viewer" };

/**
 * Who can see an item or shelf: everyone signed in (default), the owner plus
 * people picked by name, or the owner only. Admins can always see everything.
 */
export const VISIBILITIES = ["everyone", "people", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  everyone: "Everyone",
  people: "Specific people",
  private: "Only me",
};

export type Viewer = { id: string; role: Role };

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function isAdmin(user: { role: Role } | null | undefined): boolean {
  return user?.role === "admin";
}

/** Upload, make shelves and share links. */
export function canContribute(user: { role: Role } | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "member";
}

/** Edit or delete an item (or shelf): its owner, if they may still contribute, or an admin. */
export function canEdit(user: Viewer | null | undefined, ownerId: string | null): boolean {
  if (!user) return false;
  return user.role === "admin" || (user.role === "member" && ownerId === user.id);
}

/**
 * Visibility check for one item or shelf, given whether `user` is on its
 * people list. The SQL twin is `visibleItems()` in lib/db/queries.ts.
 */
export function canView(
  user: Viewer,
  thing: { ownerId: string | null; visibility: Visibility },
  listed: boolean,
): boolean {
  if (user.role === "admin" || thing.ownerId === user.id) return true;
  if (thing.visibility === "everyone") return true;
  return thing.visibility === "people" && listed;
}

/**
 * Change a playlist: its owner (any role; a playlist only lists songs, it
 * adds no files) or an admin.
 */
export function canEditPlaylist(user: Viewer | null | undefined, ownerId: string): boolean {
  return !!user && (user.role === "admin" || user.id === ownerId);
}
