import { MediaCard } from "@/components/library/media-card";
import type { ItemWithCover } from "@/lib/covers";

/** Responsive cover grid: 2 → 3 → 4 → 6 columns. */
export function MediaGrid({ items }: { items: ItemWithCover[] }) {
  return (
    <div className="grid grid-cols-2 items-end gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => (
        <MediaCard key={item.id} item={item} />
      ))}
    </div>
  );
}
