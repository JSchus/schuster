"use client";

import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { decodePdfPosition, encodePdfPosition } from "@/lib/reader/progress";
import { cn } from "@/lib/utils";
import type { TocEntry, ViewHandle, ViewProps } from "./view-types";

/** Colour treatment for page canvases (PDFs have no reflowable text to restyle). */
const FILTERS = { light: "none", sepia: "sepia(0.35) brightness(0.97)", dark: "invert(0.9) hue-rotate(180deg)" };

/**
 * PDF rendering with pdf.js (legacy build, for older iPads). Online it
 * streams from the presigned URL using Range requests; kept-offline books
 * open from memory. Positions are "page:N".
 *
 * Pages layout: one page at a time, fit to the screen, tap/swipe/keys to turn.
 * Scroll layout: every page stacked, rendered as it scrolls into view.
 */
export const PdfView = forwardRef<ViewHandle, ViewProps>(function PdfView(
  { data, sourceUrl, start, settings, onLocation, onToc, onReady, onError, onTapCenter },
  ref,
) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(() => decodePdfPosition(start) ?? 1);
  const scroll = settings.layout === "scroll";
  const callbacks = useRef({ onLocation, onToc, onReady, onError });
  callbacks.current = { onLocation, onToc, onReady, onError };
  const scroller = useRef<HTMLDivElement>(null);

  const total = doc?.numPages ?? 0;
  const go = useCallback(
    (n: number) => {
      if (!total) return;
      const p = Math.min(total, Math.max(1, n));
      setPage(p);
      if (scroll) scroller.current?.querySelector(`[data-page="${p}"]`)?.scrollIntoView();
    },
    [total, scroll],
  );

  useImperativeHandle(ref, () => ({
    next: () => go(page + 1),
    prev: () => go(page - 1),
    goTo: (target) => go(decodePdfPosition(target) ?? Number(target)),
    goToPercent: (pct) => go(Math.round((pct / 100) * total) || 1),
  }));

  // Open the document.
  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | undefined;
    (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const task = pdfjs.getDocument(
        data
          ? { data: new Uint8Array(data.slice(0)) }
          : { url: sourceUrl, rangeChunkSize: 512 * 1024, disableAutoFetch: true },
      );
      opened = await task.promise;
      if (cancelled) return void opened.destroy();
      setDoc(opened);
      setPage((p) => Math.min(p, opened!.numPages));
      callbacks.current.onReady();
      const outline = await opened.getOutline().catch(() => null);
      callbacks.current.onToc(await outlineToToc(opened, outline ?? []));
    })().catch((err) => !cancelled && callbacks.current.onError(err));
    return () => {
      cancelled = true;
      void opened?.destroy();
    };
  }, [data, sourceUrl]);

  // Report position on every page change.
  useEffect(() => {
    if (total) callbacks.current.onLocation(encodePdfPosition(page), (page / total) * 100, `Page ${page} of ${total}`);
  }, [page, total]);

  // Keyboard paging.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") go(page + 1);
      if (e.key === "ArrowLeft" || e.key === "PageUp") go(page - 1);
    };
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, [go, page]);

  // Scroll layout: jump to the starting page once, then track the most visible page.
  useEffect(() => {
    if (!scroll || !doc || !scroller.current) return;
    scroller.current.querySelector(`[data-page="${page}"]`)?.scrollIntoView();
    const io = new IntersectionObserver(
      (entries) => {
        const best = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (best) setPage(Number((best.target as HTMLElement).dataset.page));
      },
      { root: scroller.current, threshold: [0.5] },
    );
    scroller.current.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
    // Only when the document or layout changes, not on every page update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroll, doc]);

  const filter = FILTERS[settings.theme];
  if (!doc) return <div className="size-full" />;

  if (scroll) {
    return (
      <div ref={scroller} className="size-full overflow-y-auto" onClick={onTapCenter}>
        <div className="mx-auto flex max-w-4xl flex-col gap-3 py-4">
          {Array.from({ length: total }, (_, i) => (
            <PdfPage key={i + 1} doc={doc} number={i + 1} fit="width" lazy filter={filter} zoom={settings.fontSize} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <SwipeArea onSwipe={(dir) => go(page + dir)} onTap={(zone) => (zone === 0 ? onTapCenter() : go(page + zone))}>
      <PdfPage doc={doc} number={page} fit="page" filter={filter} zoom={settings.fontSize} />
    </SwipeArea>
  );
});

/** One rendered page, sharp on high-DPI screens. `zoom` is the reader font size (100 = fit). */
function PdfPage({
  doc,
  number,
  fit,
  lazy,
  filter,
  zoom,
}: {
  doc: PDFDocumentProxy;
  number: number;
  fit: "page" | "width";
  lazy?: boolean;
  filter: string;
  zoom: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(!lazy);
  const [aspect, setAspect] = useState(1.4142);

  useEffect(() => {
    if (!lazy || !wrap.current) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: "800px 0px" });
    io.observe(wrap.current);
    return () => io.disconnect();
  }, [lazy]);

  useEffect(() => {
    if (!visible || !wrap.current || !canvas.current) return;
    let task: RenderTask | undefined;
    let cancelled = false;
    void doc.getPage(number).then((p) => {
      if (cancelled || !wrap.current || !canvas.current) return;
      const base = p.getViewport({ scale: 1 });
      setAspect(base.height / base.width);
      const box = wrap.current.parentElement!.getBoundingClientRect();
      const fitScale =
        fit === "width" ? box.width / base.width : Math.min(box.width / base.width, box.height / base.height);
      const scale = fitScale * (zoom / 100);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const vp = p.getViewport({ scale: scale * dpr });
      const c = canvas.current;
      c.width = Math.floor(vp.width);
      c.height = Math.floor(vp.height);
      c.style.width = `${Math.floor(vp.width / dpr)}px`;
      c.style.height = `${Math.floor(vp.height / dpr)}px`;
      task = p.render({ canvasContext: c.getContext("2d")!, viewport: vp });
      task.promise.catch(() => {});
    });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, number, visible, fit, zoom]);

  return (
    <div
      ref={wrap}
      data-page={number}
      className={cn("flex justify-center", fit === "page" && "size-full items-center")}
      style={lazy && !visible ? { aspectRatio: `1 / ${aspect}` } : undefined}
    >
      <canvas ref={canvas} className="bg-white shadow" style={{ filter }} aria-label={`Page ${number}`} />
    </div>
  );
}

/** Left/right thirds turn pages, the middle toggles the toolbar; horizontal swipes turn pages. */
function SwipeArea({
  children,
  onSwipe,
  onTap,
}: {
  children: React.ReactNode;
  onSwipe: (dir: 1 | -1) => void;
  onTap: (zone: -1 | 0 | 1) => void;
}) {
  const startX = useRef<number | null>(null);
  return (
    <div
      className="size-full touch-pan-y overflow-auto select-none"
      onPointerDown={(e) => (startX.current = e.clientX)}
      onPointerUp={(e) => {
        const dx = startX.current === null ? 0 : e.clientX - startX.current;
        startX.current = null;
        if (Math.abs(dx) > 50) return onSwipe(dx < 0 ? 1 : -1);
        const third = e.currentTarget.clientWidth / 3;
        const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
        onTap(x < third ? -1 : x > 2 * third ? 1 : 0);
      }}
    >
      {children}
    </div>
  );
}

type OutlineNode = { title: string; dest: string | unknown[] | null; items: OutlineNode[] };

async function outlineToToc(doc: PDFDocumentProxy, nodes: OutlineNode[], depth = 0): Promise<TocEntry[]> {
  const out: TocEntry[] = [];
  for (const n of nodes) {
    try {
      const dest = typeof n.dest === "string" ? await doc.getDestination(n.dest) : n.dest;
      const ref = dest?.[0];
      const index = ref && typeof ref === "object" ? await doc.getPageIndex(ref as never) : undefined;
      if (index !== undefined) out.push({ label: n.title, target: encodePdfPosition(index + 1), depth });
    } catch {}
    out.push(...(await outlineToToc(doc, n.items ?? [], depth + 1)));
  }
  return out;
}
