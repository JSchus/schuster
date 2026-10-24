/** Helpers for HTML5 web games uploaded as a .zip (pure; used in the browser and the API). */

export const MAX_WEB_FILES = 3000;
export const MAX_WEB_BYTES = 1024 * 1024 * 1024;

/**
 * A safe relative path inside the game folder, or undefined. Rejects
 * traversal, absolute paths, backslashes, control characters and anything
 * unusually long, so a crafted zip can't write outside webgames/{id}/.
 */
export function safeGamePath(p: string): string | undefined {
  if (!p || p.length > 300 || /[\\\x00-\x1f\x7f]/.test(p) || p.startsWith("/")) return undefined;
  const parts = p.split("/");
  if (parts.some((s) => s === ".." || s === "." || s === "")) return undefined;
  return p;
}

/**
 * The game's entry page: index.html at the root, or inside a single top
 * folder (the common "MyGame/index.html" zip layout). macOS junk is ignored.
 */
export function findEntry(paths: string[]): string | undefined {
  const files = paths.filter((p) => !p.endsWith("/") && !p.startsWith("__MACOSX/"));
  if (files.some((p) => p.toLowerCase() === "index.html")) return files.find((p) => p.toLowerCase() === "index.html");
  const tops = new Set(files.map((p) => p.split("/")[0]));
  if (tops.size !== 1) return undefined;
  const [top] = [...tops];
  return files.find((p) => p.toLowerCase() === `${top}/index.html`.toLowerCase());
}

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript",
  mjs: "text/javascript",
  css: "text/css",
  json: "application/json",
  wasm: "application/wasm",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  mp4: "video/mp4",
  webm: "video/webm",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml",
};

/** Content-Type S3 should serve, so browsers run scripts and stream WebAssembly. */
export function contentTypeFor(path: string): string {
  return TYPES[path.toLowerCase().split(".").pop() ?? ""] ?? "application/octet-stream";
}
