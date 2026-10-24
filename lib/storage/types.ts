/**
 * Backend-agnostic object storage contract.
 *
 * The app never streams media bytes through its own server: every method
 * either performs a small control-plane call (create/complete/abort/head/
 * delete) or returns a presigned URL the browser talks to directly.
 * Implementations: S3 (`./s3.ts`), in-memory for tests (`./memory.ts`).
 */
export interface StorageAdapter {
  /** Start a multipart upload for `key`. */
  createMultipartUpload(key: string, opts: { contentType: string }): Promise<{ uploadId: string }>;

  /** Presign PUT URLs for the given 1-based part numbers. */
  presignUploadParts(
    key: string,
    uploadId: string,
    partNumbers: number[],
    opts?: { expiresIn?: number },
  ): Promise<PresignedPart[]>;

  /** Assemble uploaded parts into the final object. */
  completeMultipartUpload(key: string, uploadId: string, parts: CompletedPart[]): Promise<void>;

  /** Discard an in-flight multipart upload and its parts. */
  abortMultipartUpload(key: string, uploadId: string): Promise<void>;

  /** Presign a single-shot PUT (small objects such as cover images). */
  presignPut(key: string, opts: { contentType: string; expiresIn?: number }): Promise<string>;

  /** Presign a GET for download, playback, or display. */
  presignGet(key: string, opts?: PresignGetOptions): Promise<string>;

  /** Object metadata, or null if it does not exist. */
  head(key: string): Promise<{ size: number; contentType?: string; lastModified?: Date } | null>;

  /**
   * Unsigned URL for a key. Only readable for prefixes the bucket policy
   * makes public (webgames/); everything else answers 403.
   */
  publicUrl(key: string): string;

  delete(key: string): Promise<void>;
}

export type PresignedPart = { partNumber: number; url: string };
export type CompletedPart = { partNumber: number; etag: string };

export type PresignGetOptions = {
  /** Seconds until expiry. Default 3600. */
  expiresIn?: number;
  /** If set, browsers save the response under this filename. */
  downloadName?: string;
  /**
   * Round the signing time down to this many seconds so repeated calls
   * produce identical URLs (lets browsers cache covers). The effective
   * lifetime is then between `expiresIn - stableFor` and `expiresIn`.
   */
  stableFor?: number;
};
