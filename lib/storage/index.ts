import "server-only";
import { env } from "@/lib/env";
import { MemoryStorageAdapter } from "./memory";
import { S3StorageAdapter } from "./s3";
import type { StorageAdapter } from "./types";

export type { StorageAdapter } from "./types";
export { coverKey, mediaKey } from "./keys";

let instance: StorageAdapter | undefined;

/** The configured storage backend (selected by STORAGE_DRIVER). */
export function getStorage(): StorageAdapter {
  if (instance) return instance;
  const e = env();
  switch (e.STORAGE_DRIVER) {
    case "memory":
      instance = new MemoryStorageAdapter();
      break;
    case "s3": {
      if (!e.S3_BUCKET) throw new Error("S3_BUCKET is required when STORAGE_DRIVER=s3");
      instance = new S3StorageAdapter({
        bucket: e.S3_BUCKET,
        clientConfig: {
          region: e.S3_REGION,
          endpoint: e.S3_ENDPOINT,
          forcePathStyle: e.S3_FORCE_PATH_STYLE,
          credentials:
            e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
              ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
              : undefined,
        },
      });
      break;
    }
  }
  return instance;
}

/** Override the backend (tests). */
export function setStorage(adapter: StorageAdapter | undefined) {
  instance = adapter;
}
