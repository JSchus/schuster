"use client";

import { Loader2, Mail, Send, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { personLabel } from "@/components/sharing/visibility-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Person } from "@/lib/db/people";
import { sendJson } from "@/lib/sharing/client";
import { daysLabel, SEND_DAYS, type SendEmailBody, type SendMembersBody } from "@/lib/sharing/protocol";
import type { Recipient } from "@/lib/sharing/recipients";
import { cn } from "@/lib/utils";

export type SendOptions = {
  /** Address-book emails plus past recipients, most-sent first. */
  contacts: Recipient[];
  /** Your aliases that can send right now. */
  aliases: { id: string; address: string }[];
  me: string;
  myName: string;
  /** Video, audio or image play/show on the share page; anything else is a download. */
  kind: "video" | "audio" | "image" | null;
};

/** Send a file to family members (email + "Shared with me"), or email a link to contacts. */
export function SendFile({ itemId, people, options }: { itemId: string; people: Person[]; options: SendOptions }) {
  const [tab, setTab] = useState<"members" | "contacts">("members");
  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <div className="flex gap-1 rounded-md bg-muted p-1 text-sm" role="tablist">
        {(
          [
            ["members", "Family members", Users],
            ["contacts", "Email contacts", Mail],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn("flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5", tab === key && "bg-background font-medium shadow-sm")}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      {tab === "members" ? <ToMembers itemId={itemId} people={people.filter((p) => p.id !== options.me)} /> : <ToContacts itemId={itemId} options={options} />}
    </div>
  );
}

function ToMembers({ itemId, people }: { itemId: string; people: Person[] }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: SendMembersBody = { userIds: picked, ...(note.trim() ? { note } : {}) };
      await sendJson(`/api/items/${itemId}/send/members`, "POST", body);
      const names = people.filter((p) => picked.includes(p.id)).map(personLabel);
      toast.success(`Sent to ${names.join(", ")}. They'll get an email and find it under Shared with me.`);
      setPicked([]);
      setNote("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!people.length) return <p className="text-sm text-muted-foreground">Nobody else has an account yet.</p>;
  return (
    <form onSubmit={send} className="grid gap-3">
      <div className="grid max-h-56 gap-1 overflow-y-auto rounded-md border p-2">
        {people.map((p) => (
          <label key={p.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={picked.includes(p.id)}
              onChange={(e) => setPicked((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))}
            />
            <span className="truncate">{personLabel(p)}</span>
          </label>
        ))}
      </div>
      <NoteField id={`note-m-${itemId}`} value={note} onChange={setNote} />
      <p className="text-xs text-muted-foreground">They&apos;ll be able to see this file, get an email about it, and find it under ☰ → Shared with me.</p>
      <div>
        <Button type="submit" disabled={busy || !picked.length}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Send{picked.length ? ` to ${picked.length}` : ""}
        </Button>
      </div>
    </form>
  );
}

const MAX_TO = 20;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

function ToContacts({ itemId, options }: { itemId: string; options: SendOptions }) {
  /** Addresses typed under "Someone else?" this visit, shown ticked at the top. */
  const [extra, setExtra] = useState<Recipient[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [other, setOther] = useState("");
  const [from, setFrom] = useState("site");
  const [days, setDays] = useState<(typeof SEND_DAYS)[number] | null>(7);
  const [allowDownload, setAllowDownload] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const all = useMemo(() => [...extra, ...options.contacts.filter((c) => !extra.some((e) => e.email === c.email))], [extra, options.contacts]);
  const q = filter.trim().toLowerCase();
  const shown = q ? all.filter((c) => c.name.toLowerCase().includes(q) || c.email.includes(q)) : all;
  const full = picked.length >= MAX_TO;
  const firstNever = shown.findIndex((c) => c.sent === 0);
  const toggle = (email: string, on: boolean) =>
    setPicked((p) => (on ? (p.includes(email) || p.length >= MAX_TO ? p : [...p, email]) : p.filter((x) => x !== email)));

  function addOther() {
    const email = other.trim().toLowerCase();
    if (!isEmail(email)) return toast.error("That doesn't look like an email address.");
    if (!all.some((c) => c.email === email)) setExtra((x) => [{ name: email, email, sent: 0 }, ...x]);
    toggle(email, true);
    setOther("");
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: SendEmailBody = { to: picked, from, days, allowDownload: options.kind ? allowDownload : true, ...(note.trim() ? { note } : {}) };
      const res = await sendJson<{ sent: number; failed: string[] }>(`/api/items/${itemId}/send/email`, "POST", body);
      toast.success(`Emailed a link to ${res.sent} ${res.sent === 1 ? "person" : "people"}.`);
      if (res.failed.length) toast.error(`Couldn't email ${res.failed.join(", ")}`);
      setPicked([]);
      setNote("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={send} className="grid gap-3">
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">To</span>
          <span className="text-xs text-muted-foreground">
            {picked.length} selected{full ? ` (up to ${MAX_TO} at a time)` : ""}
          </span>
          {picked.length ? (
            <button type="button" onClick={() => setPicked([])} className="text-xs underline">
              Clear
            </button>
          ) : null}
        </div>
        {all.length ? (
          <>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by name or email" aria-label="Filter contacts" autoComplete="off" />
            <ul className="grid max-h-[22rem] overflow-y-auto rounded-md border p-1" aria-label="Contacts">
              {shown.map((c, i) => {
                const on = picked.includes(c.email);
                return (
                  <li key={c.email}>
                    {i === firstNever && firstNever > 0 ? <p className="mt-1 border-t px-2 pt-2 pb-1 text-xs text-muted-foreground">Others</p> : null}
                    <label className={cn("flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 hover:bg-muted", !on && full && "cursor-not-allowed opacity-50")}>
                      <input type="checkbox" checked={on} disabled={!on && full} onChange={(e) => toggle(c.email, e.target.checked)} className="size-4 shrink-0" />
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate text-sm font-medium">{c.name}</span>
                        {c.name !== c.email ? <span className="truncate text-xs text-muted-foreground">{c.email}</span> : null}
                      </span>
                      {c.sent ? <span className="shrink-0 text-xs text-muted-foreground">sent {c.sent}×</span> : null}
                    </label>
                  </li>
                );
              })}
              {!shown.length ? <li className="px-2 py-1.5 text-sm text-muted-foreground">No one matches “{filter}”.</li> : null}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Your address book is empty. Import your phone&apos;s contacts under{" "}
            <a href="/contacts" className="underline">
              People → My contacts
            </a>
            , or add an address below.
          </p>
        )}
        <div className="flex gap-2">
          <Input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOther();
              }
            }}
            type="email"
            placeholder="Someone else's email"
            aria-label="Someone else's email"
            autoComplete="off"
          />
          <Button type="button" variant="outline" onClick={addOther} disabled={!other.trim() || full}>
            Add
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="grid min-w-48 flex-1 gap-1.5 text-sm">
          <span className="font-medium">From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 rounded-md border bg-background px-2">
            <option value="site">{options.myName} via Schuster Media</option>
            {options.aliases.map((a) => (
              <option key={a.id} value={a.id}>
                {a.address}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">Link works for</span>
          <select
            value={days ?? "forever"}
            onChange={(e) => setDays(e.target.value === "forever" ? null : (Number(e.target.value) as (typeof SEND_DAYS)[number]))}
            className="h-9 rounded-md border bg-background px-2"
          >
            {[...SEND_DAYS, null].map((d) => (
              <option key={d ?? "forever"} value={d ?? "forever"}>
                {daysLabel(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {days === null ? (
        <p className="text-xs text-muted-foreground">The link never expires. You can turn it off any time under Share link.</p>
      ) : null}
      {options.kind ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
          Let them download it (otherwise they can only {options.kind === "video" ? "watch" : options.kind === "audio" ? "listen to" : "view"} it)
        </label>
      ) : null}
      <NoteField id={`note-c-${itemId}`} value={note} onChange={setNote} />
      <p className="text-xs text-muted-foreground">
        {from === "site"
          ? "Your email address isn't shown. They can't reply to this email."
          : "Sent from your alias: your real address stays private, and replies come to your inbox."}{" "}
        {options.kind ? "They get a link, not an attachment." : "They get a link to download it (not an attachment)."} Each person gets their own email.
      </p>
      <div>
        <Button type="submit" disabled={busy || !picked.length}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Email link{picked.length > 1 ? ` to ${picked.length}` : ""}
        </Button>
      </div>
    </form>
  );
}

function NoteField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Note (optional)</Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="e.g. Here are Grandma's recipes!"
        className="rounded-md border bg-background px-3 py-2 text-sm"
      />
    </div>
  );
}
