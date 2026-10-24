import type { Share } from "@/lib/db/schema";

/** What the browser sees of a share link (never the password hash). */
export type ShareJson = {
  token: string;
  expiresAt: number;
  hasPassword: boolean;
  allowDownload: boolean;
  views: number;
};

export function shareJson(s: Share): ShareJson {
  return {
    token: s.token,
    expiresAt: s.expiresAt.getTime(),
    hasPassword: !!s.passwordHash,
    allowDownload: s.allowDownload,
    views: s.views,
  };
}
