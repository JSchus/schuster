"use client";

import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { Link } from "next-view-transitions";
import { canMakeCover } from "@/lib/extract";
import { MediaTypeIcon } from "@/components/library/media-type-icon";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";
import { isFinished, type QueueEntry } from "./use-upload-queue";

const LABELS: Record<QueueEntry["status"], string> = {
  extracting: "Reading metadata…",
  queued: "Waiting…",
  preparing: "Starting…",
  uploading: "Uploading",
  finishing: "Finishing…",
  done: "Done",
  error: "Failed",
  cancelled: "Cancelled",
};

/** One file in the upload queue: thumbnail, title, progress, actions. */
export function UploadRow({ entry, onCancel }: { entry: QueueEntry; onCancel: () => void }) {
  const total = entry.file.size || 1;
  const pct = entry.status === "done" ? 100 : Math.floor((entry.loaded / total) * 100);
  const finished = isFinished(entry.status);

  return (
    <li className="flex items-center gap-3 rounded-lg border p-3">
      <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
        {entry.coverUrl ? (
          <img src={entry.coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <MediaTypeIcon type={entry.info?.type ?? "file"} className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="grid min-w-0 flex-1 gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-medium">{entry.info?.title ?? entry.file.name}</p>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {entry.status === "uploading"
              ? `${formatBytes(entry.loaded)} / ${formatBytes(entry.file.size)}`
              : formatBytes(entry.file.size)}
          </span>
        </div>
        <Progress value={pct} aria-label={`${entry.file.name} ${pct}%`} />
        <p className="flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {entry.status === "done" ? (
            <CheckCircle2 className="size-3.5 text-green-600" />
          ) : entry.status === "error" ? (
            <XCircle className="size-3.5 text-destructive" />
          ) : !finished ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : null}
          {LABELS[entry.status]}
          {entry.status === "uploading" ? ` ${pct}%` : null}
          {entry.error ? <span className="truncate text-destructive">: {entry.error}</span> : null}
        </p>
        {entry.status === "done" ? <CoverNote entry={entry} /> : null}
      </div>
      {entry.status === "done" && entry.itemId ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/items/${entry.itemId}`}>View</Link>
        </Button>
      ) : !finished ? (
        <Button variant="ghost" size="icon" onClick={onCancel} aria-label={`Cancel ${entry.file.name}`}>
          <X />
        </Button>
      ) : null}
    </li>
  );
}

/** Explain a missing cover, so it isn't a silent grey tile. */
function CoverNote({ entry }: { entry: QueueEntry }) {
  const info = entry.info;
  if (!info || info.coverStatus === "ok" || !canMakeCover(info.type, info.mime)) return null;
  return (
    <p className="text-xs text-amber-600 dark:text-amber-400">
      {info.coverStatus === "failed"
        ? "Cover couldn't be created in this browser. Try “Make cover” on the item page."
        : "No cover found in this file."}
    </p>
  );
}
