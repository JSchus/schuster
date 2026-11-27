/** Monster Packs purchases against Postgres. Skipped without TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("game purchases SQL (Postgres)", async () => {
  process.env.DATABASE_URL = url;
  process.env.AUTH_SECRET ??= "test-secret-test-secret";
  const { db } = await import("@/lib/db");
  const { gamePurchases } = await import("@/lib/db/schema");
  const g = await import("@/lib/db/game-store");
  const { like } = await import("drizzle-orm");
  const tag = `cs_test_${randomUUID().slice(0, 8)}`;
  const device = randomUUID();

  afterAll(async () => {
    await db().delete(gamePurchases).where(like(gamePurchases.id, `${tag}%`));
  });

  it("hands each payment out only once, and remembers once-only deals per device", async () => {
    await g.addPurchase({ id: `${tag}a`, offer: "starter", cents: 199, grant: { packs: { "1": 3 }, coins: 2000 }, deviceId: device });
    expect(await g.getPurchase(`${tag}a`)).toMatchObject({ offer: "starter", grant: { packs: { "1": 3 }, coins: 2000 }, grantedAt: null });
    expect(await g.grantedOffers(device)).toEqual([]);
    const [a, b] = await Promise.all([g.markGranted(`${tag}a`), g.markGranted(`${tag}a`)]);
    expect([a, b].filter(Boolean)).toHaveLength(1); // even if asked twice at the same moment
    expect(await g.grantedOffers(device)).toEqual(["starter"]);
    expect(await g.recentCheckouts(device, new Date(Date.now() - 60_000))).toBe(1);
    expect(await g.markGranted(`${tag}missing`)).toBe(false);
  });
});
