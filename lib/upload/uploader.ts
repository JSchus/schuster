import { partRange } from "./plan";
import type { CompleteRequest, InitRequest, InitResponse } from "./protocol";

/**
 * Network operations the uploader needs. The browser implementation lives in
 * `./api-client.ts`; tests inject a fake.
 */
export interface UploadTransport {
  init(req: InitRequest): Promise<InitResponse>;
  presignParts(itemId: string, partNumbers: number[]): Promise<{ partNumber: number; url: string }[]>;
  /** PUT a part straight to storage; resolves with the ETag. */
  putPart(
    url: string,
    body: Blob,
    onProgress: (loaded: number) => void,
    signal?: AbortSignal,
  ): Promise<string>;
  presignCover(itemId: string, contentType: string): Promise<string>;
  putCover(url: string, body: Blob, signal?: AbortSignal): Promise<void>;
  complete(itemId: string, req: CompleteRequest): Promise<{ itemId: string }>;
  abort(itemId: string): Promise<void>;
}

export type UploadPhase = "preparing" | "uploading" | "finishing" | "done" | "error";

export type UploadProgress = { phase: UploadPhase; loaded: number; total: number };

export type UploadOptions = {
  file: Blob;
  request: InitRequest;
  cover?: Blob | null;
  transport: UploadTransport;
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
  /** Parallel part PUTs. Default 4. */
  concurrency?: number;
  /** Retries per part after the first attempt. Default 3. */
  retries?: number;
  /** Part URLs requested per presign call. Default 20. */
  presignBatch?: number;
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Upload one file directly to object storage via presigned multipart URLs.
 *
 * 1. `init` creates a pending item and returns the part plan.
 * 2. Parts are PUT in parallel; URLs are presigned lazily in batches and
 *    re-presigned on retry (in case they expired).
 * 3. The optional cover is PUT via its own presigned URL.
 * 4. `complete` assembles the object and marks the item ready.
 *
 * On failure or cancellation the server-side upload is aborted.
 */
export async function uploadFile(opts: UploadOptions): Promise<{ itemId: string }> {
  const {
    file,
    transport,
    signal,
    concurrency = 4,
    retries = 3,
    presignBatch = 20,
    sleep = defaultSleep,
  } = opts;
  const total = file.size;
  let reported = 0;
  const emit = (phase: UploadPhase, loaded: number) => {
    // Never move backwards (a retried part restarts its own byte count).
    reported = Math.max(reported, Math.min(loaded, total));
    opts.onProgress?.({ phase, loaded: phase === "done" ? total : reported, total });
  };

  emit("preparing", 0);
  const init = await transport.init(opts.request);
  const plan = { partSize: init.partSize, partCount: init.partCount };

  try {
    // Lazily presign batches of part URLs, shared between workers.
    const batches = new Map<number, Promise<Map<number, string>>>();
    const urlFor = (partNumber: number, fresh = false): Promise<string> => {
      if (fresh) {
        return transport.presignParts(init.itemId, [partNumber]).then((r) => first(r).url);
      }
      const b = Math.floor((partNumber - 1) / presignBatch);
      let batch = batches.get(b);
      if (!batch) {
        const numbers = range(b * presignBatch + 1, Math.min((b + 1) * presignBatch, plan.partCount));
        batch = transport
          .presignParts(init.itemId, numbers)
          .then((r) => new Map(r.map((p) => [p.partNumber, p.url])));
        batches.set(b, batch);
        // Drop failed batches so a retry can request them again.
        batch.catch(() => batches.delete(b));
      }
      return batch.then((m) => {
        const url = m.get(partNumber);
        if (!url) throw new Error(`No URL for part ${partNumber}`);
        return url;
      });
    };

    const loadedByPart = new Map<number, number>();
    const sumLoaded = () => [...loadedByPart.values()].reduce((a, b) => a + b, 0);

    const uploadPart = async (partNumber: number) => {
      const [start, end] = partRange(partNumber, plan, total);
      const body = file.slice(start, end);
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        try {
          const url = await urlFor(partNumber, attempt > 0);
          const etag = await transport.putPart(
            url,
            body,
            (loaded) => {
              loadedByPart.set(partNumber, loaded);
              emit("uploading", sumLoaded());
            },
            signal,
          );
          loadedByPart.set(partNumber, end - start);
          emit("uploading", sumLoaded());
          return { partNumber, etag };
        } catch (err) {
          loadedByPart.set(partNumber, 0);
          if (signal?.aborted || attempt >= retries) throw err;
          await sleep(500 * 2 ** attempt);
        }
      }
    };

    const parts = await pool(range(1, plan.partCount), concurrency, uploadPart, signal);

    emit("finishing", total);
    let hasCover = false;
    if (opts.cover) {
      try {
        const url = await transport.presignCover(init.itemId, opts.cover.type || "image/jpeg");
        await transport.putCover(url, opts.cover, signal);
        hasCover = true;
      } catch (err) {
        // A missing cover shouldn't sink the whole upload.
        if (signal?.aborted) throw err;
        console.warn("Cover upload failed", err);
      }
    }

    const result = await transport.complete(init.itemId, {
      parts: parts.sort((a, b) => a.partNumber - b.partNumber),
      hasCover,
    });
    emit("done", total);
    return result;
  } catch (err) {
    opts.onProgress?.({ phase: "error", loaded: reported, total });
    await transport.abort(init.itemId).catch(() => undefined);
    throw err;
  }
}

/** Run `fn` over `items` with at most `limit` in flight; fail fast. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < items.length) {
      signal?.throwIfAborted();
      const i = next++;
      try {
        results[i] = await fn(items[i]!);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
}

function first<T>(arr: T[]): T {
  if (!arr[0]) throw new Error("Empty presign response");
  return arr[0];
}
