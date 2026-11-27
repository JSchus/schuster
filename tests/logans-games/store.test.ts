import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GamePurchase } from "@/lib/db/schema";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test@localhost/test";
  process.env.AUTH_SECRET ??= "test-secret-test-secret";
});

vi.mock("@/auth", () => ({ auth: async () => null }));

const db = vi.hoisted(() => ({ rows: new Map<string, GamePurchase>() }));
vi.mock("@/lib/db/game-store", () => ({
  addPurchase: async (r: GamePurchase) => void db.rows.set(r.id, { ...r, grantedAt: null, createdAt: new Date() }),
  getPurchase: async (id: string) => db.rows.get(id),
  markGranted: async (id: string) => {
    const r = db.rows.get(id);
    if (!r || r.grantedAt) return false;
    r.grantedAt = new Date();
    return true;
  },
  grantedOffers: async (device: string) => [...db.rows.values()].filter((r) => r.deviceId === device && r.grantedAt).map((r) => r.offer),
  recentCheckouts: async (device: string, since: Date) => [...db.rows.values()].filter((r) => r.deviceId === device && r.createdAt > since).length,
}));

const { setStripe } = await import("@/lib/logans-games/stripe");
const store = await import("@/lib/logans-games/store");
const offers = await import("@/app/api/logans-games/offers/route");
const checkout = await import("@/app/api/logans-games/checkout/route");
const claim = await import("@/app/api/logans-games/claim/route");
const { authConfig } = await import("@/auth.config");

const DEVICE = "0b8f6f0e-2c4b-4c8a-9f5e-1a2b3c4d5e6f";
const OTHER = "1b8f6f0e-2c4b-4c8a-9f5e-1a2b3c4d5e6f";
const post = (url: string, body: unknown) => new Request(`https://schuster.me${url}`, { method: "POST", body: JSON.stringify(body) });

type Session = { id: string; paid: boolean; cents: number; metadata: Record<string, string> };
let sessions: Map<string, Session>;
let created: Parameters<NonNullable<ReturnType<typeof import("@/lib/logans-games/stripe").getStripe>>["createCheckout"]>[0][];
function openStore() {
  sessions = new Map();
  created = [];
  setStripe({
    async createCheckout(input) {
      created.push(input);
      const id = `cs_test_${created.length}abcdefgh`;
      sessions.set(id, { id, paid: false, cents: input.cents, metadata: input.metadata });
      return { id, url: `https://checkout.stripe.com/c/pay/${id}` };
    },
    async getCheckout(id) {
      return sessions.get(id)!;
    },
  });
}
const THURSDAY = new Date("2026-11-26T18:00:00Z");
const SATURDAY = new Date("2026-11-28T18:00:00Z");

beforeEach(() => {
  db.rows.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(THURSDAY);
  openStore();
});
afterEach(() => {
  vi.useRealTimers();
  setStripe(undefined);
});

describe("Monster Packs deals", () => {
  it("has the 4 deals with server-side prices; the every-tier bundle is $9.99 for 1 pack of each of the 11 tiers", () => {
    const every = store.offer("every-tier")!;
    expect(store.price(every.cents)).toBe("$9.99");
    expect(Object.values(every.grant.packs)).toEqual(Array(11).fill(1));
    expect(store.OFFER_IDS).toEqual(["every-tier", "starter", "daily", "weekend"]);
    expect(store.offersNow(THURSDAY).map((o) => o.id)).toEqual(["every-tier", "starter", "daily"]);
    expect(store.offersNow(SATURDAY).map((o) => o.id)).toEqual(["every-tier", "starter", "daily", "weekend"]);
    const tiers = new Set(Array.from({ length: 30 }, (_, d) => store.dailyTier(new Date(Date.UTC(2026, 10, d + 1, 18)))));
    for (const t of tiers) expect(t >= 4 && t <= 9).toBe(true);
    expect(tiers.size).toBeGreaterThan(2); // changes from day to day
    expect(store.dailyTier(new Date("2026-11-26T08:00:00Z"))).toBe(store.dailyTier(new Date("2026-11-27T04:00:00Z"))); // same Chicago day
  });

  it("shows 'opening soon' and sells nothing until a Stripe key is set", async () => {
    setStripe(null);
    expect(await (await offers.GET(new Request(`https://schuster.me/api/logans-games/offers?device=${DEVICE}`))).json()).toMatchObject({ open: false });
    expect((await checkout.POST(post("/api/logans-games/checkout", { offer: "every-tier", device: DEVICE }))).status).toBe(503);
    expect((await claim.POST(post("/api/logans-games/claim", { session: "cs_test_1abcdefgh", device: DEVICE }))).status).toBe(503);
  });

  it("starts checkout at the server's price, whatever the browser sends", async () => {
    const res = await checkout.POST(post("/api/logans-games/checkout", { offer: "every-tier", device: DEVICE, cents: 1 }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ url: expect.stringMatching(/^https:\/\/checkout\.stripe\.com\//) });
    expect(created[0]).toMatchObject({ cents: 999, metadata: { offer: "every-tier", device: DEVICE } });
    expect(created[0]!.successUrl).toBe("https://schuster.me/logans-games/monster-packs?paid={CHECKOUT_SESSION_ID}");
    expect(db.rows.get("cs_test_1abcdefgh")).toMatchObject({ cents: 999, deviceId: DEVICE, grantedAt: null });
  });

  it("refuses unknown deals, the weekend deal on weekdays, bad devices and runaway clicking", async () => {
    expect((await checkout.POST(post("/api/logans-games/checkout", { offer: "free-stuff", device: DEVICE }))).status).toBe(404);
    expect((await checkout.POST(post("/api/logans-games/checkout", { offer: "weekend", device: DEVICE }))).status).toBe(400);
    expect((await checkout.POST(post("/api/logans-games/checkout", { offer: "daily", device: "nope" }))).status).toBe(400);
    vi.setSystemTime(SATURDAY);
    expect((await checkout.POST(post("/api/logans-games/checkout", { offer: "weekend", device: DEVICE }))).status).toBe(201);
    for (let i = 0; i < 19; i++) await checkout.POST(post("/api/logans-games/checkout", { offer: "daily", device: DEVICE }));
    expect((await checkout.POST(post("/api/logans-games/checkout", { offer: "daily", device: DEVICE }))).status).toBe(429);
  });

  it("only hands out packs once Stripe says it's paid in full, to the device that bought it, once", async () => {
    await checkout.POST(post("/api/logans-games/checkout", { offer: "starter", device: DEVICE }));
    const id = "cs_test_1abcdefgh";
    const ask = (device = DEVICE) => claim.POST(post("/api/logans-games/claim", { session: id, device }));
    expect((await ask()).status).toBe(402); // not paid yet
    sessions.get(id)!.paid = true;
    expect((await ask(OTHER)).status).toBe(404); // another device
    const first = await ask();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ offer: "starter", grant: { packs: { "1": 3, "2": 2 }, coins: 2000 }, already: false });
    expect(await (await ask()).json()).toMatchObject({ already: true }); // asking again doesn't give more
    // Once-only deal: can't start it again on this device, and it shows as got.
    expect((await checkout.POST(post("/api/logans-games/checkout", { offer: "starter", device: DEVICE }))).status).toBe(409);
    const list = await (await offers.GET(new Request(`https://schuster.me/api/logans-games/offers?device=${DEVICE}`))).json();
    expect(list.offers.find((o: { id: string }) => o.id === "starter")).toMatchObject({ soldOut: true, price: "$1.99" });
  });

  it("refuses a payment that doesn't match the deal", async () => {
    await checkout.POST(post("/api/logans-games/checkout", { offer: "every-tier", device: DEVICE }));
    Object.assign(sessions.get("cs_test_1abcdefgh")!, { paid: true, cents: 99 });
    expect((await claim.POST(post("/api/logans-games/claim", { session: "cs_test_1abcdefgh", device: DEVICE }))).status).toBe(409);
    expect((await claim.POST(post("/api/logans-games/claim", { session: "not-a-session", device: DEVICE }))).status).toBe(400);
  });

  it("keeps the store routes and terms public, and the rest of the API private", () => {
    const authorized = authConfig.callbacks.authorized as (a: { auth: unknown; request: { nextUrl: URL } }) => unknown;
    const visit = (path: string) => authorized({ auth: null, request: { nextUrl: new URL(`https://schuster.me${path}`) } });
    for (const p of ["/logans-games/terms", "/api/logans-games/offers", "/api/logans-games/checkout", "/api/logans-games/claim"]) expect(visit(p)).toBe(true);
    // Private API paths get a 401 instead of `true`.
    expect(visit("/api/logans-games/other")).not.toBe(true);
    expect(visit("/api/items")).not.toBe(true);
  });
});
