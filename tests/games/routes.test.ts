import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem } from "@/lib/db/schema";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { setStorage } from "@/lib/storage";

type User = { id: string; role: "admin" | "member" };
const session = vi.hoisted(() => ({ current: null as null | { user: User } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const rows = vi.hoisted(() => new Map<string, MediaItem>());
vi.mock("@/lib/db/queries", () => ({
  getReadyItem: async (id: string) => rows.get(id),
  getItemForEdit: async (id: string, user: User) => {
    const r = rows.get(id);
    return r && (user.role === "admin" || r.addedBy === user.id) ? r : undefined;
  },
  setGameMeta: async (id: string, patch: Partial<MediaItem["metadata"]>) => {
    const r = rows.get(id)!;
    rows.set(id, { ...r, metadata: { ...r.metadata, ...patch } });
  },
}));

const saves = await import("@/app/api/games/[id]/saves/route");
const files = await import("@/app/api/games/[id]/web/files/route");
const publish = await import("@/app/api/games/[id]/web/publish/route");
const game = await import("@/app/api/games/[id]/route");
const bios = await import("@/app/api/games/bios/route");

const ROM = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const WEB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown, method = "POST") => new Request("http://test", { method, body: JSON.stringify(body) });
const as = (id: string, role: User["role"] = "member") => (session.current = { user: { id, role } });
let storage: MemoryStorageAdapter;

beforeEach(() => {
  storage = new MemoryStorageAdapter();
  setStorage(storage);
  rows.clear();
  const base = { status: "ready", type: "game", addedBy: "owner" } as MediaItem;
  rows.set(ROM, { ...base, id: ROM, mime: "application/octet-stream", fileKey: `media/${ROM}/m.nes`, metadata: { system: "nes" } });
  rows.set(WEB, { ...base, id: WEB, mime: "application/zip", fileKey: `media/${WEB}/g.zip`, metadata: { web: { entry: "G/index.html", status: "pending" } } });
  as("owner");
});

describe("cloud saves", () => {
  it("keys every save under the caller's own user id", async () => {
    as("alice");
    const res = await saves.POST(post({ kind: "state" }), ctx(ROM));
    expect((await res.json()).uploadUrl).toContain(`saves/alice/${ROM}/state.bin`);
  });

  it("lists only the caller's existing saves, with timestamps", async () => {
    storage.objects.set(`saves/alice/${ROM}/state.bin`, { body: new Uint8Array(9), contentType: "x", modified: new Date(1_700_000_000_000) });
    storage.objects.set(`saves/bob/${ROM}/sram.bin`, { body: new Uint8Array(2), contentType: "x" });
    as("alice");
    const mine = await (await saves.GET(new Request("http://test"), ctx(ROM))).json();
    expect(Object.keys(mine)).toEqual(["state"]);
    expect(mine.state).toMatchObject({ savedAt: 1_700_000_000_000, size: 9 });
    as("bob");
    expect(Object.keys(await (await saves.GET(new Request("http://test"), ctx(ROM))).json())).toEqual(["sram"]);
  });

  it("validates the slot and requires a session", async () => {
    expect((await saves.POST(post({ kind: "../../x" }), ctx(ROM))).status).toBe(400);
    session.current = null;
    expect((await saves.GET(new Request("http://test"), ctx(ROM))).status).toBe(401);
  });
});

describe("web game publishing", () => {
  it("presigns typed PUTs under webgames/{id}/ for editors only", async () => {
    const res = await files.POST(post({ paths: ["G/index.html", "G/build/game.wasm"] }), ctx(WEB));
    const body = await res.json();
    expect(body.files[1]).toMatchObject({ path: "G/build/game.wasm", contentType: "application/wasm" });
    expect(body.files[1].url).toContain(`webgames/${WEB}/G/build/game.wasm`);
    as("stranger");
    expect((await files.POST(post({ paths: ["G/index.html"] }), ctx(WEB))).status).toBe(404);
  });

  it("rejects traversal, oversized batches and non-web games", async () => {
    expect((await files.POST(post({ paths: ["../evil.html"] }), ctx(WEB))).status).toBe(400);
    expect((await files.POST(post({ paths: Array.from({ length: 101 }, (_, i) => `f${i}.js`) }), ctx(WEB))).status).toBe(400);
    expect((await files.POST(post({ paths: ["x.js"] }), ctx(ROM))).status).toBe(400);
  });

  it("publishes only once the entry page exists", async () => {
    expect((await publish.POST(post({ entry: "G/index.html", files: 2 }), ctx(WEB))).status).toBe(409);
    storage.objects.set(`webgames/${WEB}/G/index.html`, { body: new Uint8Array(1), contentType: "text/html" });
    const res = await publish.POST(post({ entry: "G/index.html", files: 2 }), ctx(WEB));
    expect(res.status).toBe(200);
    expect(rows.get(WEB)!.metadata.web).toMatchObject({ status: "ready", files: 2 });
  });
});

describe("system and BIOS", () => {
  it("lets editors set a valid system", async () => {
    expect((await game.PATCH(post({ system: "snes" }, "PATCH"), ctx(ROM))).status).toBe(200);
    expect(rows.get(ROM)!.metadata.system).toBe("snes");
    expect((await game.PATCH(post({ system: "dreamcast" }, "PATCH"), ctx(ROM))).status).toBe(400);
    as("stranger");
    expect((await game.PATCH(post({ system: "nes" }, "PATCH"), ctx(ROM))).status).toBe(404);
  });

  it("only admins add a PS1 BIOS, with a known filename", async () => {
    expect((await bios.POST(post({ filename: "scph5501.bin" }))).status).toBe(403);
    as("boss", "admin");
    expect((await bios.POST(post({ filename: "evil.bin" }))).status).toBe(400);
    const ok = await bios.POST(post({ filename: "SCPH5501.BIN" }));
    expect((await ok.json()).uploadUrl).toContain("bios/psx/scph5501.bin");
    expect(await (await bios.GET()).json()).toEqual({ psx: null });
    storage.objects.set("bios/psx/scph5501.bin", { body: new Uint8Array(1), contentType: "x" });
    expect(await (await bios.GET()).json()).toEqual({ psx: "scph5501.bin" });
  });
});
