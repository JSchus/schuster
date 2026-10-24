"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProgressResponse } from "@/app/api/progress/[itemId]/route";
import { clampPercent, pickResume, type Resume, type Spot } from "@/lib/reader/progress";

const localKey = (id: string) => `progress:${id}`;
const pendingKey = (id: string) => `progress-pending:${id}`;
const SAVE_DELAY = 2000;
const REFRESH_AFTER = 5 * 60 * 1000;

function readLocal(id: string, key = localKey(id)): Spot | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: Spot | null) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {}
}

/**
 * opened: we opened at another device's newer spot (offer "go back").
 * available: another device moved ahead while this tab was away (offer "jump").
 */
export type Jump = { kind: "opened" | "available"; to: Spot; from: Spot };

const fromServer = (p: ProgressResponse): Spot | null =>
  p ? { position: p.position, percent: p.percent, at: p.updatedAt } : null;

/**
 * Reading-position sync:
 * - every move is saved to localStorage at once (works offline, survives reloads);
 * - the server gets a debounced PUT, plus a sendBeacon when the page is hidden;
 * - failed saves stay "pending" and are retried when back online;
 * - on open (and when the tab returns after a while) the newer of this
 *   device's spot and the synced one wins, with "go back" offered if another
 *   device had moved ahead.
 */
export function useProgressSync(itemId: string, initialServer: ProgressResponse) {
  const [resume] = useState<Resume>(() =>
    typeof window === "undefined" ? {} : pickResume(readLocal(itemId), fromServer(initialServer)),
  );
  const [jump, setJump] = useState<Jump | null>(
    resume.start && resume.previous ? { kind: "opened", to: resume.start, from: resume.previous } : null,
  );
  const latest = useRef<Spot | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hiddenAt = useRef<number | null>(null);
  const url = `/api/progress/${itemId}`;

  const send = useCallback(
    async (spot: Spot) => {
      try {
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(spot),
          keepalive: true,
        });
        if (!res.ok && res.status >= 500) throw new Error(String(res.status));
        // Only clear if nothing newer was queued meanwhile.
        if (readLocal(itemId, pendingKey(itemId))?.at === spot.at) writeLocal(pendingKey(itemId), null);
      } catch {
        // Offline or server hiccup: stays pending, flushed on "online".
      }
    },
    [itemId, url],
  );

  /** Call on every page turn. */
  const record = useCallback(
    (position: string, percent: number) => {
      const spot: Spot = { position, percent: clampPercent(percent), at: Date.now() };
      latest.current = spot;
      writeLocal(localKey(itemId), spot);
      writeLocal(pendingKey(itemId), spot);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void send(spot), SAVE_DELAY);
    },
    [itemId, send],
  );

  useEffect(() => {
    const flushPending = () => {
      const pending = readLocal(itemId, pendingKey(itemId));
      if (pending && navigator.onLine) void send(pending);
    };
    const beacon = () => {
      const pending = readLocal(itemId, pendingKey(itemId));
      if (!pending) return;
      clearTimeout(timer.current);
      // A queued beacon isn't a delivered one (it can fail offline), so the
      // pending copy stays until a confirmed save; duplicates are harmless
      // because the server ignores anything that isn't newer.
      navigator.sendBeacon?.(url, new Blob([JSON.stringify(pending)], { type: "text/plain" }));
    };
    const onVisibility = async () => {
      if (document.visibilityState === "hidden") {
        hiddenAt.current = Date.now();
        beacon();
        return;
      }
      // Back after a while: another device may have moved on.
      if (hiddenAt.current && Date.now() - hiddenAt.current > REFRESH_AFTER && navigator.onLine) {
        try {
          const server = fromServer(await (await fetch(url, { cache: "no-store" })).json());
          const choice = pickResume(latest.current ?? readLocal(itemId), server);
          if (choice.start && choice.previous) {
            setJump({ kind: "available", to: choice.start, from: choice.previous });
          }
        } catch {}
      }
      hiddenAt.current = null;
    };

    flushPending();
    window.addEventListener("online", flushPending);
    window.addEventListener("pagehide", beacon);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("online", flushPending);
      window.removeEventListener("pagehide", beacon);
      document.removeEventListener("visibilitychange", onVisibility);
      clearTimeout(timer.current);
    };
  }, [itemId, send, url]);

  return {
    /** Where to open the book. */
    start: resume.start,
    /** Non-null when another device's newer spot should be offered/announced. */
    jump,
    dismissJump: () => setJump(null),
    record,
  };
}
