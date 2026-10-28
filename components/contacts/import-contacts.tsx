"use client";

import { FileUp, Loader2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseVcards, type ParsedContact } from "@/lib/contacts/vcard";
import { sendJson } from "@/lib/sharing/client";
import { IMPORT_BATCH } from "@/lib/sharing/protocol";

/**
 * Import a .vcf contacts file: it's read here in the browser, you untick
 * anyone you don't want, and only the chosen contacts are saved (in
 * batches). Photos are skipped.
 */
export function ImportContacts({ onDone }: { onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedContact[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [q, setQ] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function read(file: File) {
    try {
      const list = parseVcards(await file.text());
      if (!list.length) return void toast.error("No contacts found in that file. Is it a .vcf contacts export?");
      setParsed(list);
      setSkip(new Set());
    } catch {
      toast.error("Couldn't read that file.");
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const shown = useMemo(() => {
    if (!parsed) return [];
    const term = q.trim().toLowerCase();
    return parsed
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => !term || `${c.name} ${c.org ?? ""} ${c.emails.join(" ")}`.toLowerCase().includes(term));
  }, [parsed, q]);

  async function save() {
    if (!parsed) return;
    const chosen = parsed.filter((_, i) => !skip.has(i));
    if (!chosen.length) return;
    let added = 0;
    let updated = 0;
    setProgress({ done: 0, total: chosen.length });
    try {
      for (let i = 0; i < chosen.length; i += IMPORT_BATCH) {
        const batch = chosen.slice(i, i + IMPORT_BATCH);
        const res = await sendJson<{ added: number; updated: number }>("/api/contacts/import", "POST", { contacts: batch });
        added += res.added;
        updated += res.updated;
        setProgress({ done: Math.min(i + batch.length, chosen.length), total: chosen.length });
      }
      toast.success(`Imported: ${added} new, ${updated} updated`);
      setParsed(null);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  if (!parsed) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => input.current?.click()}>
          <FileUp /> Import contacts
        </Button>
        <input
          ref={input}
          type="file"
          accept=".vcf,text/vcard,text/x-vcard"
          className="hidden"
          aria-label="Contacts file (.vcf)"
          onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])}
        />
      </>
    );
  }

  const count = parsed.length - skip.size;
  return (
    <div className="grid w-full gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-sm">
          Found <strong>{parsed.length}</strong> contacts. Untick anyone you don&apos;t want.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setSkip(new Set())}>
          Select all
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setSkip(new Set(parsed.map((_, i) => i)))}>
          Select none
        </Button>
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search this file" aria-label="Search this file" />
      <ul className="grid max-h-80 gap-0.5 overflow-y-auto">
        {shown.map(({ c, i }) => (
          <li key={i}>
            <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
              <input
                type="checkbox"
                checked={!skip.has(i)}
                onChange={(e) =>
                  setSkip((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.delete(i);
                    else n.add(i);
                    return n;
                  })
                }
              />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="truncate text-xs text-muted-foreground">{c.emails[0] ?? c.phones[0] ?? ""}</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={!count || !!progress}>
          {progress ? <Loader2 className="animate-spin" /> : null}
          {progress ? `Saving ${progress.done}/${progress.total}…` : `Import ${count} ${count === 1 ? "contact" : "contacts"}`}
        </Button>
        <Button variant="ghost" onClick={() => setParsed(null)} disabled={!!progress}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
