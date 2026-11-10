import { Inbox } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { MediaCard } from "@/components/library/media-card";
import { withCoverUrls } from "@/lib/covers";
import { sharedWithMe } from "@/lib/db/sends";

export const metadata: Metadata = { title: "Shared with me" };

const day = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" });

/** Files family members sent you, newest first. */
export default async function SharedPage() {
  const user = (await auth())?.user;
  if (!user) notFound();
  const rows = await sharedWithMe(user);
  const items = await withCoverUrls(rows.map((r) => r.item));
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Shared with me</h1>
        <p className="text-sm text-muted-foreground">Files family members sent you.</p>
      </div>
      {rows.length ? (
        <div className="grid grid-cols-2 items-start gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {rows.map((r, i) => (
            <div key={r.item.id} className="grid gap-1">
              <MediaCard item={items[i]!} caption={`from ${r.fromName?.split(" ")[0] || r.fromEmail?.split("@")[0] || "someone"} · ${day(r.at)}`} />
              {r.note ? <p className="line-clamp-3 rounded-md bg-muted px-2 py-1 text-xs whitespace-pre-line text-muted-foreground">{r.note}</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          <Inbox className="size-8" />
          <p>Nothing yet. When someone sends you a file, it shows up here.</p>
        </div>
      )}
    </div>
  );
}
