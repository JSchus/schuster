/** A reading position: EPUB CFI or "page:N" for PDFs, plus 0–100 and when it was recorded (epoch ms). */
export type Spot = { position: string; percent: number; at: number };

export const READABLE_MIME = ["application/epub+zip", "application/pdf"] as const;

/** Formats the in-browser reader can open. */
export function isReadable(mime: string): boolean {
  return (READABLE_MIME as readonly string[]).includes(mime);
}

export function isPdf(mime: string): boolean {
  return mime === "application/pdf";
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function encodePdfPosition(page: number): string {
  return `page:${Math.max(1, Math.floor(page))}`;
}

/** Page number from "page:N", or undefined for anything else. */
export function decodePdfPosition(position: string | undefined): number | undefined {
  const m = position?.match(/^page:(\d+)$/);
  return m ? Math.max(1, Number(m[1])) : undefined;
}

export type Resume = {
  /** Where to open the book. */
  start?: Spot;
  /** Set when `start` came from another device and this device was elsewhere: offer "go back". */
  previous?: Spot;
};

/**
 * Decide where to open a book from this device's last spot (`local`) and the
 * synced one (`server`). The newer wins. If the server copy is newer and more
 * than 1% away, it was read on another device, so remember the local spot to
 * offer "Go back".
 */
export function pickResume(local: Spot | null | undefined, server: Spot | null | undefined): Resume {
  if (!local && !server) return {};
  if (!local) return { start: server! };
  if (!server) return { start: local };
  if (local.at > server.at) return { start: local };
  const moved = local.position !== server.position && Math.abs(server.percent - local.percent) > 1;
  return moved && server.at > local.at ? { start: server, previous: local } : { start: server };
}
