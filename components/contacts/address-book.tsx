"use client";

import { Cake, Loader2, Mail, MessageSquare, Pencil, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ImportContacts } from "@/components/contacts/import-contacts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ContactJson } from "@/lib/contacts/contact-json";
import { daysUntilBirthday, formatBirthday, isAppleMobile, mailtoHref, smsHref } from "@/lib/contacts/compose";
import { sendJson } from "@/lib/sharing/client";
import { inviteUrl, type ContactBody } from "@/lib/sharing/protocol";

type Props = { initial: ContactJson[]; isAdmin: boolean; myName: string };

/** Your private address book: search, add, edit, import, text/email, and (admins) invite. */
export function AddressBook({ initial, isAdmin, myName }: Props) {
  const [contacts, setContacts] = useState(initial);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<ContactJson | "new" | null>(null);
  const [apple, setApple] = useState(false);
  /** The contact whose "Invite as…" choice is showing. */
  const [inviting, setInviting] = useState<string | null>(null);

  useEffect(() => setApple(isAppleMobile(navigator.userAgent, navigator.maxTouchPoints)), []);

  const reload = useCallback(async () => {
    setContacts(await sendJson<ContactJson[]>("/api/contacts", "GET"));
  }, []);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return contacts;
    return contacts.filter((c) =>
      `${c.name} ${c.org ?? ""} ${c.emails.join(" ")} ${c.phones.join(" ")}`.toLowerCase().includes(term),
    );
  }, [contacts, q]);

  const birthdays = useMemo(
    () =>
      contacts
        .map((c) => ({ c, days: c.birthday ? daysUntilBirthday(c.birthday) : null }))
        .filter((x): x is { c: ContactJson; days: number } => x.days !== null && x.days <= 30)
        .sort((a, b) => a.days - b.days)
        .slice(0, 8),
    [contacts],
  );

  async function remove(c: ContactJson) {
    if (!window.confirm(`Delete ${c.name} from your contacts?`)) return;
    try {
      await sendJson(`/api/contacts/${c.id}`, "DELETE");
      setContacts((all) => all.filter((x) => x.id !== c.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function removeAll() {
    if (!window.confirm(`Delete all ${contacts.length} contacts? This can't be undone.`)) return;
    try {
      await sendJson("/api/contacts", "DELETE");
      setContacts([]);
      toast.success("All contacts deleted");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function invite(c: ContactJson, role: "member" | "viewer") {
    const how = c.phones[0] ? { phone: c.phones[0] } : { email: c.emails[0] };
    setInviting(null);
    try {
      const { token } = await sendJson<{ token: string }>("/api/contacts/invite", "POST", { contactId: c.id, role });
      const link = inviteUrl(location.origin, token);
      const body = `${myName} invited you to Schuster Media, our family's books, movies, music and games. Join here (link works for 7 days): ${link}`;
      window.location.href = how.phone
        ? smsHref(how.phone, body, apple)
        : mailtoHref(how.email!, "You're invited to Schuster Media", body);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus /> Add contact
        </Button>
        <ImportContacts onDone={() => void reload()} />
        {contacts.length ? (
          <Button variant="ghost" size="sm" className="ml-auto text-destructive" onClick={removeAll}>
            <Trash2 /> Delete all
          </Button>
        ) : null}
      </div>

      {editing ? (
        <ContactForm
          contact={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={(c) => {
            setContacts((all) => [...all.filter((x) => x.id !== c.id), c].sort((a, b) => a.name.localeCompare(b.name)));
            setEditing(null);
          }}
        />
      ) : null}

      {birthdays.length ? (
        <section className="grid gap-2 rounded-lg border p-3">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Cake className="size-4" /> Upcoming birthdays
          </h2>
          <ul className="grid gap-1 text-sm">
            {birthdays.map(({ c, days }) => (
              <li key={c.id}>
                <strong>{c.name}</strong> · {formatBirthday(c.birthday!)} ·{" "}
                {days === 0 ? "today 🎉" : days === 1 ? "tomorrow" : `in ${days} days`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {contacts.length ? (
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${contacts.length} contacts`} className="pl-8" aria-label="Search contacts" />
        </label>
      ) : (
        <div className="grid gap-2 rounded-xl border border-dashed p-8 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Bring in your phone&apos;s contacts</p>
          <p>
            <strong>iPhone:</strong> open Contacts → <em>Lists</em> → press and hold <em>All Contacts</em> → <em>Export</em>. Save the file,
            then tap <em>Import contacts</em> above and pick it.
          </p>
          <p>
            <strong>Mac:</strong> go to icloud.com/contacts, select all, then <em>Export vCard</em>.
          </p>
          <p>Only you can see your contacts. Not even admins can.</p>
        </div>
      )}

      <ul className="grid gap-2">
        {shown.map((c) => (
          <li key={c.id} className="grid gap-1 rounded-lg border p-3">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-medium">{c.name}</span>
              {c.org ? <span className="text-sm text-muted-foreground">{c.org}</span> : null}
              {c.birthday ? <span className="text-xs text-muted-foreground">🎂 {formatBirthday(c.birthday)}</span> : null}
            </div>
            {c.emails.length || c.phones.length ? (
              <p className="truncate text-sm text-muted-foreground">{[...c.phones, ...c.emails].join(" · ")}</p>
            ) : null}
            <div className="flex flex-wrap gap-1">
              {c.phones[0] ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={`sms:${c.phones[0]}`}>
                    <MessageSquare /> Text
                  </a>
                </Button>
              ) : null}
              {c.emails[0] ? (
                <Button asChild variant="ghost" size="sm">
                  <a href={`mailto:${c.emails[0]}`}>
                    <Mail /> Email
                  </a>
                </Button>
              ) : null}
              {isAdmin && (c.phones[0] || c.emails[0]) ? (
                inviting === c.id ? (
                  <span className="flex flex-wrap items-center gap-1 text-sm">
                    Invite as
                    <Button variant="outline" size="sm" onClick={() => invite(c, "member")}>
                      Member
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => invite(c, "viewer")}>
                      Viewer
                    </Button>
                  </span>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => setInviting(c.id)}>
                    <UserPlus /> Invite
                  </Button>
                )
              ) : null}
              <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
                <Pencil /> Edit
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}>
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Add or edit one contact (emails and phones are comma-separated). */
function ContactForm({ contact, onCancel, onSaved }: { contact: ContactJson | null; onCancel: () => void; onSaved: (c: ContactJson) => void }) {
  const [name, setName] = useState(contact?.name ?? "");
  const [emails, setEmails] = useState(contact?.emails.join(", ") ?? "");
  const [phones, setPhones] = useState(contact?.phones.join(", ") ?? "");
  const [birthday, setBirthday] = useState(contact?.birthday?.replace(/^--/, "") ?? "");
  const [org, setOrg] = useState(contact?.org ?? "");
  const [note, setNote] = useState(contact?.note ?? "");
  const [busy, setBusy] = useState(false);
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: ContactBody = {
        name,
        emails: list(emails),
        phones: list(phones),
        // A month-day without year ("04-12") is stored as "--04-12".
        birthday: birthday ? (/^\d{2}-\d{2}$/.test(birthday) ? `--${birthday}` : birthday) : null,
        org: org || null,
        note: note || null,
      };
      const saved = contact
        ? await sendJson<ContactJson>(`/api/contacts/${contact.id}`, "PATCH", body)
        : await sendJson<ContactJson>("/api/contacts", "POST", body);
      onSaved(saved);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="c-name">Name</Label>
        <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c-phones">Phone numbers</Label>
        <Input id="c-phones" value={phones} onChange={(e) => setPhones(e.target.value)} placeholder="+1 312 555 0100" inputMode="tel" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c-emails">Emails</Label>
        <Input id="c-emails" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="name@example.com" inputMode="email" />
        <p className="text-xs text-muted-foreground">Separate several with commas.</p>
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label htmlFor="c-bday">Birthday</Label>
          <Input id="c-bday" value={birthday} onChange={(e) => setBirthday(e.target.value)} placeholder="1985-04-12 or 04-12" />
        </div>
        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label htmlFor="c-org">Company</Label>
          <Input id="c-org" value={org} onChange={(e) => setOrg(e.target.value)} maxLength={200} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c-note">Note</Label>
        <Input id="c-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
