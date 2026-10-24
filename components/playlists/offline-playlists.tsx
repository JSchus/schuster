"use client";

import { ListMusic } from "lucide-react";
import { useEffect, useState } from "react";
import { PlaylistPlayer } from "@/components/player/playlist-player";
import { listOfflinePlaylists, offlineAudioUrl, type OfflinePlaylist } from "@/lib/player/offline-audio";
import { formatBytes } from "@/lib/utils";

/** Playlists kept on this device: pick one and it plays right here, with no connection. */
export function OfflinePlaylists() {
  const [lists, setLists] = useState<OfflinePlaylist[]>([]);
  const [open, setOpen] = useState<OfflinePlaylist | null>(null);
  useEffect(() => setLists(listOfflinePlaylists()), []);
  if (!lists.length) return null;

  if (open) {
    return (
      <section className="grid w-full max-w-md gap-3 text-left">
        <button type="button" className="text-sm text-muted-foreground hover:underline" onClick={() => setOpen(null)}>
          ← Offline playlists
        </button>
        <h2 className="text-lg font-semibold">{open.name}</h2>
        <PlaylistPlayer
          playlistId={open.id}
          name={open.name}
          tracks={open.tracks.map((t) => ({ ...t, src: offlineAudioUrl(t.id), cover: null }))}
        />
      </section>
    );
  }

  return (
    <section className="grid w-full max-w-sm gap-2 text-left">
      <h2 className="text-sm font-medium text-muted-foreground">Playlists on this device</h2>
      <ul className="grid gap-1">
        {lists.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setOpen(p)}
              className="flex w-full items-center gap-3 rounded-md border p-3 text-left hover:bg-accent"
            >
              <ListMusic className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted-foreground">
                {p.tracks.length} songs · {formatBytes(p.tracks.reduce((s, t) => s + t.size, 0))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
