"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BOOKS_CACHE, isOffline, readerPageKey, removeOffline, saveOffline } from "@/lib/reader/offline";
import { formatBytes } from "@/lib/utils";

/** "Keep offline" state and toggle for one book. */
export function useOfflineBook(book: { id: string; title: string; mime: string; size: number }, sourceUrl: string) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== "undefined" && "caches" in window;

  useEffect(() => setSaved(isOffline(book.id)), [book.id]);

  const toggle = useCallback(async () => {
    if (!supported) return void toast.error("This browser can't keep books offline.");
    setBusy(true);
    try {
      if (saved) {
        await removeOffline(book.id);
        setSaved(false);
        toast("Removed from offline books");
        return;
      }
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      if (estimate?.quota && estimate.usage !== undefined && estimate.quota - estimate.usage < book.size * 1.2) {
        return void toast.error(`Not enough space on this device for ${formatBytes(book.size)}.`);
      }
      const res = await fetch(sourceUrl);
      if (!res.ok) throw new Error(`Download failed (${res.status})`);
      await saveOffline({ id: book.id, title: book.title, mime: book.mime }, await res.arrayBuffer());
      // Also keep the reader page, so /read/{id} opens offline even if it was
      // reached by in-app navigation (which the service worker never sees).
      const page = await fetch(readerPageKey(book.id), { credentials: "same-origin" }).catch(() => undefined);
      if (page?.ok) await (await caches.open(BOOKS_CACHE)).put(readerPageKey(book.id), page);
      // Ask the browser not to evict it under storage pressure.
      void navigator.storage?.persist?.();
      setSaved(true);
      toast.success(`Saved for offline reading (${formatBytes(book.size)})`);
    } catch (err) {
      toast.error((err as Error).message || "Couldn't save offline");
    } finally {
      setBusy(false);
    }
  }, [book, saved, sourceUrl, supported]);

  return { saved, busy, supported, toggle };
}
