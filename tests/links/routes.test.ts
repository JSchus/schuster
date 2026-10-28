import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ShortLink } from "@/lib/db/schema";
import type { Viewer } from "@/lib/permissions";

const session = vi.hoisted(() => ({ current: null as null | { user: Viewer } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const rows = vi.hoisted(() => new Map<string, ShortLink>());
vi.mock("@/lib/db/links", () => ({
  createLink: async (v: ShortLink) => {
    if (rows.has(v.slug)) return undefined;
    const row = { ...v, clicks: 0, lastClickedAt: null, disabledAt: null, createdAt: new Date() } as ShortLink;
    rows.set(v.slug, row);
    return row;
  },
  listLinks: async (u: Viewer) => [...rows.values()].filter((r) => u.role === "admin" || r.ownerId === u.id).map((r) => ({ ...r, ownerName: null })),
  getLink: async (slug: string) => rows.get(slug),
  updateLink: async (slug: string, patch: Partial<ShortLink>) => void rows.set(slug, { ...rows.get(slug)!, ...patch }),
  deleteLink: async (slug: string) => void rows.delete(slug),
}));

const list = await import("@/app/api/links/route");
const one = await import("@/app/api/links/[slug]/route");

const req = (method: string, body?: unknown) =>
  new Request("https://schuster.me/api/links", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const as = (id: string, role: Viewer["role"]) => (session.current = { user: { id, role } });

beforeEach(() => {
  rows.clear();
  as("mom", "member");
});

describe("short links API", () => {
  it("makes a link with a chosen word, and refuses a taken one", async () => {
    const res = await list.POST(req("POST", { target: "example.com/tickets", slug: "My Recital" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ slug: "my-recital", target: "https://example.com/tickets", hasPassword: false, expiresAt: null });
    const again = await list.POST(req("POST", { target: "https://example.com", slug: "my-recital" }));
    expect(again.status).toBe(409);
  });

  it("picks a random word, stores passwords hashed, and sets expiry", async () => {
    const res = await list.POST(req("POST", { target: "https://example.com", days: 7, password: "secret!" }));
    const body = await res.json();
    expect(body.slug).toMatch(/^[a-z2-9]{6}$/);
    expect(body.hasPassword).toBe(true);
    expect(rows.get(body.slug)!.passwordHash).toMatch(/^scrypt\$/);
    expect(body.expiresAt).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
  });

  it("refuses bad destinations and words", async () => {
    expect((await list.POST(req("POST", { target: "javascript:alert(1)" }))).status).toBe(400);
    expect((await list.POST(req("POST", { target: "https://schuster.me/go/x" }))).status).toBe(400);
    expect((await list.POST(req("POST", { target: "https://example.com", slug: "!" }))).status).toBe(400);
  });

  it("is for members and admins; viewers get 403", async () => {
    as("kid", "viewer");
    expect((await list.POST(req("POST", { target: "https://example.com" }))).status).toBe(403);
    expect((await list.GET()).status).toBe(403);
  });

  it("lets only the owner or an admin change or delete a link", async () => {
    await list.POST(req("POST", { target: "https://example.com", slug: "mine" }));
    as("dad", "member");
    expect((await one.PATCH(req("PATCH", { disabled: true }), ctx("mine"))).status).toBe(404);
    expect((await one.DELETE(req("DELETE"), ctx("mine"))).status).toBe(404);
    expect(await (await list.GET()).json()).toEqual([]);
    as("boss", "admin");
    expect((await one.PATCH(req("PATCH", { disabled: true, target: "example.org" }), ctx("mine"))).status).toBe(200);
    expect(rows.get("mine")).toMatchObject({ targetUrl: "https://example.org/" });
    expect(rows.get("mine")!.disabledAt).toBeInstanceOf(Date);
    expect((await one.DELETE(req("DELETE"), ctx("mine"))).status).toBe(204);
  });
});
