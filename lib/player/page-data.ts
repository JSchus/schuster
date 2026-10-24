import "server-only";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { withCoverUrls } from "@/lib/covers";
import { getProgress, getReadyItem } from "@/lib/db/queries";
import type { MediaType } from "@/lib/media-types";
import { playbackUrls } from "./urls";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function playableItem(id: string, kind: "video" | "audio") {
  if (!UUID.test(id)) return undefined;
  const item = await getReadyItem(id);
  return item?.type === kind ? item : undefined;
}

/** Everything the /watch and /listen pages need, after checking the session and item type. */
export async function loadPlayerPage(id: string, kind: Extract<MediaType, "video" | "audio">, path: string) {
  const session = await auth();
  if (!session?.user) redirect(`/login?callbackUrl=${path}`);
  const item = await playableItem(id, kind);
  if (!item) notFound();
  const [progress, urls, [withCover]] = await Promise.all([
    getProgress(session.user.id, item.id),
    playbackUrls(item),
    withCoverUrls([item]),
  ]);
  return {
    item,
    urls,
    poster: withCover?.coverUrl ?? null,
    progress: progress
      ? { position: progress.position, percent: progress.percent, updatedAt: progress.updatedAt.getTime() }
      : null,
  };
}
