import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/db/schema";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { setStorage } from "@/lib/storage";

type User = { id: string; role: "admin" | "member" };
const session = vi.hoisted(() => ({ current: null as null | { user: User } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const rows = vi.hoisted(() => new Map<string, MediaItem>());
vi.mock("@/lib/db/queries", () => ({
  getItemForEdit: async (id: string, user: User) => {
    const r = rows.get(id);
    return r && (user.role === "admin" || r.addedBy === user.id) ? r : undefined;
  },
  setItemCover: async (id: string, coverKey: string) => {
    rows.set(id, { ...rows.get(id)!, coverKey });
  },
}));

const { POST: start, PUT: confirm } = await import("@/app/api/items/[id]/cover/route");

const ID = "0b8f6f0e-2c4b-4c8a-9f5e-1a2b3c4d5e6f";
const ctx = { params: Promise.resolve({ id: ID }) };
const put = (body: unknown) => new Request("http://test", { method: "PUT", body: JSON.stringify(body) });
let storage: MemoryStorageAdapter;

beforeEach(() => {
  storage = new MemoryStorageAdapter();
  setStorage(storage);
  rows.clear();
  rows.set(ID, {
    id: ID,
    type: "video",
    status: "ready",
    title: "Clip",
    fileKey: `media/${ID}/clip.mp4`,
    coverKey: `covers/${ID}.jpg`,
    addedBy: "owner",
  } as MediaItem);
  storage.objects.set(`covers/${ID}.jpg`, { body: new Uint8Array(1), contentType: "image/jpeg" });
  session.current = { user: { id: "owner", role: "member" } };
});

describe("Make cover API", () => {
  it("rejects anonymous users", async () => {
    session.current = null;
    expect((await start(new Request("http://test"), ctx)).status).toBe(401);
  });

  it("hides other people's items from members, but not from admins", async () => {
    session.current = { user: { id: "someone", role: "member" } };
    expect((await start(new Request("http://test"), ctx)).status).toBe(404);
    session.current = { user: { id: "boss", role: "admin" } };
    expect((await start(new Request("http://test"), ctx)).status).toBe(200);
  });

  it("presigns a versioned key, then confirms it and removes the old cover", async () => {
    const res = await start(new Request("http://test"), ctx);
    const { key, uploadUrl, sourceUrl } = await res.json();
    expect(key).toMatch(new RegExp(`^covers/${ID}-\\d+\\.jpg$`));
    expect(uploadUrl).toContain(key);
    expect(sourceUrl).toContain(`media/${ID}/clip.mp4`);
    expect(sourceUrl).not.toContain("download=");

    storage.objects.set(key, { body: new Uint8Array(2), contentType: "image/jpeg" });
    const ok = await confirm(put({ key }), ctx);
    expect(ok.status).toBe(200);
    expect(rows.get(ID)!.coverKey).toBe(key);
    expect(storage.objects.has(`covers/${ID}.jpg`)).toBe(false);
  });

  it("refuses to confirm a cover that was never uploaded", async () => {
    const { key } = await (await start(new Request("http://test"), ctx)).json();
    expect((await confirm(put({ key }), ctx)).status).toBe(409);
    expect(rows.get(ID)!.coverKey).toBe(`covers/${ID}.jpg`);
  });

  it("refuses keys that don't belong to the item", async () => {
    storage.objects.set("media/other/file.jpg", { body: new Uint8Array(1), contentType: "image/jpeg" });
    expect((await confirm(put({ key: "media/other/file.jpg" }), ctx)).status).toBe(400);
    expect((await confirm(put({ key: `covers/${ID}.jpg` }), ctx)).status).toBe(400);
  });
});
