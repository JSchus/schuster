import { MediaCard } from "@/components/library/media-card";
import type { ItemWithCover } from "@/lib/covers";

type Started = ItemWithCover & { percent: number };

/** Where tapping a started item goes: straight back into the reader or player. */
function resumeHref(item: Started): string {
  if (item.type === "video") return `/watch/${item.id}`;
  if (item.type === "audio") return `/listen/${item.id}`;
  return `/read/${item.id}`;
}

/** "42 min left" for video/audio with a known duration. */
function timeLeft(item: Started): string | undefined {
  const d = item.metadata.durationSec;
  if (!d || (item.type !== "video" && item.type !== "audio")) return undefined;
  const mins = Math.max(1, Math.round((d * (1 - item.percent / 100)) / 60));
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min left` : `${mins} min left`;
}

/** Books, videos and audio you've started, newest first, each with a progress bar. */
export function ContinueShelf({ items }: { items: Started[] }) {
  if (!items.length) return null;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold tracking-tight">Pick up where you left off</h2>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:thin]">
        {items.map((i) => (
          <div key={i.id} className="w-28 shrink-0 snap-start sm:w-36">
            <MediaCard item={i} morph={false} progress={i.percent} href={resumeHref(i)} caption={timeLeft(i)} />
          </div>
        ))}
      </div>
    </section>
  );
}
