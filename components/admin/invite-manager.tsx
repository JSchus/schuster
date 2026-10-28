"use client";

import { Copy, Link2, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { SendTo } from "@/components/contacts/send-to";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/permissions";
import { copyText, sendJson } from "@/lib/sharing/client";
import { INVITE_DAYS, inviteUrl, type InviteCreateBody } from "@/lib/sharing/protocol";

export type InviteRow = { id: string; token: string; role: "member" | "viewer" | "admin"; note: string | null; uses: number; maxUses: number; expires: string };

/** Make invite links (role, lifetime, how many people), copy them, or turn them off. */
export function InviteManager({ invites }: { invites: InviteRow[] }) {
  const router = useRouter();
  const [role, setRole] = useState<InviteCreateBody["role"]>("member");
  const [days, setDays] = useState<InviteCreateBody["days"]>(7);
  const [maxUses, setMaxUses] = useState(1);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { token } = await sendJson<{ token: string }>("/api/admin/invites", "POST", {
        role,
        days,
        maxUses,
        ...(note.trim() ? { note } : {}),
      } satisfies InviteCreateBody);
      setNote("");
      if (await copyText(inviteUrl(location.origin, token))) toast.success("Invite link copied. Send it by text or email.");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    try {
      await sendJson(`/api/admin/invites/${id}`, "DELETE");
      toast.success("Invite turned off");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const select = "h-9 rounded-md border bg-background px-2";
  return (
    <div className="grid gap-4">
      <form onSubmit={create} className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">They join as</span>
          <select value={role} onChange={(e) => setRole(e.target.value as InviteCreateBody["role"])} className={select}>
            <option value="member">Member (can upload)</option>
            <option value="viewer">Viewer (can&apos;t upload)</option>
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Link works for</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value) as InviteCreateBody["days"])} className={select}>
            {INVITE_DAYS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "1 day" : `${d} days`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">How many people</span>
          <select value={maxUses} onChange={(e) => setMaxUses(Number(e.target.value))} className={select}>
            {[1, 2, 5, 10, 25].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "1 person" : `Up to ${n}`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-40 flex-1 gap-1.5 text-sm">
          <span className="font-medium">Note (for you)</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Grandma" maxLength={200} />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Make link &amp; copy
        </Button>
      </form>

      {invites.length ? (
        <ul className="grid gap-2">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {i.note ? <strong>{i.note} · </strong> : null}
                {ROLE_LABELS[i.role]} · {i.uses}/{i.maxUses} used · until {i.expires}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => (await copyText(inviteUrl(location.origin, i.token))) && toast.success("Link copied")}
              >
                <Copy /> Copy
              </Button>
              <SendTo
                message={() => ({
                  subject: "You're invited to Schuster Media",
                  body: `You're invited to Schuster Media, our family's books, movies, music and games. Join here: ${inviteUrl(location.origin, i.token)}`,
                })}
              />
              <Button variant="ghost" size="sm" onClick={() => revoke(i.id)}>
                <X /> Turn off
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No open invite links.</p>
      )}
    </div>
  );
}
