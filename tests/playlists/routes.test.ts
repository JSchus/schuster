import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, Playlist, Share } from "@/lib/db/schema";
import { canView, type Viewer } from "@/lib/permissions";

/* ---- mocks: session + in-memory tables ---- */

const session = vi.hoisted(() => ({ current: null as null | { user: Viewer } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const db = vi.hoisted(() => ({
  items: new Map<string, MediaItem>(),
  playlists: new Map<string, Playlist>(),
  tracks: new Map<string, string[]>(),
  shares: new Map<string, Share>(),
}));

const visible = (r: MediaItem, user: Viewer) => canView(user, { ownerId: r.addedBy, visibility: r.visibility }, false);

vi.mock("@/lib/db/queries", () => ({
  getReadyItem: async (id: string, user: Viewer) => {
    const r = db.items.get(id);
    return r && visible(r, user) ? r : undefined;
  },
  listItems: async (user: Viewer) => [...db.items.values()].filter((r) => r.type === "audio" && visible(r, user)),
}));

vi.mock("@/lib/db/people", () => ({ listPeople: async () => [] }));

vi.mock("@/lib/db/playlists", () => ({
  getPlaylist: async (id: string, user: Viewer) => {
    const p = db.playlists.get(id);
    return p && canView(user, { ownerId: p.ownerId, visibility: p.visibility }, false) ? { ...p, ownerName: null } : undefined;
  },
  createPlaylist: async (v: Playlist) => {
    const p = { ...v, id: "99999999-9999-4999-8999-999999999999" } as Playlist;
    db.playlists.set(p.id, p);
    db.tracks.set(p.id, []);
    return p;
  },
  setPlaylistAccess: async () => {},
  updatePlaylist: async (id: string, patch: Partial<Playlist>) => void db.playlists.set(id, { ...db.playlists.get(id)!, ...patch }),
  deletePlaylist: async (id: string) => void db.playlists.delete(id),
  addTrack: async (id: string, itemId: string) => {
    const t = db.tracks.get(id)!;
    if (!t.includes(itemId)) t.push(itemId);
  },
  removeTrack: async (id: string, itemId: string) => void db.tracks.set(id, db.tracks.get(id)!.filter((x) => x !== itemId)),
  allTrackIds: async (id: string) => [...db.tracks.get(id)!],
  reorderTracks: async (id: string, ids: string[]) => void db.tracks.set(id, ids),
  playlistTracksFor: async (id: string, user: Viewer) =>
    db.tracks.get(id)!.map((i) => db.items.get(i)!).filter((r) => visible(r, user)),
}));

vi.mock("@/lib/db/shares", () => ({
  createShare: async (v: Share) => {
    const s = { ...v, itemId: v.itemId ?? null, playlistId: v.playlistId ?? null, views: 0, revokedAt: null } as Share;
    db.shares.set(s.token, s);
    return s;
  },
  activeSharesForPlaylist: async (id: string) => [...db.shares.values()].filter((s) => s.playlistId === id),
  getShare: async (t: string) => db.shares.get(t),
  revokeShare: async (t: string) => void (db.shares.get(t)!.revokedAt = new Date()),
}));

const { MemoryStorageAdapter } = await import("@/lib/storage/memory");
const { setStorage } = await import("@/lib/storage");
const create = await import("@/app/api/playlists/route");
const one = await import("@/app/api/playlists/[id]/route");
const tracks = await import("@/app/api/playlists/[id]/tracks/route");
const urls = await import("@/app/api/playlists/[id]/urls/route");
const shares = await import("@/app/api/playlists/[id]/shares/route");
const share = await import("@/app/api/shares/[token]/route");

const PL = "11111111-1111-4111-8111-111111111111";
const SONG = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const VIEWER = "vvvvvvvv-vvvv-4vvv-8vvv-vvvvvvvvvvvv".replace(/v/g, "a");
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (method: string, body?: unknown) =>
  new Request("http://test", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const as = (id: string, role: Viewer["role"]) => (session.current = { user: { id, role } });

beforeEach(() => {
  for (const m of Object.values(db)) m.clear();
  setStorage(new MemoryStorageAdapter());
  const item = (n: number, extra: Partial<MediaItem> = {}) =>
    ({ id: SONG(n), status: "ready", type: "audio", title: `Song ${n}`, fileKey: `media/${SONG(n)}/s.mp3`, addedBy: "owner", visibility: "everyone", metadata: {}, ...extra }) as unknown as MediaItem;
  db.items.set(SONG(1), item(1));
  db.items.set(SONG(2), item(2));
  db.items.set(SONG(3), item(3, { visibility: "private" }));
  db.items.set(SONG(4), item(4, { type: "video" }));
  db.playlists.set(PL, { id: PL, name: "Road trip", ownerId: VIEWER, visibility: "everyone" } as Playlist);
  db.tracks.set(PL, [SONG(1), SONG(2)]);
  as(VIEWER, "viewer");
});

describe("playlists", () => {
  it("can be made and edited by viewers (their own)", async () => {
    expect((await create.POST(req("POST", { name: "Mine" }))).status).toBe(201);
    expect((await one.PATCH(req("PATCH", { name: "Renamed" }), ctx(PL))).status).toBe(200);
    expect(db.playlists.get(PL)!.name).toBe("Renamed");
  });

  it("can't be changed by someone else (unless admin)", async () => {
    as("someone", "member");
    expect((await one.PATCH(req("PATCH", { name: "x" }), ctx(PL))).status).toBe(404);
    expect((await tracks.POST(req("POST", { itemId: SONG(1) }), ctx(PL))).status).toBe(404);
    as("boss", "admin");
    expect((await one.DELETE(req("DELETE"), ctx(PL))).status).toBe(204);
  });

  it("only takes audio the editor can see", async () => {
    expect((await tracks.POST(req("POST", { itemId: SONG(3) }), ctx(PL))).status).toBe(404); // private, not theirs
    expect((await tracks.POST(req("POST", { itemId: SONG(4) }), ctx(PL))).status).toBe(400); // a video
    db.tracks.set(PL, [SONG(1)]);
    expect((await tracks.POST(req("POST", { itemId: SONG(2) }), ctx(PL))).status).toBe(200);
    expect(db.tracks.get(PL)).toEqual([SONG(1), SONG(2)]);
  });

  it("reorders only with a permutation, keeping songs the editor can't see at the end", async () => {
    db.tracks.set(PL, [SONG(1), SONG(3), SONG(2)]); // 3 is private to its uploader
    expect((await tracks.PUT(req("PUT", { itemIds: [SONG(2), SONG(1)] }), ctx(PL))).status).toBe(200);
    expect(db.tracks.get(PL)).toEqual([SONG(2), SONG(1), SONG(3)]);
    expect((await tracks.PUT(req("PUT", { itemIds: [SONG(2), SONG(2)] }), ctx(PL))).status).toBe(400);
    expect((await tracks.PUT(req("PUT", { itemIds: [SONG(4)] }), ctx(PL))).status).toBe(400);
  });

  it("signs fresh URLs only for songs the listener may hear", async () => {
    db.tracks.set(PL, [SONG(1), SONG(3)]);
    as("listener", "viewer");
    const body = await (await urls.GET(req("GET"), ctx(PL))).json();
    expect(Object.keys(body)).toEqual([SONG(1)]);
  });

  it("public links: members/admins who can edit it; viewers can't share outside the family", async () => {
    expect((await shares.POST(req("POST", { days: 7 }), ctx(PL))).status).toBe(403);
    db.playlists.get(PL)!.ownerId = "mem";
    as("mem", "member");
    const res = await shares.POST(req("POST", { days: 7, password: "sing along" }), ctx(PL));
    expect(res.status).toBe(201);
    const { token, hasPassword } = await res.json();
    expect(hasPassword).toBe(true);
    expect(db.shares.get(token)).toMatchObject({ playlistId: PL, itemId: null });
    as("other", "member");
    expect((await share.DELETE(req("DELETE"), { params: Promise.resolve({ token }) })).status).toBe(404);
    as("mem", "member");
    expect((await share.DELETE(req("DELETE"), { params: Promise.resolve({ token }) })).status).toBe(204);
  });
});
