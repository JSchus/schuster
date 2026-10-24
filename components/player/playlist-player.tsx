"use client";

import { Download, HardDriveDownload, Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Fired on window when offline songs change, so players switch sources. */
export const OFFLINE_AUDIO_EVENT = "offline-audio-changed";
import { offlineTrackIds } from "@/lib/player/offline-audio";
import { pickSource } from "@/lib/player/source";
import { nextIndex, prevIndex, shuffled, type RepeatMode } from "@/lib/player/queue";
import { saveTrackProgress } from "@/lib/player/track-progress";
import { cn, formatDuration } from "@/lib/utils";

export type PlayerTrack = {
  id: string;
  title: string;
  artist: string | null;
  durationSec: number | null;
  /** Presigned S3 URL, or /offline-audio/{id}. */
  src: string;
  cover: string | null;
};

type Props = {
  playlistId: string;
  name: string;
  tracks: PlayerTrack[];
  /** Signed-in pages: where to get fresh URLs if the page's expire mid-session. */
  refreshUrl?: string;
  /** Signed-in pages: save each song's position to the account. */
  syncProgress?: boolean;
  /** Share pages with downloads on: each song downloads from `${downloadPrefix}${itemId}`. */
  downloadPrefix?: string;
  /** Hide the browser's own "Download" menu entry (share links with downloads off). */
  noDownload?: boolean;
  className?: string;
};

const SAVE_EVERY = 10_000;
const posKey = (id: string) => `playlist-pos:${id}`;

function readPos(id: string): { itemId: string; t: number } | null {
  try {
    return JSON.parse(localStorage.getItem(posKey(id)) ?? "null");
  } catch {
    return null;
  }
}

/**
 * Plays a playlist on one native <audio> element (keeps iOS background
 * playback, AirPlay and lock-screen controls): previous/next, shuffle,
 * repeat, tap a song to play it, moves on by itself, and remembers the song
 * and time per playlist. Songs kept offline play from this device.
 */
export function PlaylistPlayer({ playlistId, name, tracks: initial, refreshUrl, syncProgress, downloadPrefix, noDownload, className }: Props) {
  const el = useRef<HTMLAudioElement>(null);
  const [tracks, setTracks] = useState(initial);
  const [offline, setOffline] = useState<Set<string>>(new Set());
  const [online, setOnline] = useState(true);
  /** Songs whose network URL failed: they fall back to the device copy. */
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState(() => initial.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<RepeatMode>("off");
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wantPlay = useRef(false);
  const pendingSeek = useRef<number | undefined>(undefined);
  const lastSave = useRef(0);
  const refreshed = useRef(false);

  const index = order[pos] ?? 0;
  const current = tracks[index];
  const srcOf = useCallback(
    (t: PlayerTrack) => pickSource(t, { online, kept: offline.has(t.id), failed: failed.has(t.id) }),
    [online, offline, failed],
  );
  const currentSrc = current ? srcOf(current) : "";

  // Offline copies (and when they change) and where we left off: client-only state.
  useEffect(() => {
    const load = () => setOffline(offlineTrackIds());
    load();
    window.addEventListener(OFFLINE_AUDIO_EVENT, load);
    return () => window.removeEventListener(OFFLINE_AUDIO_EVENT, load);
  }, []);
  // Connection changes switch between S3 and the device copy at the same spot.
  useEffect(() => {
    const update = () => {
      if (el.current?.currentTime) pendingSeek.current = el.current.currentTime;
      setOnline(navigator.onLine);
    };
    setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    const saved = readPos(playlistId);
    const i = saved ? initial.findIndex((t) => t.id === saved.itemId) : -1;
    if (i >= 0) {
      setPos(i);
      pendingSeek.current = saved!.t;
    }
  }, [playlistId, initial]);

  const remember = useCallback(
    (ended = false) => {
      const a = el.current;
      if (!a || !current) return;
      lastSave.current = Date.now();
      try {
        localStorage.setItem(posKey(playlistId), JSON.stringify({ itemId: current.id, t: ended ? 0 : a.currentTime }));
      } catch {}
      if (syncProgress) saveTrackProgress(current.id, a.currentTime, a.duration, ended);
    },
    [current, playlistId, syncProgress],
  );

  const go = useCallback(
    (to: number | null, play = wantPlay.current) => {
      remember();
      setError(null);
      if (to === null) {
        wantPlay.current = false;
        el.current?.pause();
        return;
      }
      wantPlay.current = play;
      pendingSeek.current = undefined;
      setPos(to);
    },
    [remember],
  );

  const next = useCallback(() => go(nextIndex(pos, order.length, repeat === "one" ? "all" : repeat)), [go, pos, order.length, repeat]);
  const prev = useCallback(() => {
    // Like most players: "previous" restarts the song unless you're near its start.
    if (el.current && el.current.currentTime > 3) el.current.currentTime = 0;
    else go(prevIndex(pos, order.length, repeat === "off" ? "off" : "all"));
  }, [go, pos, order.length, repeat]);

  // New song: seek to the remembered time once known, and keep playing if we were.
  useEffect(() => {
    const a = el.current;
    if (!a) return;
    const onMeta = () => {
      if (pendingSeek.current && pendingSeek.current < a.duration - 3) a.currentTime = pendingSeek.current;
      pendingSeek.current = undefined;
    };
    a.addEventListener("loadedmetadata", onMeta, { once: true });
    if (wantPlay.current) void a.play().catch(() => setPlaying(false));
    return () => a.removeEventListener("loadedmetadata", onMeta);
  }, [current?.id, currentSrc]);

  // Lock screen, headphones and car controls.
  useEffect(() => {
    if (!("mediaSession" in navigator) || !current) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist ?? "",
      album: name,
      artwork: current.cover ? [{ src: current.cover, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    const a = () => el.current;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void a()?.play()],
      ["pause", () => a()?.pause()],
      ["nexttrack", () => next()],
      ["previoustrack", () => prev()],
      ["seekbackward", (d) => a() && (a()!.currentTime -= d.seekOffset ?? 15)],
      ["seekforward", (d) => a() && (a()!.currentTime += d.seekOffset ?? 30)],
      ["seekto", (d) => a() && d.seekTime !== undefined && (a()!.currentTime = d.seekTime)],
    ];
    for (const [action, fn] of handlers) {
      try {
        ms.setActionHandler(action, fn);
      } catch {}
    }
    return () => {
      for (const [action] of handlers) {
        try {
          ms.setActionHandler(action, null);
        } catch {}
      }
    };
  }, [current, name, next, prev]);

  // Save when leaving the page.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && remember();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [remember]);

  async function onError() {
    const a = el.current;
    if (!current || !a) return;
    const onDevice = currentSrc.startsWith("/offline-audio/");
    // Network trouble with a song kept on this device: play the device copy.
    if (!onDevice && offline.has(current.id) && !failed.has(current.id)) {
      pendingSeek.current = a.currentTime || pendingSeek.current;
      setFailed((f) => new Set(f).add(current.id));
      return;
    }
    if (refreshUrl && !refreshed.current && !onDevice) {
      refreshed.current = true;
      try {
        const res = await fetch(refreshUrl, { cache: "no-store" });
        if (!res.ok) throw new Error();
        const urls = (await res.json()) as Record<string, string>;
        pendingSeek.current = a.currentTime || pendingSeek.current;
        setTracks((ts) => ts.map((t) => ({ ...t, src: urls[t.id] ?? t.src })));
        return;
      } catch {}
    }
    setError(`Couldn't play “${current.title}”.`);
    if (pos < order.length - 1) setTimeout(next, 1500);
  }

  function toggleShuffle() {
    const on = !shuffle;
    setShuffle(on);
    // Keep the current song playing; reshuffle (or restore) the rest around it.
    const fresh = on ? shuffled(tracks.length, index) : tracks.map((_, i) => i);
    setOrder(fresh);
    setPos(fresh.indexOf(index));
  }

  const totalSec = useMemo(() => tracks.reduce((s, t) => s + (t.durationSec ?? 0), 0), [tracks]);

  if (!current) {
    return <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">No songs yet.</p>;
  }

  const RepeatIcon = repeat === "one" ? Repeat1 : Repeat;
  return (
    <div className={cn("grid gap-4", className)}>
      <div className="flex items-center gap-3">
        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
          {current.cover ? (
            <img src={current.cover} alt="" className="size-full object-cover" />
          ) : (
            <Music className="size-6 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium" aria-live="polite">
            {current.title}
          </p>
          <p className="truncate text-sm text-muted-foreground">{current.artist ?? name}</p>
        </div>
      </div>

      <audio
        ref={el}
        src={currentSrc}
        controls
        controlsList={noDownload ? "nodownload" : undefined}
        preload="metadata"
        className="w-full"
        onPlay={() => {
          wantPlay.current = true;
          setPlaying(true);
        }}
        onPause={() => {
          setPlaying(false);
          remember();
        }}
        onTimeUpdate={() => Date.now() - lastSave.current > SAVE_EVERY && !el.current?.paused && remember()}
        onEnded={() => {
          remember(true);
          if (repeat === "one" && el.current) {
            el.current.currentTime = 0;
            void el.current.play();
          } else next();
        }}
        onError={() => void onError()}
      />

      <div className="flex items-center justify-center gap-2">
        <Button variant="ghost" size="icon" onClick={toggleShuffle} aria-pressed={shuffle} aria-label="Shuffle" className={cn(shuffle && "text-primary")}>
          <Shuffle />
        </Button>
        <Button variant="ghost" size="icon" onClick={prev} aria-label="Previous song">
          <SkipBack />
        </Button>
        <Button
          size="icon"
          className="size-12 rounded-full"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            const a = el.current;
            if (!a) return;
            if (a.paused) {
              wantPlay.current = true;
              void a.play();
            } else a.pause();
          }}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button variant="ghost" size="icon" onClick={next} aria-label="Next song" disabled={repeat === "off" && pos >= order.length - 1}>
          <SkipForward />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"))}
          aria-label={`Repeat: ${repeat}`}
          className={cn(repeat !== "off" && "text-primary")}
        >
          <RepeatIcon />
        </Button>
      </div>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}

      <ol className="grid gap-0.5">
        {tracks.map((t, i) => (
          <li key={t.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => go(order.indexOf(i), true)}
              aria-current={i === index ? "true" : undefined}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted",
                i === index && "bg-muted font-medium",
              )}
            >
              <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.title}</span>
                {t.artist ? <span className="block truncate text-xs text-muted-foreground">{t.artist}</span> : null}
              </span>
              {offline.has(t.id) ? <HardDriveDownload className="size-3.5 shrink-0 text-muted-foreground" aria-label="On this device" /> : null}
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{t.durationSec ? formatDuration(t.durationSec) : ""}</span>
            </button>
            {downloadPrefix ? (
              <Button asChild variant="ghost" size="icon" className="size-8">
                <a href={`${downloadPrefix}${t.id}`} rel="noreferrer" aria-label={`Download ${t.title}`}>
                  <Download className="size-4" />
                </a>
              </Button>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="text-center text-xs text-muted-foreground">
        {tracks.length} {tracks.length === 1 ? "song" : "songs"}
        {totalSec ? ` · ${formatDuration(totalSec)}` : ""}
      </p>
    </div>
  );
}
