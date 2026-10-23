"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dropzone } from "./dropzone";
import { UploadRow } from "./upload-row";
import { useUploadQueue } from "./use-upload-queue";

/** Upload page body: dropzone + live queue. */
export function UploadQueue() {
  const { entries, add, cancel, clearFinished, busy } = useUploadQueue();

  // Warn before closing the tab mid-upload.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [busy]);

  return (
    <div className="grid gap-6">
      <Dropzone onFiles={add} />
      {entries.length ? (
        <section className="grid gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Queue</h2>
            <Button variant="ghost" size="sm" onClick={clearFinished}>
              Clear finished
            </Button>
          </div>
          <ul className="grid gap-2">
            {entries.map((e) => (
              <UploadRow key={e.id} entry={e} onCancel={() => cancel(e.id)} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
