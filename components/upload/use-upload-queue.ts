"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { extractFileInfo, type Extracted } from "@/lib/extract";
import { browserTransport } from "@/lib/upload/api-client";
import { uploadFile, type UploadPhase } from "@/lib/upload/uploader";

export type QueueStatus = "extracting" | "queued" | UploadPhase | "cancelled";

export type QueueEntry = {
  id: string;
  file: File;
  status: QueueStatus;
  loaded: number;
  info?: Extracted;
  coverUrl?: string;
  itemId?: string;
  error?: string;
};

/** Files uploaded at once; each file also runs parallel part uploads. */
const FILE_CONCURRENCY = 2;

/**
 * Upload queue state machine:
 * extracting → queued → preparing → uploading → finishing → done | error | cancelled
 */
export function useUploadQueue() {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const active = useRef(0);
  // Guards against double-starts (React Strict Mode runs effects twice).
  const started = useRef(new Set<string>());

  const patch = useCallback((id: string, p: Partial<QueueEntry>) => {
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...p } : e)));
  }, []);

  const start = useCallback(
    async (entry: QueueEntry) => {
      const info = entry.info!;
      const ctrl = new AbortController();
      controllers.current.set(entry.id, ctrl);
      active.current++;
      try {
        const { itemId } = await uploadFile({
          file: entry.file,
          cover: info.cover,
          signal: ctrl.signal,
          transport: browserTransport,
          request: {
            filename: entry.file.name,
            size: entry.file.size,
            mime: info.mime,
            type: info.type,
            title: info.title,
            description: info.description,
            tags: info.tags,
            metadata: stripUndefined(info.metadata),
          },
          onProgress: (p) => patch(entry.id, { status: p.phase, loaded: p.loaded }),
        });
        patch(entry.id, { status: "done", itemId });
      } catch (err) {
        patch(entry.id, ctrl.signal.aborted
          ? { status: "cancelled" }
          : { status: "error", error: (err as Error).message });
      } finally {
        controllers.current.delete(entry.id);
        active.current--;
      }
    },
    [patch],
  );

  // Pump: start queued entries while below the concurrency limit.
  useEffect(() => {
    for (const e of entries) {
      if (active.current >= FILE_CONCURRENCY) break;
      if (e.status === "queued" && !started.current.has(e.id)) {
        started.current.add(e.id);
        patch(e.id, { status: "preparing" });
        void start(e);
      }
    }
  }, [entries, patch, start]);

  const add = useCallback(
    (files: Iterable<File>) => {
      const fresh = Array.from(files, (file) => ({
        id: crypto.randomUUID(),
        file,
        status: "extracting" as const,
        loaded: 0,
      }));
      setEntries((list) => [...fresh, ...list]);
      for (const entry of fresh) {
        void extractFileInfo(entry.file).then((info) =>
          setEntries((list) =>
            list.map((e) =>
              // Skip if the user cancelled while metadata was being read.
              e.id === entry.id && e.status === "extracting"
                ? {
                    ...e,
                    info,
                    status: "queued",
                    coverUrl: info.cover ? URL.createObjectURL(info.cover) : undefined,
                  }
                : e,
            ),
          ),
        );
      }
    },
    [],
  );

  const cancel = useCallback(
    (id: string) => {
      const ctrl = controllers.current.get(id);
      if (ctrl) ctrl.abort();
      else patch(id, { status: "cancelled" });
    },
    [patch],
  );

  const clearFinished = useCallback(() => {
    setEntries((list) => {
      for (const e of list) if (isFinished(e.status) && e.coverUrl) URL.revokeObjectURL(e.coverUrl);
      return list.filter((e) => !isFinished(e.status));
    });
  }, []);

  // Cancel in-flight uploads if the page unmounts.
  useEffect(() => {
    const ctrls = controllers.current;
    return () => ctrls.forEach((c) => c.abort());
  }, []);

  const busy = entries.some((e) => !isFinished(e.status));
  return { entries, add, cancel, clearFinished, busy };
}

export function isFinished(s: QueueStatus) {
  return s === "done" || s === "error" || s === "cancelled";
}

function stripUndefined<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
