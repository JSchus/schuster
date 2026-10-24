import { ListMusic, Lock, Users } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "next-view-transitions";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ShelfForm } from "@/components/shelves/shelf-form";
import { listPeople } from "@/lib/db/people";
import { listPlaylists } from "@/lib/db/playlists";
import { VISIBILITY_LABELS } from "@/lib/permissions";
import { formatDuration } from "@/lib/utils";

export const metadata: Metadata = { title: "Playlists" };

/** Playlists the visitor can hear, and a form to start one (anyone, viewers too). */
export default async function PlaylistsPage() {
  const user = (await auth())?.user;
  if (!user) redirect("/login");
  const [playlists, people] = await Promise.all([listPlaylists(user), listPeople()]);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Playlists</h1>
        <ShelfForm kind="playlist" ownerId={user.id} people={people} />
      </div>
      {playlists.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((p) => {
            const Icon = p.visibility === "private" ? Lock : p.visibility === "people" ? Users : ListMusic;
            return (
              <li key={p.id}>
                <Link href={`/playlists/${p.id}`} className="grid gap-1 rounded-lg border p-4 transition-colors hover:bg-muted">
                  <span className="flex items-center gap-2 font-medium">
                    <Icon className="size-4 text-muted-foreground" aria-hidden /> {p.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {p.tracks} {p.tracks === 1 ? "song" : "songs"}
                    {p.seconds ? ` · ${formatDuration(p.seconds)}` : ""} ·{" "}
                    {p.ownerId === user.id ? "yours" : `by ${p.ownerName ?? "someone"}`}
                    {p.visibility !== "everyone" ? ` · ${VISIBILITY_LABELS[p.visibility]}` : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          No playlists yet. Make one here, or open any song and use <strong>Playlists</strong>.
        </p>
      )}
    </div>
  );
}
