import { ArrowLeft, Music } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "next-view-transitions";
import { PlayerLoader } from "@/components/player/player-loader";
import { Button } from "@/components/ui/button";
import { loadPlayerPage, playableItem } from "@/lib/player/page-data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await playableItem((await params).id, "audio");
  return { title: item?.title ?? "Not found" };
}

/** Audio player with large artwork; lock-screen controls come from the Media Session API. */
export default async function ListenPage({ params }: Props) {
  const { id } = await params;
  const { item, urls, poster, progress } = await loadPlayerPage(id, "audio", `/listen/${id}`);
  return (
    <main className="mx-auto grid min-h-dvh max-w-md content-start gap-6 px-4 py-4" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href={`/items/${item.id}`}>
          <ArrowLeft /> Details
        </Link>
      </Button>
      <div className="mx-auto aspect-square w-full max-w-xs overflow-hidden rounded-2xl bg-muted shadow-lg">
        {poster ? (
          <img src={poster} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground">
            <Music className="size-16" />
          </div>
        )}
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-balance">{item.title}</h1>
        {item.metadata.author ? <p className="text-muted-foreground">{item.metadata.author}</p> : null}
      </div>
      <PlayerLoader
        item={{ id: item.id, title: item.title, author: item.metadata.author, kind: "audio" }}
        progress={progress}
        urls={urls}
        poster={poster}
      />
    </main>
  );
}
