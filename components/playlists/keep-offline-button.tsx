"use client";

import { HardDriveDownload, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { PlaylistUrls } from "@/app/api/playlists/[id]/urls/route";
import { OFFLINE_AUDIO_EVENT } from "@/components/player/playlist-player";
import { Button } from "@/components/ui/button";
import {
  AUDIO_CACHE,
  listOfflinePlaylists,
  playlistPageKey,
  removePlaylistOffline,
  savePlaylistOffline,
  type OfflinePlaylist,
  type OfflineTrack,
} from "@/lib/player/offline-audio";
import { formatBytes } from "@/lib/utils";

type Props = { playlist: { id: string; name: string }; tracks: Omit<OfflineTrack, "size">[] };

/**
 * Save every song of a playlist on this device (straight from S3), so it
 * plays with no connection, from here or from the offline page.
 */
export function KeepOfflineButton({ playlist, tracks }: Props) {
  const [saved, setSaved] = useState<OfflinePlaylist | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => setSaved(listOfflinePlaylists().find((p) => p.id === playlist.id) ?? null), [playlist.id]);

  const outdated =
    !!saved && (saved.tracks.length !== tracks.length || saved.tracks.some((t, i) => t.id !== tracks[i]?.id));

  async function save() {
    if (!tracks.length) return;
    setProgress({ done: 0, total: tracks.length });
    try {
      // Ask the browser not to evict these files under storage pressure.
      await navigator.storage?.persist?.().catch(() => false);
      const res = await fetch(`/api/playlists/${playlist.id}/urls`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Couldn't get the songs (${res.status})`);
      const urls = (await res.json()) as PlaylistUrls;
      const entry = await savePlaylistOffline(
        playlist,
        tracks.filter((t) => urls[t.id]),
        async (t) => {
          const r = await fetch(urls[t.id]!);
          if (!r.ok) throw new Error(`Download failed for “${t.title}”`);
          return r.blob();
        },
        setProgress,
      );
      // The page itself, so /playlists/{id} opens offline too.
      await caches.open(AUDIO_CACHE).then((c) => c.add(playlistPageKey(playlist.id))).catch(() => {});
      setSaved(entry);
      window.dispatchEvent(new Event(OFFLINE_AUDIO_EVENT));
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      toast.success(
        `Saved on this device${est?.quota ? ` · ${formatBytes(est.usage ?? 0)} of ${formatBytes(est.quota)} used` : ""}`,
      );
    } catch (err) {
      const full = (err as Error).name === "QuotaExceededError";
      toast.error(full ? "This device is out of space for offline songs." : (err as Error).message);
    } finally {
      setProgress(null);
    }
  }

  async function remove() {
    await removePlaylistOffline(playlist.id);
    setSaved(null);
    window.dispatchEvent(new Event(OFFLINE_AUDIO_EVENT));
    toast.success("Removed from this device");
  }

  if (progress) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Loader2 className="animate-spin" /> Saving {progress.done}/{progress.total}…
      </Button>
    );
  }
  if (saved) {
    const bytes = saved.tracks.reduce((s, t) => s + t.size, 0);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <HardDriveDownload className="size-4" /> On this device · {formatBytes(bytes)}
        </span>
        {outdated ? (
          <Button variant="outline" size="sm" onClick={save}>
            Update offline copy
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={remove}>
          <Trash2 /> Remove from device
        </Button>
      </div>
    );
  }
  return (
    <Button variant="outline" size="sm" onClick={save} disabled={!tracks.length}>
      <HardDriveDownload /> Keep offline
    </Button>
  );
}
