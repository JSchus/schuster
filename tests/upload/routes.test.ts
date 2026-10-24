import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaItem, NewMediaItem } from "@/lib/db/schema";
import { MemoryStorageAdapter } from "@/lib/storage/memory";
import { setStorage } from "@/lib/storage";

/* ---- mocks: session + an in-memory media_items table ---- */

const session = vi.hoisted(() => ({ current: null as null | { user: { id: string; role: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const rows = vi.hoisted(() => new Map<string, MediaItem>());
vi.mock("@/lib/db/queries", () => ({
  createPendingItem: async (v: NewMediaItem & { id: string }) => {
    const row = { coverKey: null, description: null, tags: [], metadata: {}, ...v, status: "pending" } as MediaItem;
    rows.set(v.id, row);
    return row;
  },
  getPendingItem: async (id: string, userId: string) => {
    const r = rows.get(id);
    return r && r.status === "pending" && r.addedBy === userId ? r : undefined;
  },
  markItemReady: async (id: string, v: { coverKey: string | null }) => {
    rows.set(id, { ...rows.get(id)!, status: "ready", uploadId: null, coverKey: v.coverKey });
  },
  deleteItem: async (id: string) => void rows.delete(id),
}));

const { POST: init } = await import("@/app/api/uploads/route");
const { DELETE: cancel } = await import("@/app/api/uploads/[id]/route");
const { POST: presignParts } = await import("@/app/api/uploads/[id]/parts/route");
const { POST: presignCover } = await import("@/app/api/uploads/[id]/cover/route");
const { POST: complete } = await import("@/app/api/uploads/[id]/complete/route");

const post = (body: unknown) =>
  new Request("http://test/api", { method: "POST", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

let storage: MemoryStorageAdapter;

beforeEach(() => {
  rows.clear();
  storage = new MemoryStorageAdapter();
  setStorage(storage);
  session.current = { user: { id: "user-1", role: "member" } };
});

const initBody = {
  filename: "../Dune (1965).epub",
  size: 11,
  mime: "application/epub+zip",
  type: "book",
  title: "Dune",
  tags: ["SciFi", "scifi", "classic"],
  metadata: { author: "Frank Herbert" },
};

describe("upload API", () => {
  it("rejects anonymous requests with 401", async () => {
    session.current = null;
    const res = await init(post(initBody));
    expect(res.status).toBe(401);
  });

  it("doesn't let viewers upload", async () => {
    session.current = { user: { id: "user-1", role: "viewer" } };
    expect((await init(post(initBody))).status).toBe(403);
  });

  it("validates the init body", async () => {
    const res = await init(post({ ...initBody, type: "podcast" }));
    expect(res.status).toBe(400);
  });

  it("runs init → parts → cover → complete end to end", async () => {
    const res = await init(post(initBody));
    expect(res.status).toBe(201);
    const { itemId, partCount } = await res.json();
    expect(partCount).toBe(1);

    const row = rows.get(itemId)!;
    expect(row.fileKey).toBe(`media/${itemId}/Dune-1965.epub`);
    expect(row.tags).toEqual(["scifi", "classic"]);
    expect(row.metadata).toMatchObject({ author: "Frank Herbert", originalFilename: "../Dune (1965).epub" });

    const partsRes = await presignParts(post({ partNumbers: [1] }), ctx(itemId));
    const { parts } = await partsRes.json();
    expect(parts[0].url).toContain(`uploadId=${row.uploadId}`);

    // Simulate the browser PUTs that go straight to storage.
    const etag = storage.putPart(row.uploadId!, 1, new TextEncoder().encode("hello world"));
    const coverRes = await presignCover(post({ contentType: "image/jpeg" }), ctx(itemId));
    expect((await coverRes.json()).url).toContain(`covers/${itemId}.jpg`);
    storage.objects.set(`covers/${itemId}.jpg`, { body: new Uint8Array(1), contentType: "image/jpeg" });

    const done = await complete(post({ parts: [{ partNumber: 1, etag }], hasCover: true }), ctx(itemId));
    expect(done.status).toBe(200);
    expect(rows.get(itemId)).toMatchObject({ status: "ready", uploadId: null, coverKey: `covers/${itemId}.jpg` });
    expect((await storage.head(row.fileKey))?.size).toBe(11);
  });

  it("refuses to complete when the stored size does not match", async () => {
    const { itemId } = await (await init(post(initBody))).json();
    const row = rows.get(itemId)!;
    const etag = storage.putPart(row.uploadId!, 1, new Uint8Array(3));
    const res = await complete(post({ parts: [{ partNumber: 1, etag }] }), ctx(itemId));
    expect(res.status).toBe(422);
    expect(rows.get(itemId)!.status).toBe("pending");
  });

  it("only the uploader can touch a pending item", async () => {
    const { itemId } = await (await init(post(initBody))).json();
    session.current = { user: { id: "someone-else", role: "member" } };
    expect((await presignParts(post({ partNumbers: [1] }), ctx(itemId))).status).toBe(404);
    expect((await cancel(new Request("http://test"), ctx(itemId))).status).toBe(404);
  });

  it("returns 404 for malformed ids", async () => {
    expect((await presignParts(post({ partNumbers: [1] }), ctx("not-a-uuid"))).status).toBe(404);
  });

  it("cancel aborts the multipart upload and deletes the row", async () => {
    const { itemId } = await (await init(post(initBody))).json();
    const uploadId = rows.get(itemId)!.uploadId!;
    const res = await cancel(new Request("http://test"), ctx(itemId));
    expect(res.status).toBe(204);
    expect(rows.has(itemId)).toBe(false);
    expect(storage.uploads.has(uploadId)).toBe(false);
  });
});
