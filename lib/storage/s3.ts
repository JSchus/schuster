import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type {
  CompletedPart,
  PresignedPart,
  PresignGetOptions,
  StorageAdapter,
} from "./types";

const DEFAULT_EXPIRES = 3600;

export type S3AdapterConfig = {
  bucket: string;
  client?: S3Client;
  clientConfig?: S3ClientConfig;
};

/** Amazon S3 (or any S3-compatible service such as MinIO / R2). */
export class S3StorageAdapter implements StorageAdapter {
  readonly bucket: string;
  readonly client: S3Client;

  constructor(config: S3AdapterConfig) {
    this.bucket = config.bucket;
    this.client =
      config.client ??
      new S3Client({
        // Since SDK 3.729 presigned PUTs carry a default CRC32 checksum the
        // browser can't compute, so only add checksums when S3 requires them.
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
        ...config.clientConfig,
      });
  }

  async createMultipartUpload(key: string, opts: { contentType: string }) {
    const res = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: opts.contentType,
      }),
    );
    if (!res.UploadId) throw new Error("S3 did not return an UploadId");
    return { uploadId: res.UploadId };
  }

  async presignUploadParts(
    key: string,
    uploadId: string,
    partNumbers: number[],
    opts: { expiresIn?: number } = {},
  ): Promise<PresignedPart[]> {
    return Promise.all(
      partNumbers.map(async (partNumber) => ({
        partNumber,
        url: await getSignedUrl(
          this.client,
          new UploadPartCommand({
            Bucket: this.bucket,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
          }),
          { expiresIn: opts.expiresIn ?? DEFAULT_EXPIRES },
        ),
      })),
    );
  }

  async completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]) {
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: sorted.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );
  }

  async abortMultipartUpload(key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }),
    );
  }

  presignPut(key: string, opts: { contentType: string; expiresIn?: number }) {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: opts.contentType }),
      { expiresIn: opts.expiresIn ?? 600 },
    );
  }

  presignGet(key: string, opts: PresignGetOptions = {}) {
    const expiresIn = opts.expiresIn ?? DEFAULT_EXPIRES;
    const signingDate = opts.stableFor ? floorDate(new Date(), opts.stableFor) : undefined;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: opts.downloadName
          ? contentDisposition(opts.downloadName)
          : undefined,
      }),
      { expiresIn, signingDate },
    );
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string }).name === "NotFound") return null;
      throw err;
    }
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** Round `date` down to a multiple of `seconds` since the epoch. */
export function floorDate(date: Date, seconds: number): Date {
  const ms = seconds * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

/** RFC 6266 attachment header with an ASCII fallback and UTF-8 filename*. */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
