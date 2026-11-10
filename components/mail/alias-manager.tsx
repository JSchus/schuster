"use client";

import { Copy, Inbox, Loader2, Mail, Plus, Power, Trash2, Users, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { MailLogJson } from "@/app/api/mail/aliases/[id]/messages/route";
import type { MailMessageJson } from "@/app/api/mail/messages/[id]/route";
import { personLabel } from "@/components/sharing/visibility-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Person } from "@/lib/db/people";
import type { AliasJson } from "@/lib/mail/alias-json";
import { copyText, sendJson } from "@/lib/sharing/client";
import { ALIAS_DAYS, type AliasCreateBody } from "@/lib/sharing/protocol";
import { cn } from "@/lib/utils";

const fmt = (ms: number) =>
  new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago" });

const OUTCOMES: Record<string, string> = {
  delivered: "Delivered",
  spam: "Blocked: spam",
  virus: "Blocked: virus",
  off: "Blocked: alias off",
  expired: "Blocked: expired",
  rejected: "Refused: not sent from your inbox",
  failed: "Couldn't deliver",
  bounced: "Bounced",
  complained: "Marked as spam",
};

type Props = { initial: AliasJson[]; people: Person[]; me: string; domain: string };

/** Make and manage email aliases; read the last 14 days of mail through each. */
export function AliasManager({ initial, people, me, domain }: Props) {
  const [aliases, setAliases] = useState(initial);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const [group, setGroup] = useState(false);
  const [members, setMembers] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [openLog, setOpenLog] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: AliasCreateBody = {
        ...(name.trim() ? { name } : {}),
        ...(label.trim() ? { label } : {}),
        days: days as AliasCreateBody["days"],
        ...(group ? { memberIds: members } : {}),
      };
      const alias = await sendJson<AliasJson>("/api/mail/aliases", "POST", body);
      setAliases((a) => [alias, ...a]);
      setName("");
      setLabel("");
      setDays(null);
      setMembers([]);
      setGroup(false);
      if (await copyText(alias.address)) toast.success(`${alias.address} made and copied`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(a: AliasJson, change: { active?: boolean; unpause?: true }) {
    try {
      await sendJson(`/api/mail/aliases/${a.id}`, "PATCH", change);
      setAliases((all) =>
        all.map((x) =>
          x.id === a.id
            ? {
                ...x,
                ...(change.active !== undefined ? { active: change.active } : {}),
                ...(change.unpause ? { pausedReason: null } : {}),
                live: (change.active ?? x.active) && !(change.unpause ? null : x.pausedReason) && (!x.expiresAt || x.expiresAt > Date.now()),
              }
            : x,
        ),
      );
      toast.success(change.unpause ? "Turned back on" : change.active ? "Turned on" : "Turned off: mail to it is blocked");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function remove(a: AliasJson) {
    if (!window.confirm(`Delete ${a.address}? Mail to it will stop arriving, and its history is deleted.`)) return;
    try {
      await sendJson(`/api/mail/aliases/${a.id}`, "DELETE");
      setAliases((all) => all.filter((x) => x.id !== a.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const others = people.filter((p) => p.id !== me);
  return (
    <div className="grid gap-8">
      <form onSubmit={create} className="grid gap-4 rounded-lg border p-4">
        <div className="flex flex-wrap gap-3">
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="alias-name">Name (optional)</Label>
            <Input id="alias-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="netflix" autoComplete="off" maxLength={40} />
            <p className="truncate text-xs text-muted-foreground">{name.trim() ? `${name.trim().toLowerCase()}@${domain}` : `a random name, like quiet-otter-42@${domain}`}</p>
          </div>
          <div className="grid min-w-48 flex-1 gap-1.5">
            <Label htmlFor="alias-label">What it&apos;s for</Label>
            <Input id="alias-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Netflix sign-up" maxLength={100} />
          </div>
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Stops working</span>
            <select value={days ?? ""} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)} className="h-9 rounded-md border bg-background px-2">
              <option value="">Never</option>
              {ALIAS_DAYS.map((d) => (
                <option key={d} value={d}>
                  After {d === 1 ? "1 day" : `${d} days`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          Family group: send it to other people too
        </label>
        {group ? (
          others.length ? (
            <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2">
              {others.map((p) => (
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={members.includes(p.id)}
                    onChange={(e) => setMembers((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))}
                  />
                  <span className="truncate">{personLabel(p)}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nobody else has an account yet.</p>
          )
        ) : null}
        <div>
          <Button type="submit" disabled={busy || (group && !members.length)}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Make alias &amp; copy
          </Button>
        </div>
      </form>

      {aliases.length ? (
        <ul className="grid gap-2">
          {aliases.map((a) => (
            <li key={a.id} className={cn("grid gap-1 rounded-lg border p-3", !a.live && "opacity-70")}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium break-all">{a.address}</span>
                {a.kind === "group" ? <Users className="size-4 text-muted-foreground" aria-label="Group" /> : null}
                {!a.active ? <span className="rounded bg-muted px-1.5 text-xs">off</span> : null}
                {a.expiresAt && a.expiresAt < Date.now() ? <span className="rounded bg-muted px-1.5 text-xs">expired</span> : null}
                {a.label ? <span className="text-sm text-muted-foreground">· {a.label}</span> : null}
              </div>
              {a.pausedReason ? (
                <p className="text-sm text-destructive">
                  {a.pausedReason}{" "}
                  {a.mine ? (
                    <button className="underline" onClick={() => patch(a, { unpause: true })}>
                      Turn back on
                    </button>
                  ) : null}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {a.received} delivered · {a.blocked} blocked
                {a.lastReceivedAt ? ` · last ${fmt(a.lastReceivedAt)}` : ""}
                {a.expiresAt ? ` · ${a.expiresAt < Date.now() ? "stopped" : "stops"} ${fmt(a.expiresAt)}` : ""}
                {a.kind === "group" ? ` · ${a.memberIds.length + 1} people` : ""}
                {!a.mine ? " · you're in this group" : ""}
              </p>
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={async () => (await copyText(a.address)) && toast.success("Copied")}>
                  <Copy /> Copy
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setOpenLog(openLog === a.id ? null : a.id)}>
                  <Inbox /> Recent mail
                </Button>
                {a.mine ? (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => patch(a, { active: !a.active })}>
                      <Power /> {a.active ? "Turn off" : "Turn on"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(a)} aria-label={`Delete ${a.address}`}>
                      <Trash2 />
                    </Button>
                  </>
                ) : null}
              </div>
              {openLog === a.id ? <RecentMail aliasId={a.id} /> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
          No aliases yet. Make one above and use it instead of your real email address.
        </p>
      )}
    </div>
  );
}

/** The last 14 days of mail through one alias; tap one to read it. */
function RecentMail({ aliasId }: { aliasId: string }) {
  const [rows, setRows] = useState<MailLogJson[] | null>(null);
  const [open, setOpen] = useState<{ id: string; msg: MailMessageJson | null } | null>(null);

  if (rows === null) {
    void sendJson<MailLogJson[]>(`/api/mail/aliases/${aliasId}/messages`, "GET")
      .then(setRows)
      .catch((err) => {
        toast.error((err as Error).message);
        setRows([]);
      });
    return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
  }

  async function read(row: MailLogJson) {
    setOpen({ id: row.id, msg: null });
    try {
      setOpen({ id: row.id, msg: await sendJson<MailMessageJson>(`/api/mail/messages/${row.id}`, "GET") });
    } catch (err) {
      toast.error((err as Error).message);
      setOpen(null);
    }
  }

  return (
    <div className="grid gap-2 rounded-md bg-muted/40 p-2">
      {rows.length ? (
        <ul className="grid gap-1">
          {rows.map((r) => (
            <li key={r.id}>
              <button
                className="flex w-full flex-wrap items-baseline gap-x-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-60"
                onClick={() => read(r)}
                disabled={!r.viewable}
              >
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">{r.subject || "(no subject)"}</span>
                <span className="text-xs text-muted-foreground">
                  {r.direction === "in" ? `from ${r.from}` : `your reply to ${r.to}`} · {fmt(r.at)} · {OUTCOMES[r.outcome] ?? r.outcome}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-2 py-1 text-sm text-muted-foreground">Nothing in the last 14 days.</p>
      )}
      {open ? (
        <div className="grid gap-2 rounded-md border bg-background p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{open.msg?.subject || "(no subject)"}</p>
              <p className="truncate text-xs text-muted-foreground">{open.msg ? `${open.msg.from}${open.msg.date ? ` · ${open.msg.date}` : ""}` : "Loading…"}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(null)} aria-label="Close message">
              <X />
            </Button>
          </div>
          {open.msg?.html ? (
            <iframe
              title="Message"
              // No scripts, no forms, no remote images or styles: just the text and layout.
              sandbox=""
              srcDoc={`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">${open.msg.html}`}
              className="h-96 w-full rounded border bg-white"
            />
          ) : open.msg ? (
            <pre className="max-h-96 overflow-auto text-sm whitespace-pre-wrap">{open.msg.text ?? ""}</pre>
          ) : null}
          {open.msg?.attachments.length ? (
            <p className="text-xs text-muted-foreground">Attachments (in your inbox): {open.msg.attachments.map((a) => a.filename).join(", ")}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
