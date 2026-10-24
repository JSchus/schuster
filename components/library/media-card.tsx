import { Link } from "next-view-transitions";
import { Cover } from "@/components/library/cover";
import type { ItemWithCover } from "@/lib/covers";

/** One tile in the library grid. */
export function MediaCard({
  item,
  morph = true,
  progress,
  href,
}: {
  item: ItemWithCover;
  morph?: boolean;
  /** 0–100: draws a reading-progress bar over the cover. */
  progress?: number;
  href?: string;
}) {
  return (
    <Link href={href ?? `/items/${item.id}`} className="group grid gap-2 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      <Cover
        url={item.coverUrl}
        title={item.title}
        type={item.type}
        transitionName={morph ? `cover-${item.id}` : undefined}
        className="shadow-sm transition-transform group-hover:-translate-y-0.5 group-hover:shadow-md"
      >
        {progress !== undefined ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30" aria-label={`${progress}% read`}>
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </Cover>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        {item.metadata.author ? (
          <p className="truncate text-xs text-muted-foreground">{item.metadata.author}</p>
        ) : null}
      </div>
    </Link>
  );
}
