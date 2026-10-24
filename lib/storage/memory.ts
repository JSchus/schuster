import { randomUUID } from "node:crypto";
import type { CompletedPart, PresignGetOptions, StorageAdapter } from "./types";

type Pending = { key: string; contentType: string; parts: Map<number, Uint8Array> };

/**
 * In-memory adapter for tests and offline experiments. "Presigned" URLs use a
 * fake `memory://` scheme; tests write parts via `putPart` to simulate the
 * browser PUT that would normally hit S3.
 */
export class MemoryStorageAdapter implements StorageAdapter {
  readonly objects = new Map<string, { body: Uint8Array; contentType: string; modified?: Date }>();
  readonly uploads = new Map<string, Pending>();

  async createMultipartUpload(key: string, opts: { contentType: string }) {
    const uploadId = randomUUID();
    this.uploads.set(uploadId, { key, contentType: opts.contentType, parts: new Map() });
    return { uploadId };
  }

  async presignUploadParts(key: string, uploadId: string, partNumbers: number[]) {
    this.requireUpload(key, uploadId);
    return partNumbers.map((partNumber) => ({
      partNumber,
      url: `memory://${key}?uploadId=${uploadId}&partNumber=${partNumber}`,
    }));
  }

  /** Simulates the browser's PUT to a presigned part URL. Returns the ETag. */
  putPart(uploadId: string, partNumber: number, body: Uint8Array): string {
    const upload = this.uploads.get(uploadId);
    if (!upload) throw new Error("NoSuchUpload");
    upload.parts.set(partNumber, body);
    return `"etag-${partNumber}"`;
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]) {
    const upload = this.requireUpload(key, uploadId);
    const ordered = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    const chunks = ordered.map((p) => {
      const chunk = upload.parts.get(p.partNumber);
      if (!chunk || p.etag !== `"etag-${p.partNumber}"`) throw new Error("InvalidPart");
      return chunk;
    });
    const body = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.length;
    }
    this.objects.set(key, { body, contentType: upload.contentType });
    this.uploads.delete(uploadId);
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    this.requireUpload(key, uploadId);
    this.uploads.delete(uploadId);
  }

  async presignPut(key: string) {
    return `memory://${key}?put`;
  }

  async presignGet(key: string, opts: PresignGetOptions = {}) {
    const name = opts.downloadName ? `&download=${encodeURIComponent(opts.downloadName)}` : "";
    return `memory://${key}?get${name}`;
  }

  async head(key: string) {
    const obj = this.objects.get(key);
    return obj ? { size: obj.body.length, contentType: obj.contentType, lastModified: obj.modified } : null;
  }

  async delete(key: string) {
    this.objects.delete(key);
  }

  async deleteMany(keys: string[]) {
    for (const k of keys) this.objects.delete(k);
  }

  async deletePrefix(prefix: string) {
    if (!prefix) throw new Error("Refusing to delete the whole bucket");
    const keys = [...this.objects.keys()].filter((k) => k.startsWith(prefix));
    for (const k of keys) this.objects.delete(k);
    return keys.length;
  }

  publicUrl(key: string) {
    return `memory://public/${key}`;
  }

  private requireUpload(key: string, uploadId: string): Pending {
    const upload = this.uploads.get(uploadId);
    if (!upload || upload.key !== key) throw new Error("NoSuchUpload");
    return upload;
  }
}
