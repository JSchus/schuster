"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TocEntry } from "./view-types";

type Props = { entries: TocEntry[]; onPick: (target: string) => void; pageCount?: number };

/** Table of contents, plus "go to page" for PDFs. */
export function TocPanel({ entries, onPick, pageCount }: Props) {
  const [page, setPage] = useState("");
  return (
    <div className="grid gap-3 p-4">
      {pageCount ? (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(page);
            if (n >= 1 && n <= pageCount) onPick(`page:${n}`);
          }}
        >
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={pageCount}
            placeholder={`Page (1–${pageCount})`}
            value={page}
            onChange={(e) => setPage(e.target.value)}
          />
          <Button type="submit" variant="outline">
            Go
          </Button>
        </form>
      ) : null}
      {entries.length ? (
        <nav aria-label="Contents" className="grid">
          {entries.map((e, i) => (
            <button
              key={`${e.target}-${i}`}
              onClick={() => onPick(e.target)}
              className="truncate rounded px-2 py-2 text-left text-sm hover:bg-accent"
              style={{ paddingLeft: `${0.5 + e.depth * 1}rem` }}
            >
              {e.label}
            </button>
          ))}
        </nav>
      ) : (
        <p className="text-sm text-muted-foreground">This book has no table of contents.</p>
      )}
    </div>
  );
}
