import "server-only";
import { cookies } from "next/headers";
import { openShare } from "@/lib/db/shares";
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

/**
 * Resolve a public share link. `locked` means it has a password the visitor
 * hasn't entered yet (no unlock cookie).
 */
export async function resolveShare(token: string) {
  if (!isTokenShape(token)) return undefined;
  const found = await openShare(token);
  if (!found) return undefined;
  const { share } = found;
  let locked = false;
  if (share.passwordHash) {
    const cookie = (await cookies()).get(shareCookieName(token))?.value ?? "";
    locked = !safeEqual(cookie, shareUnlockValue(env().AUTH_SECRET, token, share.passwordHash));
  }
  return { ...found, locked };
}
