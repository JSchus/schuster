/* Byte-range responses for media served from the Cache API.
 *
 * Safari will only play <audio>/<video> from a URL that answers Range
 * requests with 206 Partial Content, so the service worker can't just
 * return the cached 200. Loaded by sw.js via importScripts; also required by
 * the unit tests (module.exports).
 */
(function (root) {
  /** Parse "bytes=a-b" / "bytes=a-" / "bytes=-n" against `size`. null = unsatisfiable/unsupported. */
  function parseRange(header, size) {
    const m = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
    if (!m || (m[1] === "" && m[2] === "") || size <= 0) return null;
    let start;
    let end;
    if (m[1] === "") {
      start = Math.max(0, size - Number(m[2]));
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start > end || start >= size) return null;
    return { start, end };
  }

  /** Answer `rangeHeader` from a full cached response (200 if no Range header). */
  async function rangeResponse(full, rangeHeader) {
    const type = full.headers.get("Content-Type") || "application/octet-stream";
    const blob = await full.blob();
    if (!rangeHeader) {
      return new Response(blob, {
        status: 200,
        headers: { "Content-Type": type, "Content-Length": String(blob.size), "Accept-Ranges": "bytes" },
      });
    }
    const range = parseRange(rangeHeader, blob.size);
    if (!range) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${blob.size}` } });
    }
    const part = blob.slice(range.start, range.end + 1);
    return new Response(part, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(part.size),
        "Content-Range": `bytes ${range.start}-${range.end}/${blob.size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }

  root.SwRange = { parseRange, rangeResponse };
  if (typeof module !== "undefined") module.exports = root.SwRange;
})(typeof self !== "undefined" ? self : globalThis);
