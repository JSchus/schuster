import type { Metadata } from "next";
import { Link } from "next-view-transitions";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ShelfIcon } from "@/components/shelves/shelf-strip";
import { ShelfForm } from "@/components/shelves/shelf-form";
import { listPeople } from "@/lib/db/people";
import { listShelves } from "@/lib/db/shelves";
import { canContribute, VISIBILITY_LABELS } from "@/lib/permissions";

export const metadata: Metadata = { title: "Shelves" };

/** All shelves the visitor can see, and a form to start a new one. */
export default async function ShelvesPage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const contributor = canContribute(user);
  const [shelves, people] = await Promise.all([listShelves(user), contributor ? listPeople() : Promise.resolve([])]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Shelves</h1>
        {contributor ? <ShelfForm ownerId={user.id} people={people} /> : null}
      </div>
      {shelves.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shelves.map((s) => (
            <li key={s.id}>
              <Link href={`/shelves/${s.id}`} className="grid gap-1 rounded-lg border p-4 transition-colors hover:bg-muted">
                <span className="flex items-center gap-2 font-medium">
                  <ShelfIcon visibility={s.visibility} /> {s.name}
                </span>
                <span className="text-sm text-muted-foreground">
                  {s.items} {s.items === 1 ? "item" : "items"} · {s.ownerId === user.id ? "yours" : `by ${s.ownerName ?? "someone"}`}
                  {s.visibility !== "everyone" ? ` · ${VISIBILITY_LABELS[s.visibility]}` : ""}
                </span>
                {s.description ? <span className="line-clamp-2 text-sm text-muted-foreground">{s.description}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          No shelves yet. Shelves group things together, like “Holiday movies” or “Kids’ books”.
        </p>
      )}
    </div>
  );
}
