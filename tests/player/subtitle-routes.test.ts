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
  getReadyItem: async (id: string) => rows.get(id),
  setSubtitles: async (id: string, subtitles: MediaItem["metadata"]["subtitles"]) => {
    const r = rows.get(id)!;
    rows.set(id, { ...r, metadata: { ...r.metadata, subtitles } });
  },
}));

const subs = await import("@/app/api/items/[id]/subtitles/route");
const stream = await import("@/app/api/items/[id]/stream/route");

const VID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOOK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ctx = (id = VID) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body: unknown) => new Request("http://test", { method, body: JSON.stringify(body) });
let storage: MemoryStorageAdapter;

async function addTrack(lang: string, label: string) {
  const { key } = await (await subs.POST(req("POST", { lang, label }), ctx())).json();
  storage.objects.set(key, { body: new Uint8Array(3), contentType: "text/vtt" });
  const res = await subs.PUT(req("PUT", { key, lang, label }), ctx());
  return { key, res };
}

beforeEach(() => {
  storage = new MemoryStorageAdapter();
  setStorage(storage);
  rows.clear();
  const base = { status: "ready", addedBy: "owner", metadata: {} } as MediaItem;
  rows.set(VID, { ...base, id: VID, type: "video", mime: "video/mp4", fileKey: `media/${VID}/m.mp4` });
  rows.set(BOOK, { ...base, id: BOOK, type: "book", mime: "application/pdf", fileKey: `media/${BOOK}/b.pdf` });
  session.current = { user: { id: "owner", role: "member" } };
});

describe("subtitles API", () => {
  it("requires a session and edit rights on a video", async () => {
    session.current = null;
    expect((await subs.POST(req("POST", { lang: "en", label: "English" }), ctx())).status).toBe(401);
    session.current = { user: { id: "someone", role: "member" } };
    expect((await subs.POST(req("POST", { lang: "en", label: "English" }), ctx())).status).toBe(404);
    session.current = { user: { id: "owner", role: "member" } };
    expect((await subs.POST(req("POST", { lang: "en", label: "English" }), ctx(BOOK))).status).toBe(404);
  });

  it("validates the language", async () => {
    expect((await subs.POST(req("POST", { lang: "english!", label: "x" }), ctx())).status).toBe(400);
  });

  it("adds tracks, and re-adding a language replaces the old file", async () => {
    const en1 = await addTrack("EN", "English");
    expect(en1.res.status).toBe(200);
    await addTrack("es", "Español");
    const en2 = await addTrack("en", "English (SDH)");
    const list = rows.get(VID)!.metadata.subtitles!;
    expect(list.map((t) => `${t.lang}:${t.label}`)).toEqual(["es:Español", "en:English (SDH)"]);
    expect(storage.objects.has(en1.key)).toBe(false);
    expect(storage.objects.has(en2.key)).toBe(true);
  });

  it("rejects foreign, mismatched or missing files", async () => {
    storage.objects.set("media/x/evil.vtt", { body: new Uint8Array(1), contentType: "text/vtt" });
    expect((await subs.PUT(req("PUT", { key: "media/x/evil.vtt", lang: "en", label: "E" }), ctx())).status).toBe(400);
    const { key } = await (await subs.POST(req("POST", { lang: "en", label: "E" }), ctx())).json();
    expect((await subs.PUT(req("PUT", { key, lang: "fr", label: "F" }), ctx())).status).toBe(400);
    expect((await subs.PUT(req("PUT", { key, lang: "en", label: "E" }), ctx())).status).toBe(409);
  });

  it("deletes a track and its file", async () => {
    const { key } = await addTrack("en", "English");
    const res = await subs.DELETE(req("DELETE", { lang: "en" }), ctx());
    expect(res.status).toBe(200);
    expect(rows.get(VID)!.metadata.subtitles).toEqual([]);
    expect(storage.objects.has(key)).toBe(false);
    expect((await subs.DELETE(req("DELETE", { lang: "en" }), ctx())).status).toBe(404);
  });
});

describe("stream API", () => {
  it("returns fresh URLs for the video and its tracks", async () => {
    await addTrack("en", "English");
    session.current = { user: { id: "viewer", role: "member" } };
    const body = await (await stream.GET(new Request("http://test"), ctx())).json();
    expect(body.src).toContain(`media/${VID}/m.mp4`);
    expect(body.subtitles).toHaveLength(1);
    expect(body.subtitles[0].src).toContain(`subs/${VID}/en-`);
  });

  it("404s for non-playable items", async () => {
    expect((await stream.GET(new Request("http://test"), ctx(BOOK))).status).toBe(404);
  });
});
