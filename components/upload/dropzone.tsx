"use client";

import { UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Drag-and-drop target that also opens the file picker on click/keyboard. */
export function Dropzone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Choose files to upload, or drop them here"
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) onFiles(files);
      }}
      className={cn(
        "grid cursor-pointer place-items-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors outline-none",
        "hover:border-primary/60 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        over && "border-primary bg-primary/5",
      )}
    >
      <UploadCloud className="size-10 text-muted-foreground" />
      <div>
        <p className="font-medium">Drop files here, or tap to choose</p>
        <p className="text-sm text-muted-foreground">
          Books (EPUB, PDF), video, audio, game ROMs, or any file. Large files are fine.
        </p>
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
    </div>
  );
}
