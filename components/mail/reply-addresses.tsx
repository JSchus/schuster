"use client";

import { CheckCircle2, Clock, Loader2, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { ReplyAddressJson } from "@/app/api/mail/reply-addresses/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/sharing/client";

/** "Also reply from": extra addresses (like the Gmail your mail forwards to), each confirmed by email. */
export function ReplyAddresses({ initial, accountEmail }: { initial: ReplyAddressJson[]; accountEmail: string }) {
  const [rows, setRows] = useState(initial);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function send(address: string) {
    setBusy(address);
    try {
      const row = await sendJson<ReplyAddressJson>("/api/mail/reply-addresses", "POST", { email: address });
      setRows((all) => [...all.filter((r) => r.id !== row.id), row]);
      setEmail("");
      toast.success(row.confirmed ? `${row.email} is already confirmed` : `Sent a link to ${row.email}. Open it to finish.`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(row: ReplyAddressJson) {
    try {
      await sendJson(`/api/mail/reply-addresses/${row.id}`, "DELETE");
      setRows((all) => all.filter((r) => r.id !== row.id));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <section className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-1">
        <h2 className="font-medium">Reply from another address</h2>
        <p className="text-sm text-muted-foreground">
          Replies work from <strong>{accountEmail}</strong>. If that mail is forwarded somewhere else (like Gmail) and you reply from there,
          add that address too. We&apos;ll email it a link to confirm it&apos;s yours.
        </p>
      </div>
      {rows.length ? (
        <ul className="grid gap-1">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-2 text-sm">
              {r.confirmed ? (
                <CheckCircle2 className="size-4 text-green-600" aria-label="Confirmed" />
              ) : (
                <Clock className="size-4 text-muted-foreground" aria-label="Waiting" />
              )}
              <span className="min-w-0 break-all">{r.email}</span>
              <span className="text-xs text-muted-foreground">{r.confirmed ? "confirmed" : "waiting: open the link we emailed"}</span>
              <span className="ml-auto flex gap-1">
                {!r.confirmed ? (
                  <Button variant="ghost" size="sm" onClick={() => send(r.email)} disabled={busy !== null}>
                    Send again
                  </Button>
                ) : null}
                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove(r)} aria-label={`Remove ${r.email}`}>
                  <Trash2 />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void send(email.trim());
        }}
      >
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor="reply-address">Also reply from</Label>
          <Input id="reply-address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@gmail.com" autoComplete="email" />
        </div>
        <Button type="submit" variant="outline" disabled={busy !== null || !email.trim()}>
          {busy === email.trim() && busy ? <Loader2 className="animate-spin" /> : <Send />} Send confirmation
        </Button>
      </form>
    </section>
  );
}
