import { describe, expect, it, vi } from "vitest";
import { uploadFile, type UploadProgress } from "@/lib/upload/uploader";
import { fakeTransport } from "./fake-transport";

const request = { filename: "a.bin", size: 0, mime: "application/octet-stream", type: "file", title: "A" } as const;
const noSleep = async () => {};

function blobOf(size: number) {
  return new Blob([new Uint8Array(size)]);
}

describe("uploadFile", () => {
  it("uploads every part, sorted, and completes", async () => {
    const f = fakeTransport({ partSize: 10, partCount: 5 });
    const file = blobOf(45);
    const res = await uploadFile({ file, request, transport: f.transport, sleep: noSleep });

    expect(res).toEqual({ itemId: "item-1" });
    expect([...f.received.entries()].sort((a, b) => a[0] - b[0])).toEqual([
      [1, 10], [2, 10], [3, 10], [4, 10], [5, 5],
    ]);
    const completeArgs = vi.mocked(f.transport.complete).mock.calls[0]![1];
    expect(completeArgs.parts.map((p) => p.partNumber)).toEqual([1, 2, 3, 4, 5]);
    expect(completeArgs.parts[0]!.etag).toBe('"etag-1"');
    expect(completeArgs.hasCover).toBe(false);
    expect(f.transport.abort).not.toHaveBeenCalled();
  });

  it("respects the concurrency limit", async () => {
    const f = fakeTransport({ partSize: 1, partCount: 20 });
    await uploadFile({ file: blobOf(20), request, transport: f.transport, concurrency: 3, sleep: noSleep });
    expect(f.maxInFlight).toBeLessThanOrEqual(3);
    expect(f.maxInFlight).toBeGreaterThan(1);
  });

  it("presigns in batches", async () => {
    const f = fakeTransport({ partSize: 1, partCount: 45 });
    await uploadFile({ file: blobOf(45), request, transport: f.transport, presignBatch: 20, sleep: noSleep });
    const batches = vi.mocked(f.transport.presignParts).mock.calls.map((c) => c[1].length);
    expect(batches).toEqual([20, 20, 5]);
  });

  it("reports monotonic progress ending at 100%", async () => {
    const f = fakeTransport({ partSize: 10, partCount: 3 });
    f.failOnce.add(2);
    const events: UploadProgress[] = [];
    await uploadFile({
      file: blobOf(30),
      request,
      transport: f.transport,
      onProgress: (p) => events.push(p),
      sleep: noSleep,
    });
    const loaded = events.map((e) => e.loaded);
    expect(loaded).toEqual([...loaded].sort((a, b) => a - b));
    expect(events.at(-1)).toEqual({ phase: "done", loaded: 30, total: 30 });
    expect(events[0]!.phase).toBe("preparing");
  });

  it("retries a failed part with a freshly presigned URL", async () => {
    const f = fakeTransport({ partSize: 10, partCount: 2 });
    f.failOnce.add(2);
    const sleep = vi.fn(noSleep);
    await uploadFile({ file: blobOf(20), request, transport: f.transport, sleep });
    expect(sleep).toHaveBeenCalledWith(500);
    expect(f.received.get(2)).toBe(10);
    expect(vi.mocked(f.transport.presignParts).mock.calls).toContainEqual(["item-1", [2]]);
  });

  it("aborts the server-side upload after exhausting retries", async () => {
    const f = fakeTransport({ partSize: 10, partCount: 2 });
    f.failAlways.add(1);
    const events: UploadProgress[] = [];
    await expect(
      uploadFile({
        file: blobOf(20),
        request,
        transport: f.transport,
        retries: 2,
        onProgress: (p) => events.push(p),
        sleep: noSleep,
      }),
    ).rejects.toThrow("boom 1");
    expect(f.transport.abort).toHaveBeenCalledWith("item-1");
    expect(f.transport.complete).not.toHaveBeenCalled();
    expect(events.at(-1)!.phase).toBe("error");
  });

  it("aborts when cancelled", async () => {
    const f = fakeTransport({ partSize: 1, partCount: 50 });
    const ctrl = new AbortController();
    const p = uploadFile({
      file: blobOf(50),
      request,
      transport: f.transport,
      signal: ctrl.signal,
      concurrency: 1,
      sleep: noSleep,
    });
    setTimeout(() => ctrl.abort(), 5);
    await expect(p).rejects.toThrow();
    expect(f.transport.abort).toHaveBeenCalled();
    expect(f.received.size).toBeLessThan(50);
  });

  it("uploads the cover and flags it on complete", async () => {
    const f = fakeTransport({ partSize: 10, partCount: 1 });
    const cover = new Blob([new Uint8Array(3)], { type: "image/jpeg" });
    await uploadFile({ file: blobOf(5), request, cover, transport: f.transport, sleep: noSleep });
    expect(f.transport.presignCover).toHaveBeenCalledWith("item-1", "image/jpeg");
    expect(f.transport.putCover).toHaveBeenCalled();
    expect(vi.mocked(f.transport.complete).mock.calls[0]![1].hasCover).toBe(true);
  });

  it("still completes when only the cover upload fails", async () => {
    const f = fakeTransport({ partSize: 10, partCount: 1 });
    vi.mocked(f.transport.putCover).mockRejectedValueOnce(new Error("cover fail"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const cover = new Blob([new Uint8Array(3)], { type: "image/jpeg" });
    await uploadFile({ file: blobOf(5), request, cover, transport: f.transport, sleep: noSleep });
    expect(vi.mocked(f.transport.complete).mock.calls[0]![1].hasCover).toBe(false);
  });
});
