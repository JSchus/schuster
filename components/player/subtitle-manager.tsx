"use client";

import { Captions, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { SubtitleStartResponse } from "@/app/api/items/[id]/subtitles/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LANGUAGES, normalizeLang, srtToVtt, type SubtitleTrack } from "@/lib/player/subtitles";

/**
 * List and add subtitle tracks for a video (uploader or admin). SRT files
 * are converted to WebVTT in the browser and uploaded straight to S3.
 */
export function SubtitleManager({ itemId, tracks }: { itemId: string; tracks: SubtitleTrack[] }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [lang, setLang] = useState("en");
  const [other, setOther] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(picked: File) {
    const code = lang === "other" ? normalizeLang(other) : lang;
    if (!code) return void toast.error("Enter a language code like “sv” or “pt-br”.");
    const label = LANGUAGES[code] ?? code.toUpperCase();
    setBusy(true);
    try {
      const vtt = srtToVtt(await picked.text());
      const start = await fetch(`/api/items/${itemId}/subtitles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: code, label }),
      });
      if (!start.ok) throw new Error(`Couldn't start (${start.status})`);
      const { key, uploadUrl } = (await start.json()) as SubtitleStartResponse;
      const put = await fetch(uploadUrl, { method: "PUT", body: vtt, headers: { "Content-Type": "text/vtt" } });
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      const confirm = await fetch(`/api/items/${itemId}/subtitles`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, lang: code, label }),
      });
      if (!confirm.ok) throw new Error(`Couldn't save (${confirm.status})`);
      toast.success(`${label} subtitles added`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }

  async function remove(t: SubtitleTrack) {
    const res = await fetch(`/api/items/${itemId}/subtitles`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lang: t.lang }),
    });
    if (res.ok) {
      toast(`${t.label} subtitles removed`);
      router.refresh();
    } else toast.error("Couldn't remove subtitles");
  }

  return (
    <section className="grid max-w-md gap-3 rounded-lg border p-4">
      <h2 className="flex items-center gap-2 font-medium">
        <Captions className="size-4" /> Subtitles
      </h2>
      {tracks.length ? (
        <ul className="grid gap-1 text-sm">
          {tracks.map((t) => (
            <li key={t.lang} className="flex items-center justify-between gap-2">
              <span>
                {t.label} <span className="text-muted-foreground">({t.lang})</span>
              </span>
              <Button variant="ghost" size="icon" aria-label={`Remove ${t.label} subtitles`} onClick={() => remove(t)}>
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No subtitles yet. Add an .srt or .vtt file.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Subtitle language"
          value={lang}
          onChange={(e) => setLang(e.target.value)}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
          <option value="other">Other…</option>
        </select>
        {lang === "other" ? (
          <Input className="h-9 w-28" placeholder="e.g. sv" value={other} onChange={(e) => setOther(e.target.value)} aria-label="Language code" />
        ) : null}
        <Button variant="outline" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : null} Add subtitles
        </Button>
        <input
          ref={file}
          type="file"
          accept=".srt,.vtt,text/vtt,application/x-subrip"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void add(f);
          }}
        />
      </div>
    </section>
  );
}
