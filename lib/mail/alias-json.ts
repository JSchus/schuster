import type { MailAlias } from "@/lib/db/schema";
import { isLive } from "./aliases";

/** What the browser sees of an alias. */
export type AliasJson = {
  id: string;
  address: string;
  label: string | null;
  kind: "personal" | "group";
  memberIds: string[];
  active: boolean;
  live: boolean;
  pausedReason: string | null;
  expiresAt: number | null;
  received: number;
  blocked: number;
  lastReceivedAt: number | null;
  mine: boolean;
};

export function aliasJson(a: MailAlias, domain: string, viewerId: string): AliasJson {
  return {
    id: a.id,
    address: `${a.localPart}@${domain}`,
    label: a.label,
    kind: a.kind === "group" ? "group" : "personal",
    memberIds: a.memberIds,
    active: a.active,
    live: isLive(a),
    pausedReason: a.pausedReason,
    expiresAt: a.expiresAt?.getTime() ?? null,
    received: a.received,
    blocked: a.blocked,
    lastReceivedAt: a.lastReceivedAt?.getTime() ?? null,
    mine: a.ownerId === viewerId,
  };
}
