"use client";

import { Copy, Link2, Loader2, Lock, Pencil, Power, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { QrButton } from "@/components/links/qr-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LinkJson } from "@/lib/links/link-json";
import { normalizeSlug } from "@/lib/links/rules";
import { copyText, sendJson } from "@/lib/sharing/client";
import { LINK_DAYS, shortUrl, type LinkCreateBody } from "@/lib/sharing/protocol";
import { cn } from "@/lib/utils";

const fmt = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });
const dayLabel = (d: number) => (d === 1 ? "1 day" : d === 365 ? "1 year" : `${d} days`);

/** Make short links and manage them: copy, QR, change destination, turn off, delete. */
export function LinkManager({ initial, showOwner }: { initial: LinkJson[]; showOwner: boolean }) {
  const [links, setLinks] = useState(initial);
  const [target, setTarget] = useState("");
  const [slug, setSlug] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: LinkCreateBody = {
        target,
        ...(slug.trim() ? { slug } : {}),
        ...(note.trim() ? { note } : {}),
        days: days as LinkCreateBody["days"],
        ...(password ? { password } : {}),
      };
      const link = await sendJson<LinkJson>("/api/links", "POST", body);
      setLinks((l) => [link, ...l]);
      setTarget("");
      setSlug("");
      setNote("");
      setPassword("");
      if (await copyText(shortUrl(location.origin, link.slug))) toast.success("Short link made and copied");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(link: LinkJson, change: { target?: string; disabled?: boolean }) {
    try {
      await sendJson(`/api/links/${link.slug}`, "PATCH", change);
      setLinks((all) =>
        all.map((l) =>
          l.slug === link.slug
            ? { ...l, ...(change.disabled !== undefined ? { disabled: change.disabled } : {}), ...(change.target ? { target: change.target } : {}) }
            : l,
        ),
      );
      toast.success(change.disabled === undefined ? "Destination changed" : change.disabled ? "Link turned off" : "Link turned on");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function edit(link: LinkJson) {
    const next = window.prompt("Where should this link go?", link.target);
    if (next && next !== link.target) await patch(link, { target: next });
  }

  async function remove(link: LinkJson) {
    if (!window.confirm(`Delete schuster.me/go/${link.slug}? Anyone using it will see "doesn't work".`)) return;
    try {
      await sendJson(`/api/links/${link.slug}`, "DELETE");
      setLinks((all) => all.filter((l) => l.slug !== link.slug));
      toast.success("Deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const preview = normalizeSlug(slug);
  return (
    <div className="grid gap-8">
      <form onSubmit={create} className="grid gap-4 rounded-lg border p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="link-target">Where should it go?</Label>
          <Input id="link-target" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="https://…" required inputMode="url" autoComplete="off" />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="link-slug">Short word (optional)</Label>
            <Input id="link-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="recital" maxLength={64} autoComplete="off" />
            <p className="truncate text-xs text-muted-foreground">schuster.me/go/{preview || "a random word"}</p>
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Works for</span>
            <select
              value={days ?? ""}
              onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}
              className="h-9 rounded-md border bg-background px-2"
            >
              <option value="">Always</option>
              {LINK_DAYS.map((d) => (
                <option key={d} value={d}>
                  {dayLabel(d)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="link-note">Note (for you)</Label>
            <Input id="link-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Recital tickets" maxLength={200} />
          </div>
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="link-password">Password (optional)</Label>
            <Input id="link-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} autoComplete="off" placeholder="At least 4 characters" />
          </div>
        </div>
        <div>
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Link2 />} Make short link &amp; copy
          </Button>
        </div>
      </form>

      {links.length ? (
        <ul className="grid gap-2">
          {links.map((l) => {
            const expired = l.expiresAt !== null && l.expiresAt < Date.now();
            return (
              <li key={l.slug} className={cn("grid gap-1 rounded-lg border p-3", (l.disabled || expired) && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">/go/{l.slug}</span>
                  {l.hasPassword ? <Lock className="size-3.5 text-muted-foreground" aria-label="Password protected" /> : null}
                  {l.disabled ? <span className="rounded bg-muted px-1.5 text-xs">off</span> : null}
                  {expired ? <span className="rounded bg-muted px-1.5 text-xs">expired</span> : null}
                  {l.note ? <span className="text-sm text-muted-foreground">· {l.note}</span> : null}
                </div>
                <p className="truncate text-sm text-muted-foreground">→ {l.target}</p>
                <p className="text-xs text-muted-foreground">
                  {l.clicks} {l.clicks === 1 ? "visit" : "visits"}
                  {l.lastClickedAt ? ` · last ${fmt(l.lastClickedAt)}` : ""}
                  {l.expiresAt ? ` · ${expired ? "expired" : "until"} ${fmt(l.expiresAt)}` : ""}
                  {showOwner && !l.mine ? ` · by ${l.ownerName ?? "someone"}` : ""}
                </p>
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" size="sm" onClick={async () => (await copyText(shortUrl(location.origin, l.slug))) && toast.success("Copied")}>
                    <Copy /> Copy
                  </Button>
                  <QrButton path={`/go/${l.slug}`} name={l.slug} />
                  <Button variant="ghost" size="sm" onClick={() => edit(l)}>
                    <Pencil /> Change destination
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => patch(l, { disabled: !l.disabled })}>
                    <Power /> {l.disabled ? "Turn on" : "Turn off"}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(l)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          No short links yet. Make one above, or use <strong>Short link</strong> next to any share link.
        </p>
      )}
    </div>
  );
}
