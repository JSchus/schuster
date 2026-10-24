"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  CloudOff,
  List,
  Loader2,
  Settings2,
  X,
} from "lucide-react";
import { Link } from "next-view-transitions";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProgressResponse } from "@/app/api/progress/[itemId]/route";
import { Button } from "@/components/ui/button";
import { readOffline } from "@/lib/reader/offline";
import { isPdf } from "@/lib/reader/progress";
import { cn, formatBytes } from "@/lib/utils";
import { EpubView } from "./epub-view";
import { PdfView } from "./pdf-view";
import { ReaderSettingsPanel } from "./reader-settings";
import { TocPanel } from "./toc-panel";
import { useOfflineBook } from "./use-offline-book";
import { useProgressSync } from "./use-progress-sync";
import { READER_COLORS, useReaderSettings } from "./use-reader-settings";
import type { TocEntry, ViewHandle } from "./view-types";

export type ReaderBook = { id: string; title: string; mime: string; size: number };

type Props = { book: ReaderBook; progress: ProgressResponse; sourceUrl: string };

/**
 * Full-screen reader shell: picks the EPUB or PDF view, and owns the
 * toolbars, contents, settings, "keep offline", and progress sync.
 */
export function Reader({ book, progress, sourceUrl }: Props) {
  const pdf = isPdf(book.mime);
  const { settings, update } = useReaderSettings();
  const sync = useProgressSync(book.id, progress);
  const offline = useOfflineBook(book, sourceUrl);
  const view = useRef<ViewHandle>(null);

  // The offline copy, if any, is checked before touching the network.
  const [data, setData] = useState<ArrayBuffer | undefined | "loading">("loading");
  useEffect(() => {
    readOffline(book.id)
      .then((d) => setData(d))
      .catch(() => setData(undefined));
  }, [book.id]);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);
  const [panel, setPanel] = useState<"toc" | "settings" | null>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [where, setWhere] = useState({ percent: sync.start?.percent ?? 0, label: "" });
  // Latest position, so switching layout (which remounts the view) keeps your place.
  const position = useRef(sync.start?.position);

  const onLocation = useCallback(
    (pos: string, percent: number, label: string) => {
      position.current = pos;
      setWhere({ percent, label });
      sync.record(pos, percent);
    },
    [sync],
  );

  // Hide the toolbars shortly after the book opens.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setChrome(false), 2500);
    return () => clearTimeout(t);
  }, [ready]);

  // Cross-device: announce or offer the other device's spot.
  const { jump, dismissJump } = sync;
  useEffect(() => {
    if (!jump || !ready) return;
    const opened = jump.kind === "opened";
    toast(opened ? `Picked up at ${jump.to.percent}% from another device` : `You're at ${jump.to.percent}% on another device`, {
      duration: 12_000,
      action: {
        label: opened ? `Go back to ${jump.from.percent}%` : "Jump there",
        onClick: () => view.current?.goTo(opened ? jump.from.position : jump.to.position),
      },
    });
    dismissJump();
  }, [jump, ready, dismissJump]);

  const colors = READER_COLORS[settings.theme];
  const View = pdf ? PdfView : EpubView;
  const pageCount = pdf && where.label ? Number(where.label.match(/of (\d+)/)?.[1]) || undefined : undefined;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ background: colors.bg, color: colors.fg, colorScheme: settings.theme === "dark" ? "dark" : "light" }}
    >
      {/* Top bar */}
      <header
        className={cn(
          "absolute inset-x-0 top-0 z-20 flex items-center gap-1 border-b px-2 py-2 transition-transform duration-200",
          !chrome && "-translate-y-full",
        )}
        style={{ background: colors.bg, paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <Button asChild variant="ghost" size="icon" aria-label="Back to book details">
          <Link href={`/items/${book.id}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-medium">{book.title}</h1>
        <Button variant="ghost" size="icon" aria-label="Contents" onClick={() => setPanel(panel === "toc" ? null : "toc")}>
          <List />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Reading settings"
          onClick={() => setPanel(panel === "settings" ? null : "settings")}
        >
          <Settings2 />
        </Button>
        {offline.supported ? (
          <Button
            variant="ghost"
            size="icon"
            disabled={offline.busy}
            onClick={offline.toggle}
            aria-pressed={offline.saved}
            aria-label={offline.saved ? "Remove offline copy" : `Keep offline (${formatBytes(book.size)})`}
            title={offline.saved ? "Kept offline · tap to remove" : `Keep offline (${formatBytes(book.size)})`}
          >
            {offline.busy ? <Loader2 className="animate-spin" /> : offline.saved ? <CloudOff /> : <CloudDownload />}
          </Button>
        ) : null}
      </header>

      {/* Page */}
      <main className="relative min-h-0 flex-1" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        {error ? (
          <div className="grid size-full place-items-center p-6 text-center">
            <div className="grid gap-3">
              <p>Couldn&apos;t open this book{navigator.onLine ? "" : " while offline"}.</p>
              <p className="text-sm opacity-70">{error}</p>
              <Button asChild variant="outline">
                <Link href={`/items/${book.id}`}>Back to the book</Link>
              </Button>
            </div>
          </div>
        ) : data === "loading" ? null : (
          <View
            key={settings.layout}
            ref={view}
            itemId={book.id}
            data={data}
            sourceUrl={sourceUrl}
            start={position.current}
            settings={settings}
            onLocation={onLocation}
            onToc={setToc}
            onReady={() => setReady(true)}
            onError={(err) => setError((err as Error)?.message ?? String(err))}
            onTapCenter={() => setChrome((c) => !c)}
          />
        )}
        {!ready && !error ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin opacity-60" />
          </div>
        ) : null}
      </main>

      {/* Bottom bar */}
      <footer
        className={cn(
          "absolute inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t px-2 py-2 transition-transform duration-200",
          !chrome && "translate-y-full",
        )}
        style={{ background: colors.bg, paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <Button variant="ghost" size="icon" aria-label="Previous page" onClick={() => view.current?.prev()}>
          <ChevronLeft />
        </Button>
        <input
          type="range"
          min={0}
          max={100}
          step={0.5}
          value={where.percent}
          onChange={(e) => setWhere((w) => ({ ...w, percent: Number(e.target.value) }))}
          onPointerUp={(e) => view.current?.goToPercent(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => view.current?.goToPercent(Number((e.target as HTMLInputElement).value))}
          aria-label="Position in book"
          className="min-w-0 flex-1 accent-current"
        />
        <span className="w-24 shrink-0 text-right text-xs tabular-nums opacity-70">
          {pdf && where.label ? where.label.replace("Page ", "") : `${Math.round(where.percent)}%`}
        </span>
        <Button variant="ghost" size="icon" aria-label="Next page" onClick={() => view.current?.next()}>
          <ChevronRight />
        </Button>
      </footer>

      {/* Side panel: contents or settings */}
      {panel ? (
        <>
          <button aria-label="Close" className="fixed inset-0 z-30 bg-black/30" onClick={() => setPanel(null)} />
          <aside
            className="fixed inset-y-0 right-0 z-40 flex w-full max-w-sm flex-col overflow-y-auto border-l bg-background text-foreground shadow-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-medium">{panel === "toc" ? "Contents" : "Reading settings"}</h2>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setPanel(null)}>
                <X />
              </Button>
            </div>
            {panel === "toc" ? (
              <TocPanel
                entries={toc}
                pageCount={pageCount}
                onPick={(target) => {
                  view.current?.goTo(target);
                  setPanel(null);
                }}
              />
            ) : (
              <ReaderSettingsPanel settings={settings} update={update} isPdf={pdf} />
            )}
          </aside>
        </>
      ) : null}
    </div>
  );
}
