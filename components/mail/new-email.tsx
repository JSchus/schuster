"use client";

import { Copy, ExternalLink, Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { copyText, sendJson } from "@/lib/sharing/client";
import type { AliasSendBody } from "@/lib/sharing/protocol";

type Props = { aliasId: string; address: string; accountEmail: string; onSent: () => void };

/** Start a new email from an alias: write it in Gmail (via a hidden address) or right here. */
export function NewEmail({ aliasId, address, accountEmail, onSent }: Props) {
  const [to, setTo] = useState("");
  const [hidden, setHidden] = useState<{ to: string; address: string } | null>(null);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = hidden?.to === to.trim().toLowerCase();

  async function next(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await sendJson<{ address: string }>(`/api/mail/aliases/${aliasId}/contacts`, "POST", { email: to });
      setHidden({ to: to.trim().toLowerCase(), address: res.address });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: AliasSendBody = { to, subject, text };
      await sendJson(`/api/mail/aliases/${aliasId}/send`, "POST", body);
      toast.success(`Sent to ${to.trim()} from ${address}`);
      setSubject("");
      setText("");
      onSent();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-md bg-muted/40 p-3">
      <form onSubmit={next} className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-56 flex-1 gap-1.5">
          <Label htmlFor={`to-${aliasId}`}>Email someone (one person per email)</Label>
          <Input id={`to-${aliasId}`} type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@example.com" autoComplete="email" />
        </div>
        <Button type="submit" variant="outline" disabled={busy || !to.trim() || ready}>
          {busy && !ready ? <Loader2 className="animate-spin" /> : null} Next
        </Button>
      </form>

      {ready && hidden ? (
        <>
          <div className="grid gap-2">
            <p className="text-sm font-medium">Write it in Gmail or your Mail app</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm">
                <a href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(hidden.address)}`} target="_blank" rel="noreferrer">
                  <ExternalLink /> Write in Gmail
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`mailto:${hidden.address}`}>
                  <Mail /> Mail app
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={async () => (await copyText(hidden.address)) && toast.success("Copied")}>
                <Copy /> Copy address
              </Button>
            </div>
            <p className="text-xs [overflow-wrap:anywhere] text-muted-foreground">
              Send it to {hidden.address} from {accountEmail} (or a confirmed reply address). {hidden.to} will only see {address}.
            </p>
          </div>

          <form onSubmit={send} className="grid gap-2 border-t pt-3">
            <p className="text-sm font-medium">Or write it here</p>
            <div className="grid gap-1.5">
              <Label htmlFor={`subject-${aliasId}`}>Subject</Label>
              <Input id={`subject-${aliasId}`} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`text-${aliasId}`}>Message</Label>
              <textarea
                id={`text-${aliasId}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                maxLength={20_000}
                className="rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={busy || !subject.trim() || !text.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Send />} Send from {address}
              </Button>
              <span className="text-xs text-muted-foreground">Plain text, no attachments. Replies come to your inbox.</span>
            </div>
          </form>
        </>
      ) : null}
    </div>
  );
}
