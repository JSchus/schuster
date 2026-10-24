import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Invite, MediaItem, Share } from "@/lib/db/schema";
import { canEdit, canView, type Viewer } from "@/lib/permissions";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { setStorage } from "@/lib/storage";

/* ---- mocks: session + in-memory tables ---- */

const session = vi.hoisted(() => ({ current: null as null | { user: Viewer } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const db = vi.hoisted(() => ({
  items: new Map<string, MediaItem>(),
  access: new Map<string, string[]>(),
  users: new Map<string, { id: string; email: string; role: string }>(),
  approved: new Map<string, string>(),
  invites: new Map<string, Invite>(),
  shares: new Map<string, Share>(),
}));

vi.mock("@/lib/db/queries", () => ({
  getItemForEdit: async (id: string, user: Viewer) => {
    const r = db.items.get(id);
    return r && canEdit(user, r.addedBy) ? r : undefined;
  },
  getReadyItem: async (id: string, user: Viewer) => {
    const r = db.items.get(id);
    return r && canView(user, { ownerId: r.addedBy, visibility: r.visibility }, !!db.access.get(id)?.includes(user.id)) ? r : undefined;
  },
  updateItem: async (id: string, patch: Partial<MediaItem>) => void db.items.set(id, { ...db.items.get(id)!, ...patch }),
  setItemAccess: async (id: string, ids: string[]) => void db.access.set(id, ids),
  deleteItem: async (id: string) => void db.items.delete(id),
  getItemAnyStatus: async (id: string) => db.items.get(id),
}));

vi.mock("@/lib/db/people", () => ({
  listPeople: async () => [...db.users.values()].map((u) => ({ id: u.id, name: null, email: u.email })),
  approveEmail: async (email: string, role: string) => void db.approved.set(email, role),
  isApproved: async (email: string) => db.approved.has(email),
  usableInvite: async (token: string) =>
    [...db.invites.values()].find((i) => i.token === token && !i.revokedAt && i.expiresAt > new Date() && i.uses < i.maxUses),
  consumeInvite: async (token: string) => {
    const i = [...db.invites.values()].find((x) => x.token === token);
    if (!i || i.revokedAt || i.expiresAt < new Date() || i.uses >= i.maxUses) return undefined;
    i.uses++;
    return { id: i.id, role: i.role };
  },
  createInvite: async (v: Invite) => v,
  setUserRole: async (id: string, role: string) => {
    const admins = [...db.users.values()].filter((u) => u.role === "admin" && u.id !== id);
    if (role !== "admin" && !admins.length) return false;
    db.users.get(id)!.role = role;
    return true;
  },
  deleteUser: async (id: string) => db.users.delete(id),
  removeApproval: async (email: string) => void db.approved.delete(email),
}));

vi.mock("@/lib/auth/roles", () => ({
  findUserByEmail: async (email: string) => [...db.users.values()].find((u) => u.email === email),
}));

vi.mock("@/lib/db/shares", () => ({
  createShare: async (v: Share) => {
    const s = { ...v, views: 0, revokedAt: null, createdAt: new Date() } as Share;
    db.shares.set(s.token, s);
    return s;
  },
  activeSharesForItem: async (itemId: string) => [...db.shares.values()].filter((s) => s.itemId === itemId && !s.revokedAt),
  getShare: async (token: string) => db.shares.get(token),
  revokeShare: async (token: string) => void (db.shares.get(token)!.revokedAt = new Date()),
}));

const item = await import("@/app/api/items/[id]/route");
const itemShares = await import("@/app/api/items/[id]/shares/route");
const share = await import("@/app/api/shares/[token]/route");
const invite = await import("@/app/api/invites/[token]/route");
const adminUsers = await import("@/app/api/admin/users/[id]/route");
const adminInvites = await import("@/app/api/admin/invites/route");
const approvals = await import("@/app/api/admin/approvals/route");
const shelves = await import("@/app/api/shelves/route");

const ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OWNER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "A".repeat(32);

const ctx = <K extends string>(key: K, value: string) => ({ params: Promise.resolve({ [key]: value } as Record<K, string>) });
const req = (method: string, body?: unknown) =>
  new Request("http://test", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const as = (id: string, role: Viewer["role"]) => (session.current = { user: { id, role } });
let storage: MemoryStorageAdapter;

beforeEach(() => {
  for (const m of Object.values(db)) m.clear();
  storage = new MemoryStorageAdapter();
  setStorage(storage);
  db.users.set(ADMIN, { id: ADMIN, email: "boss@x.com", role: "admin" });
  db.users.set(OWNER, { id: OWNER, email: "owner@x.com", role: "member" });
  db.users.set(OTHER, { id: OTHER, email: "other@x.com", role: "viewer" });
  db.items.set(ID, {
    id: ID,
    status: "ready",
    type: "video",
    mime: "video/mp4",
    title: "Home movie",
    fileKey: `media/${ID}/movie.mp4`,
    coverKey: `covers/${ID}-1700000000000.jpg`,
    uploadId: null,
    addedBy: OWNER,
    visibility: "everyone",
    metadata: {},
    tags: [],
  } as unknown as MediaItem);
  as(OWNER, "member");
});

describe("editing items", () => {
  it("lets the uploader edit and pick people; not others", async () => {
    const res = await item.PATCH(req("PATCH", { title: "Renamed", visibility: "people", people: [OTHER, OWNER, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"] }), ctx("id", ID));
    expect(res.status).toBe(200);
    expect(db.items.get(ID)).toMatchObject({ title: "Renamed", visibility: "people" });
    // Unknown ids and the owner themselves are dropped.
    expect(db.access.get(ID)).toEqual([OTHER]);
    as(OTHER, "viewer");
    expect((await item.PATCH(req("PATCH", { title: "x" }), ctx("id", ID))).status).toBe(404);
  });

  it("validates the patch", async () => {
    expect((await item.PATCH(req("PATCH", { title: "" }), ctx("id", ID))).status).toBe(400);
    expect((await item.PATCH(req("PATCH", { visibility: "public" }), ctx("id", ID))).status).toBe(400);
    expect((await item.PATCH(req("PATCH", { fileKey: "x" }), ctx("id", ID))).status).toBe(400);
  });

  it("deletes every S3 object of the item, including everyone's saves", async () => {
    const keep = "media/ffffffff-ffff-4fff-8fff-ffffffffffff/other.mp4";
    for (const k of [
      `media/${ID}/movie.mp4`,
      `covers/${ID}-1700000000000.jpg`,
      `subs/${ID}/en-1700000000000.vtt`,
      `webgames/${ID}/index.html`,
      `saves/${OTHER}/${ID}/state.bin`,
      keep,
    ]) {
      storage.objects.set(k, { body: new Uint8Array(1), contentType: "x" });
    }
    as(OTHER, "viewer");
    expect((await item.DELETE(req("DELETE"), ctx("id", ID))).status).toBe(404);
    as(ADMIN, "admin");
    expect((await item.DELETE(req("DELETE"), ctx("id", ID))).status).toBe(204);
    expect([...storage.objects.keys()]).toEqual([keep]);
    expect(db.items.has(ID)).toBe(false);
  });
});

describe("share links", () => {
  it("creates a link with a hashed password and never returns the hash", async () => {
    const res = await itemShares.POST(req("POST", { days: 7, password: "hunter22" }), ctx("id", ID));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ hasPassword: true, allowDownload: true });
    expect(body.token).toMatch(/^[\w-]{32}$/);
    expect(JSON.stringify(body)).not.toContain("scrypt");
    expect(db.shares.get(body.token)!.passwordHash).toMatch(/^scrypt\$/);
    expect(db.shares.get(body.token)!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
  });

  it("only lets editors list, make or turn off links; viewers never", async () => {
    const { token } = await (await itemShares.POST(req("POST", { days: 1 }), ctx("id", ID))).json();
    expect((await itemShares.POST(req("POST", { days: 3 }), ctx("id", ID))).status).toBe(400);
    as(OTHER, "viewer");
    expect((await itemShares.GET(req("GET"), ctx("id", ID))).status).toBe(403);
    expect((await share.DELETE(req("DELETE"), ctx("token", token))).status).toBe(403);
    as(ADMIN, "admin");
    expect((await share.DELETE(req("DELETE"), ctx("token", token))).status).toBe(204);
    expect(db.shares.get(token)!.revokedAt).not.toBeNull();
  });
});

describe("invites", () => {
  beforeEach(() => {
    db.invites.set("i1", {
      id: "i1",
      token: TOKEN,
      role: "viewer",
      uses: 0,
      maxUses: 1,
      expiresAt: new Date(Date.now() + 86_400_000),
      revokedAt: null,
    } as Invite);
    session.current = null; // invite pages are public
  });

  it("approves an email with the invite's role, once", async () => {
    const res = await invite.POST(req("POST", { email: "New@Friend.com" }), ctx("token", TOKEN));
    expect(await res.json()).toEqual({ email: "new@friend.com", status: "approved" });
    expect(db.approved.get("new@friend.com")).toBe("viewer");
    // A second person: the link is used up (the first one now just signs in at /login).
    expect((await invite.POST(req("POST", { email: "two@friend.com" }), ctx("token", TOKEN))).status).toBe(410);
  });

  it("doesn't use up the link for someone who already has an account", async () => {
    const res = await invite.POST(req("POST", { email: "owner@x.com" }), ctx("token", TOKEN));
    expect((await res.json()).status).toBe("existing");
    expect(db.invites.get("i1")!.uses).toBe(0);
  });

  it("won't reveal who has an account through a bad link", async () => {
    const res = await invite.POST(req("POST", { email: "owner@x.com" }), ctx("token", "B".repeat(32)));
    expect(res.status).toBe(410);
  });

  it("rejects bad tokens and emails", async () => {
    expect((await invite.POST(req("POST", { email: "a@b.com" }), ctx("token", "nope"))).status).toBe(404);
    expect((await invite.POST(req("POST", { email: "a@b.com" }), ctx("token", "B".repeat(32)))).status).toBe(410);
    expect((await invite.POST(req("POST", { email: "not-an-email" }), ctx("token", TOKEN))).status).toBe(400);
  });
});

describe("admin", () => {
  it("is admins only", async () => {
    expect((await adminInvites.POST(req("POST", { role: "member", days: 7, maxUses: 1 }))).status).toBe(403);
    expect((await adminUsers.PATCH(req("PATCH", { role: "admin" }), ctx("id", OWNER))).status).toBe(403);
    expect((await approvals.POST(req("POST", { email: "a@b.com", role: "member" }))).status).toBe(403);
  });

  it("can't make admin invites, demote the last admin or remove themselves", async () => {
    as(ADMIN, "admin");
    expect((await adminInvites.POST(req("POST", { role: "admin", days: 7, maxUses: 1 }))).status).toBe(400);
    expect((await adminInvites.POST(req("POST", { role: "viewer", days: 30, maxUses: 5 }))).status).toBe(201);
    expect((await adminUsers.PATCH(req("PATCH", { role: "member" }), ctx("id", ADMIN))).status).toBe(409);
    expect((await adminUsers.DELETE(req("DELETE"), ctx("id", ADMIN))).status).toBe(400);
    expect((await adminUsers.PATCH(req("PATCH", { role: "viewer" }), ctx("id", OWNER))).status).toBe(200);
    expect(db.users.get(OWNER)!.role).toBe("viewer");
  });

  it("approves emails directly, but not ones that already have accounts", async () => {
    as(ADMIN, "admin");
    expect((await approvals.POST(req("POST", { email: "Aunt@x.com", role: "member" }))).status).toBe(201);
    expect(db.approved.get("aunt@x.com")).toBe("member");
    expect((await approvals.POST(req("POST", { email: "owner@x.com", role: "member" }))).status).toBe(409);
  });
});

describe("shelves", () => {
  it("can't be made by viewers", async () => {
    as(OTHER, "viewer");
    expect((await shelves.POST(req("POST", { name: "Mine" }))).status).toBe(403);
  });
});
