"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Candidate } from "@/app/api/playlists/[id]/candidates/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendJson } from "@/lib/sharing/client";
import { formatDuration } from "@/lib/utils";

type Song = { id: string; title: string; artist: string | null };

/** Reorder, remove and add songs (the playlist's owner or an admin). */
export function PlaylistEditor({ playlistId, songs: initial }: { playlistId: string; songs: Song[] }) {
  const router = useRouter();
  const [songs, setSongs] = useState(initial);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Candidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/playlists/${playlistId}`;

  useEffect(() => setSongs(initial), [initial]);

  // Search as you type (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      sendJson<Candidate[]>(`${base}/candidates?q=${encodeURIComponent(q)}`, "GET")
        .then(setFound)
        .catch(() => setFound([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, base, songs.length]);

  async function run(fn: () => Promise<unknown>, undo?: () => void) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      undo?.();
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function move(i: number, by: -1 | 1) {
    const before = songs;
    const after = [...songs];
    [after[i], after[i + by]] = [after[i + by]!, after[i]!];
    setSongs(after);
    void run(() => sendJson(`${base}/tracks`, "PUT", { itemIds: after.map((s) => s.id) }), () => setSongs(before));
  }

  function remove(song: Song) {
    const before = songs;
    setSongs(songs.filter((s) => s.id !== song.id));
    void run(() => sendJson(`${base}/tracks`, "DELETE", { itemId: song.id }), () => setSongs(before));
  }

  function add(c: Candidate) {
    setSongs((s) => [...s, { id: c.id, title: c.title, artist: c.artist }]);
    setFound((f) => f?.filter((x) => x.id !== c.id) ?? null);
    void run(() => sendJson(`${base}/tracks`, "POST", { itemId: c.id }), () => setSongs((s) => s.filter((x) => x.id !== c.id)));
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4">
      {songs.length ? (
        <ol className="grid gap-1">
          {songs.map((s, i) => (
            <li key={s.id} className="flex items-center gap-1 text-sm">
              <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate px-2">
                {s.title}
                {s.artist ? <span className="text-muted-foreground"> · {s.artist}</span> : null}
              </span>
              <Button variant="ghost" size="icon" className="size-8" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.title} up`}>
                <ArrowUp className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" disabled={busy || i === songs.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.title} down`}>
                <ArrowDown className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" className="size-8" disabled={busy} onClick={() => remove(s)} aria-label={`Remove ${s.title}`}>
                <X className="size-4" />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="grid gap-2">
        <label className="relative">
          <Search className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find songs to add" className="pl-8" aria-label="Find songs to add" />
        </label>
        {found === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : found.length ? (
          <ul className="grid max-h-72 gap-0.5 overflow-y-auto">
            {found.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => add(c)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  aria-label={`Add ${c.title}`}
                >
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">
                    {c.title}
                    {c.artist ? <span className="text-muted-foreground"> · {c.artist}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">{c.durationSec ? formatDuration(c.durationSec) : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{q ? "No songs match." : "Every song is already on this playlist."}</p>
        )}
      </div>
    </div>
  );
}
