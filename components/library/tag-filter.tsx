import { X } from "lucide-react";
import { Link } from "next-view-transitions";
import { libraryHref, type LibraryParams } from "@/components/library/filter-link";
import { Badge } from "@/components/ui/badge";

/** Most-used tags as toggleable chips. */
export function TagFilter({ tags, params }: { tags: { tag: string; count: number }[]; params: LibraryParams }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Filter by tag">
      {tags.map(({ tag, count }) => {
        const active = params.tag === tag;
        return (
          <Badge key={tag} asChild variant={active ? "default" : "secondary"}>
            <Link href={libraryHref({ ...params, tag: active ? undefined : tag })} aria-pressed={active}>
              #{tag}
              {active ? <X /> : <span className="opacity-60">{count}</span>}
            </Link>
          </Badge>
        );
      })}
    </div>
  );
}
