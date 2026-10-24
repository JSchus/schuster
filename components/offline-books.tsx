"use client";

import { BookOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { listOffline, type OfflineBook } from "@/lib/reader/offline";
import { formatBytes } from "@/lib/utils";

/** Books saved with "Keep offline" on this device. Plain links: they work without the app router. */
export function OfflineBooks() {
  const [books, setBooks] = useState<OfflineBook[]>([]);
  useEffect(() => setBooks(listOffline()), []);
  if (!books.length) return null;
  return (
    <section className="grid w-full max-w-sm gap-2 text-left">
      <h2 className="text-sm font-medium text-muted-foreground">Books on this device</h2>
      <ul className="grid gap-1">
        {books.map((b) => (
          <li key={b.id}>
            <a href={`/read/${b.id}`} className="flex items-center gap-3 rounded-md border p-3 hover:bg-accent">
              <BookOpen className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{b.title}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(b.size)}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
