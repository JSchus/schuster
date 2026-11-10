"use client";

import { Loader2, Mail, Send, Users, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { personLabel } from "@/components/sharing/visibility-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Person } from "@/lib/db/people";
import { sendJson } from "@/lib/sharing/client";
import { SEND_DAYS, type SendEmailBody, type SendMembersBody } from "@/lib/sharing/protocol";
import { cn } from "@/lib/utils";

export type SendOptions = {
  /** Address-book entries with an email (one per email). */
  contacts: { name: string; email: string }[];
  /** Your aliases that can send right now. */
  aliases: { id: string; address: string }[];
  me: string;
  myName: string;
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

function ToContacts({ itemId, options }: { itemId: string; options: SendOptions }) {
  const [to, setTo] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("site");
  const [days, setDays] = useState<(typeof SEND_DAYS)[number]>(7);
  const [allowDownload, setAllowDownload] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const nameOf = useMemo(() => new Map(options.contacts.map((c) => [c.email, c.name])), [options.contacts]);
  const q = query.trim().toLowerCase();
  const matches = q
    ? options.contacts.filter((c) => !to.includes(c.email) && (c.name.toLowerCase().includes(q) || c.email.includes(q))).slice(0, 8)
    : [];
  const typed = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q) && !to.includes(q) ? q : null;
  const add = (email: string) => {
    setTo((t) => (t.includes(email) || t.length >= 20 ? t : [...t, email]));
    setQuery("");
  };

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: SendEmailBody = { to, from, days, allowDownload, ...(note.trim() ? { note } : {}) };
      const res = await sendJson<{ sent: number; failed: string[] }>(`/api/items/${itemId}/send/email`, "POST", body);
      toast.success(`Emailed a link to ${res.sent} ${res.sent === 1 ? "person" : "people"}.`);
      if (res.failed.length) toast.error(`Couldn't email ${res.failed.join(", ")}`);
      setTo([]);
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
        <Label htmlFor={`to-${itemId}`}>To</Label>
        {to.length ? (
          <div className="flex flex-wrap gap-1">
            {to.map((email) => (
              <span key={email} className="flex max-w-full items-center gap-1 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-sm">
                <span className="truncate">{nameOf.get(email) ? `${nameOf.get(email)} · ${email}` : email}</span>
                <button type="button" onClick={() => setTo((t) => t.filter((x) => x !== email))} aria-label={`Remove ${email}`} className="rounded-full p-0.5 hover:bg-background">
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <Input
          id={`to-${itemId}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (typed || matches[0])) {
              e.preventDefault();
              add(typed ?? matches[0]!.email);
            }
          }}
          placeholder={options.contacts.length ? "Search your contacts or type an email" : "Type an email address"}
          autoComplete="off"
        />
        {matches.length || typed ? (
          <ul className="grid max-h-56 gap-0.5 overflow-y-auto rounded-md border p-1">
            {typed && !matches.some((m) => m.email === typed) ? (
              <li>
                <button type="button" onClick={() => add(typed)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                  Add {typed}
                </button>
              </li>
            ) : null}
            {matches.map((c) => (
              <li key={c.email}>
                <button type="button" onClick={() => add(c.email)} className="flex w-full flex-wrap gap-x-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-muted-foreground">{c.email}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
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
          <select value={days} onChange={(e) => setDays(Number(e.target.value) as (typeof SEND_DAYS)[number])} className="h-9 rounded-md border bg-background px-2">
            {SEND_DAYS.map((d) => (
              <option key={d} value={d}>
                {d === 1 ? "1 day" : `${d} days`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} />
        Let them download it
      </label>
      <NoteField id={`note-c-${itemId}`} value={note} onChange={setNote} />
      <p className="text-xs text-muted-foreground">
        {from === "site"
          ? "Your email address isn't shown. They can't reply to this email."
          : "Sent from your alias: your real address stays private, and replies come to your inbox."}{" "}
        They get a link, not an attachment.
      </p>
      <div>
        <Button type="submit" disabled={busy || !to.length}>
          {busy ? <Loader2 className="animate-spin" /> : <Send />} Email link{to.length > 1 ? ` to ${to.length}` : ""}
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
