/**
 * Runs the real visibility / invite / role SQL against Postgres. Skipped
 * unless TEST_DATABASE_URL points at a migrated database (e.g. the local
 * one from docker-compose); it only touches rows it creates.
 *
 *   TEST_DATABASE_URL=postgres://… pnpm test tests/db
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("sharing SQL (Postgres)", async () => {
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET ??= "test-secret-test-secret";
  const { db } = await import("@/lib/db");
  const { invites, mediaItems, users } = await import("@/lib/db/schema");
  const q = await import("@/lib/db/queries");
  const people = await import("@/lib/db/people");
  const shelves = await import("@/lib/db/shelves");
  const { inArray, like } = await import("drizzle-orm");

  const tag = `t${randomUUID().slice(0, 8)}`;
  const u = { admin: randomUUID(), owner: randomUUID(), friend: randomUUID(), stranger: randomUUID() };
  const item = { everyone: randomUUID(), people: randomUUID(), private: randomUUID() };
  const as = (id: string, role: "admin" | "member" | "viewer" = "member") => ({ id, role });

  beforeAll(async () => {
    await db().insert(users).values([
      { id: u.admin, email: `${tag}-a@x.test`, role: "admin" },
      { id: u.owner, email: `${tag}-o@x.test` },
      { id: u.friend, email: `${tag}-f@x.test`, role: "viewer" },
      { id: u.stranger, email: `${tag}-s@x.test` },
    ]);
    await db().insert(mediaItems).values(
      Object.entries(item).map(([visibility, id]) => ({
        id,
        status: "ready" as const,
        type: "file" as const,
        title: `${tag} ${visibility}`,
        fileKey: `media/${id}/f`,
        size: 1,
        mime: "text/plain",
        tags: [tag],
        addedBy: u.owner,
        visibility: visibility as "everyone",
      })),
    );
    await q.setItemAccess(item.people, [u.friend]);
  });

  afterAll(async () => {
    await db().delete(mediaItems).where(inArray(mediaItems.id, Object.values(item)));
    await db().delete(users).where(inArray(users.id, Object.values(u)));
    await db().delete(invites).where(like(invites.token, `${tag}%`));
  });

  const titles = async (viewer: { id: string; role: "admin" | "member" | "viewer" }) =>
    (await q.listItems(viewer, { tag })).map((i) => i.title.split(" ")[1]).sort();

  it("filters lists, tags and lookups by visibility", async () => {
    expect(await titles(as(u.owner))).toEqual(["everyone", "people", "private"]);
    expect(await titles(as(u.friend, "viewer"))).toEqual(["everyone", "people"]);
    expect(await titles(as(u.stranger))).toEqual(["everyone"]);
    expect(await titles(as(u.admin, "admin"))).toEqual(["everyone", "people", "private"]);
    expect(await q.getReadyItem(item.private, as(u.stranger))).toBeUndefined();
    expect(await q.getItemWithUploader(item.people, as(u.friend, "viewer"))).toBeDefined();
    const tags = await q.allTags(as(u.stranger), 500);
    expect(tags.find((t) => t.tag === tag)?.count).toBe(1);
  });

  it("edits title, author and visibility", async () => {
    await q.updateItem(item.everyone, { title: `${tag} everyone`, author: "Someone", visibility: "everyone" });
    expect((await q.getReadyItem(item.everyone, as(u.stranger)))?.metadata.author).toBe("Someone");
    await q.updateItem(item.everyone, { author: null });
    expect((await q.getReadyItem(item.everyone, as(u.stranger)))?.metadata.author).toBeUndefined();
  });

  it("shows shelves and their visible item counts per person", async () => {
    const shelf = await shelves.createShelf({ name: `${tag} shelf`, ownerId: u.owner, visibility: "people" });
    await shelves.setShelfAccess(shelf.id, [u.friend]);
    for (const id of Object.values(item)) await shelves.addToShelf(shelf.id, id);
    const friendView = (await shelves.listShelves(as(u.friend, "viewer"))).find((s) => s.id === shelf.id);
    expect(friendView?.items).toBe(2); // the private item isn't counted
    expect((await shelves.listShelves(as(u.stranger))).some((s) => s.id === shelf.id)).toBe(false);
    expect(await shelves.shelvesHolding(item.private, [shelf.id])).toEqual([shelf.id]);
  });

  it("changes roles and reports storage per person", async () => {
    expect(await people.setUserRole(u.owner, "admin")).toBe(true);
    expect(await people.setUserRole(u.owner, "member")).toBe(true); // u.admin is still an admin
    const stats = await people.listUsersWithStats();
    expect(stats.find((s) => s.id === u.owner)).toMatchObject({ items: 3, bytes: 3 });
  });

  it("uses an invite at most maxUses times", async () => {
    const token = `${tag}${"x".repeat(24)}`;
    await people.createInvite({ token, role: "viewer", createdBy: u.admin, expiresAt: new Date(Date.now() + 60_000), maxUses: 2 });
    const results = await Promise.all([1, 2, 3].map(() => people.consumeInvite(token)));
    expect(results.filter(Boolean)).toHaveLength(2);
    expect(await people.usableInvite(token)).toBeUndefined();
  });
});
