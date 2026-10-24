import { MediaCard } from "@/components/library/media-card";
import type { ItemWithCover } from "@/lib/covers";

/** Books you've started, newest first; tapping one opens the reader where you left off. */
export function ContinueReading({ books }: { books: (ItemWithCover & { percent: number })[] }) {
  if (!books.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Continue reading</h2>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
        {books.map((b) => (
          <div key={b.id} className="w-28 shrink-0 snap-start sm:w-36">
            <MediaCard item={b} morph={false} progress={b.percent} href={`/read/${b.id}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
