import { vi } from "vitest";
import type { UploadTransport } from "@/lib/upload/uploader";

/** In-memory UploadTransport that records calls and can inject failures. */
export function fakeTransport(opts: { partSize: number; partCount: number }) {
  const received = new Map<number, number>();
  let inFlight = 0;
  let maxInFlight = 0;
  const failOnce = new Set<number>();
  const failAlways = new Set<number>();

  const transport: UploadTransport = {
    init: vi.fn(async () => ({ itemId: "item-1", ...opts })),
    presignParts: vi.fn(async (_id: string, nums: number[]) =>
      nums.map((n) => ({ partNumber: n, url: `https://s3.test/part/${n}` })),
    ),
    putPart: vi.fn(async (url: string, body: Blob, onProgress: (n: number) => void) => {
      const n = Number(url.split("/").pop());
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        onProgress(Math.floor(body.size / 2));
        await new Promise((r) => setTimeout(r, 1));
        if (failAlways.has(n) || failOnce.delete(n)) throw new Error(`boom ${n}`);
        onProgress(body.size);
        received.set(n, body.size);
        return `"etag-${n}"`;
      } finally {
        inFlight--;
      }
    }),
    presignCover: vi.fn(async () => "https://s3.test/cover"),
    putCover: vi.fn(async () => undefined),
    complete: vi.fn(async (itemId: string) => ({ itemId })),
    abort: vi.fn(async () => undefined),
  };

  return {
    transport,
    received,
    failOnce,
    failAlways,
    get maxInFlight() {
      return maxInFlight;
    },
  };
}
