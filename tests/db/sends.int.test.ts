/** "Shared with me" and send counts against Postgres. Skipped without TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("file sends SQL (Postgres)", async () => {
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET ??= "test-secret-test-secret";
  const { db } = await import("@/lib/db");
  const { mediaItems, users } = await import("@/lib/db/schema");
  const q = await import("@/lib/db/queries");
  const s = await import("@/lib/db/sends");
  const { inArray } = await import("drizzle-orm");

  const tag = `t${randomUUID().slice(0, 8)}`;
  const u = { owner: randomUUID(), mom: randomUUID() };
  const item = { a: randomUUID(), b: randomUUID() };
  const mom = { id: u.mom, role: "member" as const };

  beforeAll(async () => {
    await db().insert(users).values([
      { id: u.owner, email: `${tag}-o@x.test`, name: "John Schuster" },
      { id: u.mom, email: `${tag}-m@x.test` },
    ]);
    await db().insert(mediaItems).values(
      Object.entries(item).map(([k, id]) => ({
        id,
        status: "ready" as const,
        type: "file" as const,
        title: `${tag} ${k}`,
        fileKey: `media/${id}/f`,
        size: 1,
        mime: "text/plain",
        addedBy: u.owner,
        visibility: "people" as const,
      })),
    );
    await q.setItemAccess(item.a, [u.mom]);
    await q.setItemAccess(item.b, [u.mom]);
  });
  afterAll(async () => {
    await db().delete(mediaItems).where(inArray(mediaItems.id, Object.values(item)));
    await db().delete(users).where(inArray(users.id, Object.values(u)));
  });

  it("lists the newest send per file, only while the file is still visible", async () => {
    const row = (itemId: string, note: string) => ({ itemId, fromUser: u.owner, toUser: u.mom, toEmail: null, note, shareToken: null });
    await s.addSends([row(item.a, "first")]);
    await s.addSends([row(item.b, "b")]);
    await s.addSends([row(item.a, "again")]);
    const list = await s.sharedWithMe(mom);
    expect(list.map((r) => [r.item.title, r.note])).toEqual([
      [`${tag} a`, "again"],
      [`${tag} b`, "b"],
    ]);
    expect(list[0]!.fromName).toBe("John Schuster");
    await q.setItemAccess(item.b, []);
    expect((await s.sharedWithMe(mom)).map((r) => r.item.id)).toEqual([item.a]);
    expect(await s.countSendsSince(u.owner, new Date(Date.now() - 60_000))).toBe(3);
    expect(await s.countSendsSince(u.mom, new Date(Date.now() - 60_000))).toBe(0);
  });

  it("counts how often each outside address was emailed, most first", async () => {
    const row = (toEmail: string) => ({ itemId: item.a, fromUser: u.owner, toUser: null, toEmail, note: null, shareToken: null });
    await s.addSends([row(`${tag}-a@x.test`), row(`${tag}-b@x.test`), row(`${tag}-b@x.test`)]);
    const counts = await s.sendCountsByEmail(u.owner);
    expect(counts.map((c) => [c.email, c.count])).toEqual([
      [`${tag}-b@x.test`, 2],
      [`${tag}-a@x.test`, 1],
    ]);
    expect(counts[0]!.last).toBeInstanceOf(Date);
    expect(await s.sendCountsByEmail(u.mom)).toEqual([]);
  });
});
