import type { ReaderSettings } from "./use-reader-settings";

/** One table-of-contents line. `target` is an EPUB href or a PDF page number. */
export type TocEntry = { label: string; target: string; depth: number };

/** Imperative controls the reader shell uses on either view. */
export type ViewHandle = {
  next(): void;
  prev(): void;
  /** Go to a saved position or a TOC target. */
  goTo(target: string): void;
  goToPercent(percent: number): void;
};

export type ViewProps = {
  itemId: string;
  /** The book file, when kept offline. Otherwise the view loads `sourceUrl`. */
  data?: ArrayBuffer;
  /** Presigned S3 URL (PDFs stream it with Range requests). */
  sourceUrl: string;
  /** Saved position to open at (CFI or "page:N"). */
  start?: string;
  settings: ReaderSettings;
  onLocation(position: string, percent: number, label: string): void;
  onToc(entries: TocEntry[]): void;
  onReady(): void;
  onError(err: unknown): void;
  /** Tap in the middle of the page: show/hide the toolbars. */
  onTapCenter(): void;
};
