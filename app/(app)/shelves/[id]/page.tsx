import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "next-view-transitions";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { MediaGrid } from "@/components/library/media-grid";
import { ShelfIcon } from "@/components/shelves/shelf-strip";
import { ShelfForm } from "@/components/shelves/shelf-form";
import { Button } from "@/components/ui/button";
import { withCoverUrls } from "@/lib/covers";
import { listPeople } from "@/lib/db/people";
import { listItems } from "@/lib/db/queries";
import { getShelf, getShelfAccess, shelfItemIds } from "@/lib/db/shelves";
import { canEdit, VISIBILITY_LABELS, type Viewer } from "@/lib/permissions";

type Props = { params: Promise<{ id: string }> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function load(id: string, user: Viewer | undefined) {
  if (!UUID.test(id) || !user) return undefined;
  return getShelf(id, user);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shelf = await load((await params).id, (await auth())?.user);
  return { title: shelf?.name ?? "Not found" };
}

/** One shelf: its items (only those the visitor may see) and, for its owner, settings. */
export default async function ShelfPage({ params }: Props) {
  const user = (await auth())?.user;
  const shelf = await load((await params).id, user);
  if (!shelf || !user) notFound();
  const editable = canEdit(user, shelf.ownerId);
  const ids = await shelfItemIds(shelf.id);
  const [items, people, access] = await Promise.all([
    listItems(user, { ids }).then(withCoverUrls),
    editable ? listPeople() : Promise.resolve([]),
    editable && shelf.visibility === "people" ? getShelfAccess(shelf.id) : Promise.resolve([]),
  ]);
  // listItems sorts by upload date; keep the shelf's own order (most recently added first).
  const order = new Map(ids.map((id, i) => [id, i]));
  items.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

  return (
    <div className="grid gap-6">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/shelves">
          <ArrowLeft /> Shelves
        </Link>
      </Button>
      <div className="grid gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ShelfIcon visibility={shelf.visibility} /> {shelf.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          {shelf.ownerId === user.id ? "Your shelf" : `By ${shelf.ownerName ?? "someone"}`} · {VISIBILITY_LABELS[shelf.visibility]}
        </p>
        {shelf.description ? <p className="max-w-prose text-muted-foreground">{shelf.description}</p> : null}
      </div>
      {editable ? (
        <div>
          <ShelfForm shelf={shelf} ownerId={shelf.ownerId} people={people} access={access} />
        </div>
      ) : null}
      {items.length ? (
        <MediaGrid items={items} />
      ) : (
        <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          Nothing here yet. Open anything in the library and use <strong>Shelves</strong> to add it.
        </p>
      )}
    </div>
  );
}
