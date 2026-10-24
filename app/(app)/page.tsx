import { SearchX } from "lucide-react";
import { Link } from "next-view-transitions";
import { MediaGrid } from "@/components/library/media-grid";
import { ContinueShelf } from "@/components/library/continue-shelf";
import { RecentlyAdded } from "@/components/library/recently-added";
import { ShelfStrip } from "@/components/shelves/shelf-strip";
import { SearchBox } from "@/components/library/search-box";
import { TagFilter } from "@/components/library/tag-filter";
import { TypeFilter } from "@/components/library/type-filter";
import { Button } from "@/components/ui/button";
import { withCoverUrls } from "@/lib/covers";
import { auth } from "@/auth";
import { allTags, continueReading, listItems, recentItems } from "@/lib/db/queries";
import { listShelves } from "@/lib/db/shelves";
import type { Viewer } from "@/lib/permissions";
import { isMediaType, MEDIA_TYPE_LABELS } from "@/lib/media-types";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;

/** Library: type chips, search, tags, "recently added", and the cover grid. */
export default async function LibraryPage({ searchParams }: Props) {
  const sp = await searchParams;
  const rawType = one(sp.type);
  const params = {
    type: isMediaType(rawType) ? rawType : undefined,
    q: one(sp.q)?.slice(0, 200),
    tag: one(sp.tag)?.toLowerCase(),
  };
  const filtered = Boolean(params.type || params.q || params.tag);

  const session = await auth();
  const user = session?.user;
  if (!user) return null; // the layout redirects to /login
  const [items, recent, tags, reading, shelves] = await Promise.all([
    listItems(user, params).then(withCoverUrls),
    filtered ? Promise.resolve([]) : recentItems(user, 12).then(withCoverUrls),
    allTags(user, 30),
    filtered ? Promise.resolve([]) : readingShelf(user),
    filtered ? Promise.resolve([]) : listShelves(user),
  ]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          {params.type ? MEDIA_TYPE_LABELS[params.type] : "Library"}
        </h1>
        <SearchBox params={params} />
      </div>
      <TypeFilter params={params} />
      <TagFilter tags={tags} params={params} />

      <ContinueShelf items={reading} />
      <ShelfStrip shelves={shelves} />
      {!filtered && items.length > recent.length ? <RecentlyAdded items={recent} /> : null}

      {items.length ? (
        <section className="grid gap-3">
          {!filtered ? <h2 className="text-lg font-semibold tracking-tight">Everything</h2> : null}
          <MediaGrid items={items} />
        </section>
      ) : (
        <EmptyState filtered={filtered} />
      )}
    </div>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
      <SearchX className="size-8 text-muted-foreground" />
      <p className="text-muted-foreground">
        {filtered ? "Nothing matches those filters." : "The library is empty. Add the first thing!"}
      </p>
      <Button asChild variant={filtered ? "outline" : "default"}>
        <Link href={filtered ? "/" : "/upload"}>{filtered ? "Clear filters" : "Upload media"}</Link>
      </Button>
    </div>
  );
}

async function readingShelf(viewer: Viewer) {
  const rows = await continueReading(viewer);
  const withCovers = await withCoverUrls(rows.map((r) => r.item));
  return withCovers.map((item, i) => ({ ...item, percent: rows[i]!.percent ?? 0 }));
}
