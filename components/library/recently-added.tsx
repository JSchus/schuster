import { MediaCard } from "@/components/library/media-card";
import type { ItemWithCover } from "@/lib/covers";

/**
 * Horizontal strip of the newest items. Cards here don't get a
 * view-transition name: the same item may also be in the grid below, and
 * duplicate names would cancel the transition.
 */
export function RecentlyAdded({ items }: { items: ItemWithCover[] }) {
  if (!items.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Recently added</h2>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
        {items.map((item) => (
          <div key={item.id} className="w-28 shrink-0 snap-start sm:w-36">
            <MediaCard item={item} morph={false} />
          </div>
        ))}
      </div>
    </section>
  );
}
