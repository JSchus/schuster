/**
 * Email alias SQL against Postgres. Skipped unless TEST_DATABASE_URL points
 * at a migrated database; it only touches rows it creates.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("mail SQL (Postgres)", async () => {
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET ??= "test-secret-test-secret";
  const { db } = await import("@/lib/db");
  const { mailLog, users } = await import("@/lib/db/schema");
  const m = await import("@/lib/db/mail");
  const { eq, inArray } = await import("drizzle-orm");

  const tag = `t${randomUUID().slice(0, 8)}`;
  const u = { owner: randomUUID(), member: randomUUID(), admin: randomUUID() };
  const base = { label: null, kind: "personal" as const, memberIds: [] as string[], expiresAt: null };

  beforeAll(async () => {
    await db().insert(users).values([
      { id: u.owner, email: `${tag}-O@x.test` },
      { id: u.member, email: `${tag}-m@x.test` },
      { id: u.admin, email: `${tag}-a@x.test`, role: "admin" },
    ]);
  });
  afterAll(async () => {
    await db().delete(users).where(inArray(users.id, Object.values(u)));
  });

  it("keeps names unique and scopes aliases to owners and group members", async () => {
    const mine = await m.createAlias({ ...base, localPart: `${tag}-solo`, ownerId: u.owner });
    expect(mine).toBeDefined();
    expect(await m.createAlias({ ...base, localPart: `${tag}-solo`, ownerId: u.member })).toBeUndefined();
    const group = await m.createAlias({ ...base, localPart: `${tag}-fam`, ownerId: u.owner, kind: "group", memberIds: [u.member] });

    expect((await m.listAliases(u.owner)).map((a) => a.localPart).sort()).toEqual([`${tag}-fam`, `${tag}-solo`]);
    expect((await m.listAliases(u.member)).map((a) => a.localPart)).toEqual([`${tag}-fam`]);
    expect(await m.listAliases(u.admin)).toEqual([]);
    expect(await m.getVisibleAlias(u.member, mine!.id)).toBeUndefined();
    expect(await m.getVisibleAlias(u.member, group!.id)).toBeDefined();
    expect(await m.emailsFor([u.owner, u.member])).toEqual(expect.arrayContaining([`${tag}-o@x.test`, `${tag}-m@x.test`]));
    expect(await m.adminEmails()).toContain(`${tag}-a@x.test`);

    await m.countMessage(mine!.id, true);
    await m.countMessage(mine!.id, false);
    expect(await m.getAliasByLocal(`${tag}-solo`)).toMatchObject({ received: 1, blocked: 1 });
  });

  it("reuses one reply token per outside sender", async () => {
    const a = (await m.getAliasByLocal(`${tag}-solo`))!;
    const t1 = await m.reverseTokenFor(a.id, "bob@x.test", `${tag}aaaaaaa`);
    const t2 = await m.reverseTokenFor(a.id, "bob@x.test", `${tag}bbbbbbb`);
    expect(t2).toBe(t1);
    expect((await m.getReverse(t1))?.alias.id).toBe(a.id);
    expect(await m.getReverse(`${tag}zzzzzzz`)).toBeUndefined();
  });

  it("shows the log to the alias's people only and prunes it after 14 days", async () => {
    const a = (await m.getAliasByLocal(`${tag}-solo`))!;
    await m.addLog({ aliasId: a.id, direction: "in", fromAddr: "x@y.test", toAddr: "a", subject: "new", s3Key: "inbound/1", outcome: "delivered" });
    await db().insert(mailLog).values({ aliasId: a.id, direction: "in", fromAddr: "x", toAddr: "a", subject: "old", s3Key: null, outcome: "delivered", createdAt: new Date(Date.now() - 15 * 86_400_000) });
    const rows = await m.listLog(a.id);
    expect(rows.map((r) => r.subject)).toEqual(["new"]);
    expect(await m.getVisibleLog(u.owner, rows[0]!.id)).toBeDefined();
    expect(await m.getVisibleLog(u.admin, rows[0]!.id)).toBeUndefined();
    await m.pruneLog();
    expect((await db().select().from(mailLog).where(eq(mailLog.aliasId, a.id))).map((r) => r.subject)).toEqual(["new"]);
    await m.deleteAlias(a.id);
    expect(await db().select().from(mailLog).where(eq(mailLog.aliasId, a.id))).toEqual([]);
  });

  it("confirms reply-from addresses once, by token, before expiry", async () => {
    const r = await m.saveReplyAddress(u.member, `${tag}@gmail.test`, `${tag}-hash`, new Date(Date.now() + 3_600_000));
    expect(r.confirmedAt).toBeNull();
    expect(await m.replyEmailsFor([u.member])).toEqual([]);
    // Re-sending replaces the token; the row stays one row.
    await m.saveReplyAddress(u.member, `${tag}@gmail.test`, `${tag}-hash2`, new Date(Date.now() + 3_600_000));
    expect(await m.listReplyAddresses(u.member)).toHaveLength(1);
    expect(await m.confirmReplyAddress(`${tag}-hash`)).toBeUndefined();
    expect(await m.confirmReplyAddress(`${tag}-hash2`)).toMatchObject({ email: `${tag}@gmail.test` });
    expect(await m.confirmReplyAddress(`${tag}-hash2`)).toBeUndefined();
    expect(await m.replyEmailsFor([u.member, u.owner])).toEqual([`${tag}@gmail.test`]);
    // Saving again after confirming keeps it confirmed.
    const again = await m.saveReplyAddress(u.member, `${tag}@gmail.test`, `${tag}-hash3`, new Date(Date.now() + 3_600_000));
    expect(again.confirmedAt).not.toBeNull();
    // Expired tokens don't confirm.
    await m.saveReplyAddress(u.owner, `${tag}-old@gmail.test`, `${tag}-old`, new Date(Date.now() - 1000));
    expect(await m.confirmReplyAddress(`${tag}-old`)).toBeUndefined();
    // Only the owner can delete.
    expect(await m.deleteReplyAddress(u.owner, r.id)).toBe(false);
    expect(await m.deleteReplyAddress(u.member, r.id)).toBe(true);
  });
});
