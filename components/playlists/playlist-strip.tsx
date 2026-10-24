import { ListMusic } from "lucide-react";
import { Link } from "next-view-transitions";
import type { PlaylistSummary } from "@/lib/db/playlists";

/** Playlist chips on the library page. */
export function PlaylistStrip({ playlists }: { playlists: PlaylistSummary[] }) {
  if (!playlists.length) return null;
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Playlists</h2>
        <Link href="/playlists" className="text-sm text-muted-foreground hover:underline">
          All playlists
        </Link>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {playlists.map((p) => (
          <Link
            key={p.id}
            href={`/playlists/${p.id}`}
            className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-muted"
          >
            <ListMusic className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">{p.name}</span>
            <span className="text-muted-foreground">{p.tracks}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
