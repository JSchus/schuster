"use client";

import { Copy, Link2, Loader2, Lock, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText, sendJson } from "@/lib/sharing/client";
import { SHARE_DAYS, shareUrl, type ShareCreateBody } from "@/lib/sharing/protocol";
import type { ShareJson } from "@/lib/sharing/share-json";

const fmt = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });

/**
 * Public links for one item: make one (expiry, optional password, download
 * on/off), copy it, or turn it off. Anyone with a link can open it without
 * an account until it expires.
 */
export function SharePanel({ itemId, inline }: { itemId: string; inline: boolean }) {
  const [links, setLinks] = useState<ShareJson[] | null>(null);
  const [days, setDays] = useState<ShareCreateBody["days"]>(7);
  const [password, setPassword] = useState("");
  const [allowDownload, setAllowDownload] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    sendJson<ShareJson[]>(`/api/items/${itemId}/shares`, "GET")
      .then(setLinks)
      .catch((err) => toast.error((err as Error).message));
  }, [itemId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: ShareCreateBody = { days, allowDownload, ...(password ? { password } : {}) };
      const link = await sendJson<ShareJson>(`/api/items/${itemId}/shares`, "POST", body);
      setLinks((l) => [link, ...(l ?? [])]);
      setPassword("");
      const copied = await copyText(shareUrl(location.origin, link.token));
      if (copied) toast.success("Link copied. Paste it into a message or email.");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    try {
      await sendJson(`/api/shares/${token}`, "DELETE");
      setLinks((l) => l?.filter((s) => s.token !== token) ?? null);
      toast.success("Link turned off");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">
        Anyone with a link can open this without an account until the link expires. You can turn it off any time.
      </p>
      <form onSubmit={create} className="grid gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Works for</span>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value) as ShareCreateBody["days"])}
              className="h-9 rounded-md border bg-background px-2"
            >
              {SHARE_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d === 1 ? "1 day" : `${d} days`}
                </option>
              ))}
            </select>
          </label>
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="share-password">Password (optional)</Label>
            <Input
              id="share-password"
              type="text"
              autoComplete="off"
              minLength={4}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 4 characters"
            />
          </div>
        </div>
        {inline ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
            Show a Download button (otherwise it can only be watched, listened to or viewed)
          </label>
        ) : null}
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Make link &amp; copy
          </Button>
        </div>
      </form>

      {links === null ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : links.length ? (
        <ul className="grid gap-2">
          {links.map((s) => (
            <li key={s.token} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              {s.hasPassword ? <Lock className="size-4 text-muted-foreground" aria-label="Password protected" /> : null}
              <span className="min-w-0 flex-1 truncate">
                Until {fmt(s.expiresAt)} · {s.views} {s.views === 1 ? "view" : "views"}
                {inline && !s.allowDownload ? " · no download" : ""}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => (await copyText(shareUrl(location.origin, s.token))) && toast.success("Link copied")}
              >
                <Copy /> Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={() => revoke(s.token)} aria-label="Turn this link off">
                <X /> Turn off
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No active links.</p>
      )}
    </div>
  );
}
