import { Link } from "next-view-transitions";
import { Cover } from "@/components/library/cover";
import type { ItemWithCover } from "@/lib/covers";
import { isSystemId, SYSTEMS } from "@/lib/games/systems";

/** One tile in the library grid. */
export function MediaCard({
  item,
  morph = true,
  progress,
  href,
  caption,
}: {
  item: ItemWithCover;
  morph?: boolean;
  /** 0–100: draws a reading-progress bar over the cover. */
  progress?: number;
  href?: string;
  /** Replaces the author line (e.g. "42 min left"). */
  caption?: string;
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
        {item.type === "game" && (item.metadata.system || item.metadata.web) ? (
          <span className="absolute top-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {isSystemId(item.metadata.system) ? SYSTEMS[item.metadata.system].label : "Web"}
          </span>
        ) : null}
        {progress !== undefined ? (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-black/30" aria-label={`${progress}% read`}>
            <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
        ) : null}
      </Cover>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.title}</p>
        {caption || item.metadata.author ? (
          <p className="truncate text-xs text-muted-foreground">{caption ?? item.metadata.author}</p>
        ) : null}
      </div>
    </Link>
  );
}
