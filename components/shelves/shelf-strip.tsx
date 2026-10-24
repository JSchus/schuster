import { Library, Lock, Users } from "lucide-react";
import { Link } from "next-view-transitions";
import type { ShelfSummary } from "@/lib/db/shelves";

/** Shelf chips on the library page; links to each shelf and to "all shelves". */
export function ShelfStrip({ shelves }: { shelves: ShelfSummary[] }) {
  if (!shelves.length) return null;
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Shelves</h2>
        <Link href="/shelves" className="text-sm text-muted-foreground hover:underline">
          All shelves
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {shelves.map((s) => (
          <Link
            key={s.id}
            href={`/shelves/${s.id}`}
            className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <ShelfIcon visibility={s.visibility} />
            <span className="font-medium">{s.name}</span>
            <span className="text-muted-foreground">{s.items}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function ShelfIcon({ visibility }: { visibility: ShelfSummary["visibility"] }) {
  const Icon = visibility === "private" ? Lock : visibility === "people" ? Users : Library;
  return <Icon className="size-4 text-muted-foreground" aria-hidden />;
}
