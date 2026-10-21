import { describe, expect, it } from "vitest";
import { coverKey, mediaKey, safeFilename } from "@/lib/storage/keys";
import { MemoryStorageAdapter } from "@/lib/storage/memory";

describe("MemoryStorageAdapter (adapter contract)", () => {
  it("round-trips a multipart upload", async () => {
    const s = new MemoryStorageAdapter();
    const { uploadId } = await s.createMultipartUpload("k", { contentType: "text/plain" });
    const urls = await s.presignUploadParts("k", uploadId, [1, 2]);
    expect(urls).toHaveLength(2);
    const e2 = s.putPart(uploadId, 2, new TextEncoder().encode("world"));
    const e1 = s.putPart(uploadId, 1, new TextEncoder().encode("hello "));
    await s.completeMultipartUpload("k", uploadId, [
      { partNumber: 2, etag: e2 },
      { partNumber: 1, etag: e1 },
    ]);
    expect(new TextDecoder().decode(s.objects.get("k")!.body)).toBe("hello world");
    await expect(s.head("k")).resolves.toEqual({ size: 11, contentType: "text/plain" });
    await s.delete("k");
    await expect(s.head("k")).resolves.toBeNull();
  });

  it("rejects bad ETags and aborted uploads", async () => {
    const s = new MemoryStorageAdapter();
    const { uploadId } = await s.createMultipartUpload("k", { contentType: "x/y" });
    s.putPart(uploadId, 1, new Uint8Array([1]));
    await expect(
      s.completeMultipartUpload("k", uploadId, [{ partNumber: 1, etag: '"wrong"' }]),
    ).rejects.toThrow("InvalidPart");
    await s.abortMultipartUpload("k", uploadId);
    await expect(s.presignUploadParts("k", uploadId, [1])).rejects.toThrow("NoSuchUpload");
  });
});

describe("keys", () => {
  it("sanitises filenames", () => {
    expect(safeFilename("../../etc/passwd")).toBe("passwd");
    expect(safeFilename("My Book (2nd ed).epub")).toBe("My-Book-2nd-ed.epub");
    expect(safeFilename("...")).toBe("file");
    expect(safeFilename("C:\\Users\\me\\vid.mp4")).toBe("vid.mp4");
  });

  it("builds keys under the item id", () => {
    expect(mediaKey("abc", "a b.mp3")).toBe("media/abc/a-b.mp3");
    expect(coverKey("abc")).toBe("covers/abc.jpg");
  });
});
