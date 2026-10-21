import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { S3StorageAdapter, contentDisposition, floorDate } from "@/lib/storage/s3";

const client = new S3Client({
  region: "us-east-1",
  credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret" },
  requestChecksumCalculation: "WHEN_REQUIRED",
});
const s3 = mockClient(client);
const adapter = new S3StorageAdapter({ bucket: "media-bucket", client });

beforeEach(() => s3.reset());
afterEach(() => vi.useRealTimers());

describe("S3StorageAdapter control plane", () => {
  it("creates a multipart upload with the content type", async () => {
    s3.on(CreateMultipartUploadCommand).resolves({ UploadId: "up-1" });
    await expect(
      adapter.createMultipartUpload("media/1/a.mp4", { contentType: "video/mp4" }),
    ).resolves.toEqual({ uploadId: "up-1" });
    expect(s3.commandCalls(CreateMultipartUploadCommand)[0]!.args[0].input).toEqual({
      Bucket: "media-bucket",
      Key: "media/1/a.mp4",
      ContentType: "video/mp4",
    });
  });

  it("throws if S3 returns no UploadId", async () => {
    s3.on(CreateMultipartUploadCommand).resolves({});
    await expect(
      adapter.createMultipartUpload("k", { contentType: "x/y" }),
    ).rejects.toThrow(/UploadId/);
  });

  it("completes with parts sorted by part number", async () => {
    s3.on(CompleteMultipartUploadCommand).resolves({});
    await adapter.completeMultipartUpload("k", "up-1", [
      { partNumber: 2, etag: '"b"' },
      { partNumber: 1, etag: '"a"' },
    ]);
    const input = s3.commandCalls(CompleteMultipartUploadCommand)[0]!.args[0].input;
    expect(input.MultipartUpload?.Parts).toEqual([
      { PartNumber: 1, ETag: '"a"' },
      { PartNumber: 2, ETag: '"b"' },
    ]);
  });

  it("aborts an upload", async () => {
    s3.on(AbortMultipartUploadCommand).resolves({});
    await adapter.abortMultipartUpload("k", "up-1");
    expect(s3.commandCalls(AbortMultipartUploadCommand)[0]!.args[0].input).toMatchObject({
      Key: "k",
      UploadId: "up-1",
    });
  });

  it("head returns size, or null when missing", async () => {
    s3.on(HeadObjectCommand, { Key: "there" }).resolves({ ContentLength: 42, ContentType: "a/b" });
    s3.on(HeadObjectCommand, { Key: "gone" }).rejects(
      new NotFound({ message: "nope", $metadata: {} }),
    );
    await expect(adapter.head("there")).resolves.toEqual({ size: 42, contentType: "a/b" });
    await expect(adapter.head("gone")).resolves.toBeNull();
  });
});

describe("S3StorageAdapter presigning", () => {
  it("presigns one PUT URL per part", async () => {
    const parts = await adapter.presignUploadParts("media/1/a b.mp4", "up-1", [1, 2, 3], {
      expiresIn: 900,
    });
    expect(parts.map((p) => p.partNumber)).toEqual([1, 2, 3]);
    const url = new URL(parts[1]!.url);
    expect(url.hostname).toBe("media-bucket.s3.us-east-1.amazonaws.com");
    expect(url.pathname).toBe("/media/1/a%20b.mp4");
    expect(url.searchParams.get("uploadId")).toBe("up-1");
    expect(url.searchParams.get("partNumber")).toBe("2");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("900");
    // No SDK default checksum the browser couldn't satisfy.
    expect(url.searchParams.get("x-amz-sdk-checksum-algorithm")).toBeNull();
  });

  it("default client omits SDK checksums browsers cannot compute", async () => {
    const plain = new S3StorageAdapter({
      bucket: "b",
      clientConfig: {
        region: "us-east-1",
        credentials: { accessKeyId: "AKIATEST", secretAccessKey: "secret" },
      },
    });
    const [part] = await plain.presignUploadParts("k", "up", [1]);
    expect(new URL(part!.url).searchParams.get("x-amz-sdk-checksum-algorithm")).toBeNull();
    const put = new URL(await plain.presignPut("k", { contentType: "image/jpeg" }));
    expect(put.searchParams.get("x-amz-sdk-checksum-algorithm")).toBeNull();
  });

  it("presigns a GET with an attachment disposition", async () => {
    const url = new URL(await adapter.presignGet("media/1/x.epub", { downloadName: "Dune.epub" }));
    expect(url.searchParams.get("response-content-disposition")).toBe(
      contentDisposition("Dune.epub"),
    );
    expect(url.searchParams.get("X-Amz-Expires")).toBe("3600");
  });

  it("produces identical URLs within a stableFor window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:05:00Z"));
    const a = await adapter.presignGet("covers/1.jpg", { stableFor: 3600, expiresIn: 7200 });
    vi.setSystemTime(new Date("2026-01-01T10:55:00Z"));
    const b = await adapter.presignGet("covers/1.jpg", { stableFor: 3600, expiresIn: 7200 });
    vi.setSystemTime(new Date("2026-01-01T11:01:00Z"));
    const c = await adapter.presignGet("covers/1.jpg", { stableFor: 3600, expiresIn: 7200 });
    expect(a).toBe(b);
    expect(c).not.toBe(a);
    expect(new URL(a).searchParams.get("X-Amz-Date")).toBe("20260101T100000Z");
  });

  it("presigns a single PUT with content type", async () => {
    const url = new URL(await adapter.presignPut("covers/1.jpg", { contentType: "image/jpeg" }));
    expect(url.pathname).toBe("/covers/1.jpg");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain("host");
  });
});

describe("helpers", () => {
  it("floorDate rounds down", () => {
    expect(floorDate(new Date("2026-01-01T10:59:59Z"), 3600).toISOString()).toBe(
      "2026-01-01T10:00:00.000Z",
    );
  });

  it("contentDisposition escapes non-ASCII and quotes", () => {
    expect(contentDisposition('Ü "x".pdf')).toBe(
      `attachment; filename="_ _x_.pdf"; filename*=UTF-8''%C3%9C%20%22x%22.pdf`,
    );
  });
});
