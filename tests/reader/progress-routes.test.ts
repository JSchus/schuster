import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/db/schema";

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

type Row = { position: string; percent: number; updatedAt: Date };
const items = vi.hoisted(() => new Map<string, MediaItem>());
const progress = vi.hoisted(() => new Map<string, Row>());
vi.mock("@/lib/db/queries", () => ({
  getReadyItem: async (id: string) => {
    const i = items.get(id);
    return i?.status === "ready" ? i : undefined;
  },
  getProgress: async (u: string, i: string) => progress.get(`${u}:${i}`),
  // Mirrors the SQL: only overwrite when the incoming write is newer.
  upsertProgress: async (u: string, i: string, v: { position: string; percent: number; at: Date }) => {
    const key = `${u}:${i}`;
    const cur = progress.get(key);
    if (!cur || v.at > cur.updatedAt) progress.set(key, { position: v.position, percent: v.percent, updatedAt: v.at });
    return progress.get(key)!;
  },
}));

const { GET, PUT, POST } = await import("@/app/api/progress/[itemId]/route");

const BOOK = "11111111-1111-4111-8111-111111111111";
const PDF = "22222222-2222-4222-8222-222222222222";
const VIDEO = "33333333-3333-4333-8333-333333333333";
const PENDING = "44444444-4444-4444-8444-444444444444";
const ctx = (itemId: string) => ({ params: Promise.resolve({ itemId }) });
const req = (method: string, body?: unknown, raw?: string) =>
  new Request("http://test", { method, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });

beforeEach(() => {
  items.clear();
  progress.clear();
  const base = { status: "ready", type: "book" } as MediaItem;
  items.set(BOOK, { ...base, id: BOOK, mime: "application/epub+zip" });
  items.set(PDF, { ...base, id: PDF, mime: "application/pdf" });
  items.set(VIDEO, { ...base, id: VIDEO, type: "video", mime: "video/mp4" });
  items.set(PENDING, { ...base, id: PENDING, status: "pending", mime: "application/pdf" });
  session.current = { user: { id: "u1", role: "member" } };
});

describe("progress API", () => {
  it("requires a session", async () => {
    session.current = null;
    expect((await GET(req("GET"), ctx(BOOK))).status).toBe(401);
  });

  it("404s for missing, pending, non-book and malformed ids", async () => {
    for (const id of [VIDEO, PENDING, "55555555-5555-4555-8555-555555555555", "nope"]) {
      expect((await GET(req("GET"), ctx(id))).status).toBe(404);
    }
  });

  it("returns null before any reading, then round-trips a save", async () => {
    expect(await (await GET(req("GET"), ctx(BOOK))).json()).toBeNull();
    const at = Date.now() - 1000;
    const res = await PUT(req("PUT", { position: "epubcfi(/6/8!/4/2)", percent: 47.4, at }), ctx(BOOK));
    expect(res.status).toBe(200);
    expect(await (await GET(req("GET"), ctx(BOOK))).json()).toEqual({
      position: "epubcfi(/6/8!/4/2)",
      percent: 47,
      updatedAt: at,
    });
  });

  it("ignores a stale write from a device that was offline", async () => {
    const now = Date.now();
    await PUT(req("PUT", { position: "page:40", percent: 40, at: now - 1000 }), ctx(PDF));
    const stale = await PUT(req("PUT", { position: "page:5", percent: 5, at: now - 60_000 }), ctx(PDF));
    expect((await stale.json()).position).toBe("page:40");
  });

  it("clamps future timestamps to now", async () => {
    const res = await PUT(req("PUT", { position: "page:2", percent: 2, at: Date.now() + 3_600_000 }), ctx(PDF));
    expect((await res.json()).updatedAt).toBeLessThanOrEqual(Date.now());
  });

  it("accepts sendBeacon-style POSTs with a text/plain JSON body", async () => {
    const body = JSON.stringify({ position: "page:3", percent: 30, at: Date.now() });
    const res = await POST(new Request("http://test", { method: "POST", body, headers: { "Content-Type": "text/plain" } }), ctx(PDF));
    expect(res.status).toBe(200);
    expect(progress.get(`u1:${PDF}`)?.position).toBe("page:3");
  });

  it("rejects bad bodies", async () => {
    expect((await PUT(req("PUT", undefined, "{oops"), ctx(BOOK))).status).toBe(400);
    expect((await PUT(req("PUT", { position: "", percent: 5, at: Date.now() }), ctx(BOOK))).status).toBe(400);
    expect((await PUT(req("PUT", { position: "x", percent: 120, at: Date.now() }), ctx(BOOK))).status).toBe(400);
    expect((await PUT(req("PUT", { position: "x", percent: 5, at: Date.now() - 40 * 86_400_000 }), ctx(BOOK))).status).toBe(400);
  });

  it("keeps each user's progress separate", async () => {
    await PUT(req("PUT", { position: "page:9", percent: 90, at: Date.now() }), ctx(PDF));
    session.current = { user: { id: "u2", role: "member" } };
    expect(await (await GET(req("GET"), ctx(PDF))).json()).toBeNull();
  });
});
