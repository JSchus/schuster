import { Link } from "next-view-transitions";
import { libraryHref, type LibraryParams } from "@/components/library/filter-link";
import { MediaTypeIcon } from "@/components/library/media-type-icon";
import { MEDIA_TYPE_LABELS, MEDIA_TYPES } from "@/lib/media-types";
import { cn } from "@/lib/utils";

const chip =
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-accent";

/** Type chips (All / Books / Video / ...), preserving search and tag. */
export function TypeFilter({ params }: { params: LibraryParams }) {
  return (
    <nav aria-label="Filter by type" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      <Link
        href={libraryHref({ ...params, type: undefined })}
        className={cn(chip, !params.type && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
        aria-current={!params.type ? "page" : undefined}
      >
        All
      </Link>
      {MEDIA_TYPES.map((t) => {
        const active = params.type === t;
        return (
          <Link
            key={t}
            href={libraryHref({ ...params, type: t })}
            className={cn(chip, active && "border-primary bg-primary text-primary-foreground hover:bg-primary/90")}
            aria-current={active ? "page" : undefined}
          >
            <MediaTypeIcon type={t} className="size-4" />
            {MEDIA_TYPE_LABELS[t]}
          </Link>
        );
      })}
    </nav>
  );
}
