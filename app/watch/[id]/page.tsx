import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { Link } from "next-view-transitions";
import { PlayerLoader } from "@/components/player/player-loader";
import { Button } from "@/components/ui/button";
import { loadPlayerPage, playerTitle } from "@/lib/player/page-data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: await playerTitle((await params).id, "video") };
}

/** Video player. The file streams from S3 (Range requests); Vercel only signs URLs. */
export default async function WatchPage({ params }: Props) {
  const { id } = await params;
  const { item, urls, poster, progress } = await loadPlayerPage(id, "video", `/watch/${id}`);
  return (
    <main className="min-h-dvh bg-black text-white" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <header className="mx-auto flex max-w-6xl items-center gap-2 px-2 py-2">
        <Button asChild variant="ghost" size="icon" className="text-white hover:bg-white/10 hover:text-white" aria-label="Back to details">
          <Link href={`/items/${item.id}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="truncate text-sm font-medium">{item.title}</h1>
      </header>
      <div className="dark mx-auto max-w-6xl px-2 pb-6 text-foreground sm:px-4">
        <PlayerLoader
          item={{ id: item.id, title: item.title, author: item.metadata.author, kind: "video" }}
          progress={progress}
          urls={urls}
          poster={poster}
        />
      </div>
    </main>
  );
}
