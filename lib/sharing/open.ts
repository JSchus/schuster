import "server-only";
import { cookies } from "next/headers";
import { getPlaylistUnchecked, playlistTracksFor } from "@/lib/db/playlists";
import { getReadyItemUnchecked } from "@/lib/db/queries";
import { getUserRole } from "@/lib/auth/roles";
import type { MediaItem, Playlist, Share } from "@/lib/db/schema";
import { workingShare } from "@/lib/db/shares";
import { env } from "@/lib/env";
import { isTokenShape, safeEqual, shareCookieName, shareUnlockValue } from "./tokens";

/** Kinds a share page shows inline; anything else is offered as a download. */
export function inlineKind(item: { type: string; mime: string }): "video" | "audio" | "image" | null {
  if (item.type === "video") return "video";
  if (item.type === "audio") return "audio";
  if (item.mime.startsWith("image/")) return "image";
  return null;
}

/** Seconds a presigned URL from a share should live: up to 4 h, never past the link's expiry. */
export function shareUrlLifetime(expiresAt: Date, now = Date.now()): number {
  return Math.max(60, Math.min(4 * 3600, Math.floor((expiresAt.getTime() - now) / 1000)));
}

export type ResolvedShare =
  | { kind: "item"; share: Share; item: MediaItem; locked: boolean }
  | { kind: "playlist"; share: Share; playlist: Playlist; locked: boolean };

/**
 * Resolve a public share link to its item or playlist. `locked` means it has
 * a password the visitor hasn't entered yet (no unlock cookie).
 */
export async function resolveShare(token: string): Promise<ResolvedShare | undefined> {
  if (!isTokenShape(token)) return undefined;
  const share = await workingShare(token);
  if (!share) return undefined;
  let locked = false;
  if (share.passwordHash) {
    const cookie = (await cookies()).get(shareCookieName(token))?.value ?? "";
    locked = !safeEqual(cookie, shareUnlockValue(env().AUTH_SECRET, token, share.passwordHash));
  }
  if (share.itemId) {
    const item = await getReadyItemUnchecked(share.itemId);
    return item ? { kind: "item", share, item, locked } : undefined;
  }
  const playlist = share.playlistId ? await getPlaylistUnchecked(share.playlistId) : undefined;
  return playlist ? { kind: "playlist", share, playlist, locked } : undefined;
}

/**
 * A shared playlist plays the tracks its link's creator can see today: a
 * song they lost access to (or that was made private) drops out.
 */
export async function sharedPlaylistTracks(share: Share): Promise<MediaItem[]> {
  const role = await getUserRole(share.createdBy);
  if (!role || !share.playlistId) return [];
  return playlistTracksFor(share.playlistId, { id: share.createdBy, role });
}
