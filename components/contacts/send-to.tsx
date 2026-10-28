"use client";

import { Mail, MessageSquare, Search, Send, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContactJson } from "@/lib/contacts/contact-json";
import { isAppleMobile, mailtoHref, smsHref } from "@/lib/contacts/compose";
import { sendJson } from "@/lib/sharing/client";

type Props = {
  /** Builds the message (the URL usually needs location.origin, so it's made on open). */
  message: () => { subject: string; body: string };
  label?: string;
};

/**
 * "Send to…": pick one of your contacts and open Messages or Mail with the
 * message filled in. Nothing is sent by the site; it goes from your own
 * phone number or email address.
 */
export function SendTo({ message, label = "Send to…" }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<ContactJson[] | null>(null);
  const [apple, setApple] = useState(false);
  const [msg, setMsg] = useState({ subject: "", body: "" });

  useEffect(() => setApple(isAppleMobile(navigator.userAgent, navigator.maxTouchPoints)), []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      sendJson<ContactJson[]>(`/api/contacts?q=${encodeURIComponent(q)}`, "GET")
        .then((all) => setFound(all.slice(0, 30)))
        .catch(() => setFound([]));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setMsg(message());
          setOpen(true);
        }}
      >
        <Send /> {label}
      </Button>
    );
  }

  return (
    <div className="grid w-full gap-2 rounded-md border bg-background p-3">
      <div className="flex items-center gap-2">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a contact" className="pl-8" aria-label="Find a contact" autoFocus />
        </label>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close">
          <X />
        </Button>
      </div>
      {found === null ? null : found.length ? (
        <ul className="grid max-h-64 gap-1 overflow-y-auto">
          {found.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-1 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
              {c.phones.slice(0, 2).map((p) => (
                <Button key={p} asChild variant="outline" size="sm">
                  <a href={smsHref(p, msg.body, apple)} aria-label={`Text ${c.name} at ${p}`}>
                    <MessageSquare /> Text
                  </a>
                </Button>
              ))}
              {c.emails.slice(0, 2).map((e) => (
                <Button key={e} asChild variant="outline" size="sm">
                  <a href={mailtoHref(e, msg.subject, msg.body)} aria-label={`Email ${c.name} at ${e}`}>
                    <Mail /> Email
                  </a>
                </Button>
              ))}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">
          {q ? "No contacts match." : (
            <>
              No contacts yet. <a className="underline" href="/contacts">Import your contacts</a>.
            </>
          )}
        </p>
      )}
    </div>
  );
}
