"use client";

import type { Book, Location, NavItem, Rendition } from "epubjs";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { READER_COLORS, type ReaderSettings } from "./use-reader-settings";
import type { TocEntry, ViewHandle, ViewProps } from "./view-types";

const FONTS = {
  serif: 'Charter, "Iowan Old Style", Georgia, "Times New Roman", serif',
  sans: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/**
 * EPUB rendering with epub.js. Positions are CFIs; percent comes from
 * generated "locations" (cached per book in localStorage, since generating
 * them walks the whole book), estimated from the chapter until they're ready.
 *
 * The parent remounts this view when the layout (pages/scroll) changes,
 * because epub.js can't switch flow on a live rendition.
 */
export const EpubView = forwardRef<ViewHandle, ViewProps>(function EpubView(
  { itemId, data, sourceUrl, start, settings, onLocation, onToc, onReady, onError, onTapCenter },
  ref,
) {
  const host = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const book = useRef<Book | null>(null);
  const callbacks = useRef({ onLocation, onToc, onReady, onError, onTapCenter });
  callbacks.current = { onLocation, onToc, onReady, onError, onTapCenter };

  useImperativeHandle(ref, () => ({
    next: () => void rendition.current?.next(),
    prev: () => void rendition.current?.prev(),
    goTo: (target) => void rendition.current?.display(target),
    goToPercent: (pct) => {
      const b = book.current;
      if (!b?.locations.length()) return;
      void rendition.current?.display(b.locations.cfiFromPercentage(pct / 100));
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let destroy = () => {};
    (async () => {
      const { default: ePub } = await import("epubjs");
      if (cancelled || !host.current) return;
      // EPUBs are small: load the whole file (needed for locations anyway).
      const bytes = data ?? (await (await fetch(sourceUrl)).arrayBuffer());
      if (cancelled || !host.current) return;
      const b = ePub(bytes);
      book.current = b;
      const scroll = settings.layout === "scroll";
      const r = b.renderTo(host.current, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: scroll ? "scrolled" : "paginated",
        manager: scroll ? "continuous" : "default",
        allowScriptedContent: false,
      });
      rendition.current = r;
      destroy = () => b.destroy();

      for (const [name, c] of Object.entries(READER_COLORS)) {
        r.themes.register(name, {
          body: { background: `${c.bg} !important`, color: `${c.fg} !important` },
          "a, a:visited": { color: "inherit !important" },
        });
      }
      applySettings(r, settings);

      const locationsKey = `epub-locations:${itemId}`;
      const percentOf = (loc: Location) => {
        if (b.locations.length()) return b.locations.percentageFromCfi(loc.start.cfi) * 100;
        return (loc.start.index / Math.max(1, (b.spine as unknown as { length: number }).length)) * 100;
      };
      const labelOf = (loc: Location) => {
        const page = loc.start.displayed;
        return page ? `Page ${page.page} of ${page.total} in this chapter` : "";
      };
      r.on("relocated", (loc: Location) => {
        callbacks.current.onLocation(loc.start.cfi, percentOf(loc), labelOf(loc));
      });

      // Keyboard: the chapter iframe swallows key events, so listen there too.
      r.on("keyup", (e: KeyboardEvent) => {
        if (e.key === "ArrowRight") void r.next();
        if (e.key === "ArrowLeft") void r.prev();
      });
      // Swipe and tap inside the chapter iframe.
      let touchX: number | null = null;
      r.on("touchstart", (e: TouchEvent) => (touchX = e.changedTouches[0]?.screenX ?? null));
      r.on("touchend", (e: TouchEvent) => {
        const end = e.changedTouches[0]?.screenX;
        if (touchX === null || end === undefined || scroll) return;
        const dx = end - touchX;
        if (Math.abs(dx) > 50) void (dx < 0 ? r.next() : r.prev());
        touchX = null;
      });
      r.on("click", (e: MouseEvent) => {
        if ((e.target as Element | null)?.closest?.("a")) return;
        callbacks.current.onTapCenter();
      });

      try {
        await r.display(start || undefined);
      } catch {
        await r.display(); // stale or invalid CFI: open at the start
      }
      if (cancelled) return;
      callbacks.current.onReady();

      void b.loaded.navigation.then((nav) => callbacks.current.onToc(toToc(nav.toc)));

      // Locations: load cached, else generate in the background.
      await b.ready;
      const cached = localStorage.getItem(locationsKey);
      if (cached) {
        b.locations.load(cached);
      } else {
        await b.locations.generate(1600);
        try {
          localStorage.setItem(locationsKey, b.locations.save());
        } catch {}
      }
      const current = r.currentLocation() as unknown as Location | undefined;
      if (!cancelled && current?.start) callbacks.current.onLocation(current.start.cfi, percentOf(current), labelOf(current));
    })().catch((err) => {
      if (!cancelled) callbacks.current.onError(err);
    });
    return () => {
      cancelled = true;
      destroy();
      rendition.current = null;
      book.current = null;
    };
    // Remounted (via key) for layout changes; other settings apply live below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, itemId, sourceUrl]);

  useEffect(() => {
    if (rendition.current) applySettings(rendition.current, settings);
  }, [settings]);

  // Arrow keys while focus is on the page around the book (not in the iframe).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") void rendition.current?.next();
      if (e.key === "ArrowLeft" || e.key === "PageUp") void rendition.current?.prev();
    };
    window.addEventListener("keyup", onKey);
    return () => window.removeEventListener("keyup", onKey);
  }, []);

  // A comfortable reading column, clear of the (overlaying) top and bottom bars.
  return (
    <div className="mx-auto size-full max-w-3xl px-5 pt-14 pb-14 sm:px-8">
      <div ref={host} className="size-full" />
    </div>
  );
});

function applySettings(r: Rendition, s: ReaderSettings) {
  r.themes.select(s.theme);
  r.themes.fontSize(`${s.fontSize}%`);
  r.themes.font(FONTS[s.font]);
}

function toToc(items: NavItem[], depth = 0): TocEntry[] {
  return items.flatMap((i) => [
    { label: i.label.trim(), target: i.href, depth },
    ...toToc(i.subitems ?? [], depth + 1),
  ]);
}
