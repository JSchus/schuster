import type {
  CompleteResponse,
  CoverResponse,
  InitResponse,
  PartsResponse,
} from "./protocol";
import type { UploadTransport } from "./uploader";

/** Browser transport: JSON calls to our API, XHR PUTs straight to S3. */
export const browserTransport: UploadTransport = {
  init: (req) => postJson<InitResponse>("/api/uploads", req),

  presignParts: async (itemId, partNumbers) =>
    (await postJson<PartsResponse>(`/api/uploads/${itemId}/parts`, { partNumbers })).parts,

  putPart: (url, body, onProgress, signal) =>
    xhrPut(url, body, { onProgress, signal }).then((xhr) => {
      const etag = xhr.getResponseHeader("ETag");
      if (!etag) {
        throw new Error("Missing ETag — check the bucket CORS ExposeHeaders (infra/s3-cors.json)");
      }
      return etag;
    }),

  presignCover: async (itemId, contentType) =>
    (await postJson<CoverResponse>(`/api/uploads/${itemId}/cover`, { contentType })).url,

  putCover: async (url, body, signal) => {
    await xhrPut(url, body, { signal, contentType: body.type || "image/jpeg" });
  },

  complete: (itemId, req) => postJson<CompleteResponse>(`/api/uploads/${itemId}/complete`, req),

  abort: async (itemId) => {
    await fetch(`/api/uploads/${itemId}`, { method: "DELETE" });
  },
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = await res.json().then((j) => j.error, () => res.statusText);
    throw new Error(`${url}: ${res.status} ${msg ?? ""}`.trim());
  }
  return res.json() as Promise<T>;
}

/** PUT with upload progress events (fetch has no upload progress). */
function xhrPut(
  url: string,
  body: Blob,
  opts: { onProgress?: (loaded: number) => void; signal?: AbortSignal; contentType?: string },
): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (opts.contentType) xhr.setRequestHeader("Content-Type", opts.contentType);
    xhr.upload.onprogress = (e) => opts.onProgress?.(e.loaded);
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve(xhr)
        : reject(new Error(`Storage PUT failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    opts.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}
