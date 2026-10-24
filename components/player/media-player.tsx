"use client";

import { Captions, Loader2, RotateCcw, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { ProgressResponse } from "@/app/api/progress/[itemId]/route";
import { useProgressSync } from "@/components/reader/use-progress-sync";
import { Button } from "@/components/ui/button";
import { decodeTime, encodeTime, percentOf, resumeTime } from "@/lib/player/position";
import type { PlaybackUrls } from "@/lib/player/urls";
import { cn, formatDuration } from "@/lib/utils";

export type PlayerItem = { id: string; title: string; author?: string; kind: "video" | "audio" };

type Props = {
  item: PlayerItem;
  progress: ProgressResponse;
  urls: PlaybackUrls;
  /** Cover image: video poster, audio artwork, and lock-screen art. */
  poster?: string | null;
  className?: string;
};

const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SAVE_EVERY = 10_000;
/** Seconds back / forward for the skip buttons and keys. */
const SKIPS = { video: [10, 30], audio: [15, 30] } as const;
const RATE_KEY = "player-rate";
const CAPTIONS_KEY = "player-captions";

const readPref = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writePref = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {}
};

/**
 * Video/audio player on the native element (keeps iOS fullscreen, AirPlay,
 * picture-in-picture and accessibility), plus:
 * - resume where you stopped, synced across devices via user_progress;
 * - skip buttons, playback speed, captions picker, keyboard shortcuts;
 * - lock-screen / headphone controls through the Media Session API;
 * - one automatic refresh of the presigned URLs if they expire mid-session.
 *
 * Bytes stream straight from S3 with HTTP Range requests (seeking is native).
 */
export function MediaPlayer({ item, progress, urls: initialUrls, poster, className }: Props) {
  const el = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const sync = useProgressSync(item.id, progress);
  const [urls, setUrls] = useState(initialUrls);
  /** Bumped on each URL refresh to remount the media element (and reload it). */
  const [generation, setGeneration] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [rate, setRate] = useState(1);
  const [captions, setCaptions] = useState<string>("off");
  const lastSave = useRef(0);
  const refreshed = useRef(false);
  /** Where to seek once metadata loads: the resume point, or the spot before a URL refresh. */
  const pendingSeek = useRef<number | undefined>(decodeTime(sync.start?.position));
  const resuming = useRef(true);
  const skip = SKIPS[item.kind];
  const hasSubs = urls.subtitles.length > 0;

  const save = useCallback(
    (ended = false) => {
      const v = el.current;
      if (!v || !Number.isFinite(v.duration) || v.duration === 0) return;
      lastSave.current = Date.now();
      sync.record(encodeTime(ended ? v.duration : v.currentTime), ended ? 100 : percentOf(v.currentTime, v.duration));
    },
    [sync],
  );

  const applyCaptions = useCallback((lang: string) => {
    const tracks = el.current?.textTracks;
    if (!tracks) return;
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i]!;
      t.mode = t.language === lang ? "showing" : "disabled";
    }
  }, []);

  // Resume once metadata is known. Listen natively and also handle "already
  // loaded": a cached file can finish loading before React attaches handlers.
  useEffect(() => {
    const v = el.current;
    if (!v) return;
    setReady(false);
    const onMeta = () => {
      const want = resuming.current ? resumeTime(pendingSeek.current, v.duration) : (pendingSeek.current ?? 0);
      if (want > 0) v.currentTime = want;
      pendingSeek.current = undefined;
      setReady(true);
    };
    if (v.readyState >= HTMLMediaElement.HAVE_METADATA) onMeta();
    else v.addEventListener("loadedmetadata", onMeta, { once: true });
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [generation]);

  // Preferences.
  useEffect(() => {
    const r = Number(readPref(RATE_KEY));
    if (SPEEDS.includes(r)) setRate(r);
    setCaptions(readPref(CAPTIONS_KEY) ?? "off");
  }, []);
  useEffect(() => {
    if (el.current) el.current.playbackRate = rate;
  }, [rate, ready]);
  useEffect(() => {
    if (ready) applyCaptions(captions);
  }, [captions, ready, applyCaptions]);

  // Media Session: lock screen, headphones, car controls.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.metadata = new MediaMetadata({
      title: item.title,
      artist: item.author ?? "Schuster Media",
      artwork: poster ? [{ src: poster, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    const v = () => el.current;
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
      ["play", () => void v()?.play()],
      ["pause", () => v()?.pause()],
      ["seekbackward", (d) => v() && (v()!.currentTime -= d.seekOffset ?? skip[0])],
      ["seekforward", (d) => v() && (v()!.currentTime += d.seekOffset ?? skip[1])],
      ["seekto", (d) => v() && d.seekTime !== undefined && (v()!.currentTime = d.seekTime)],
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
  }, [item.title, item.author, poster, skip]);

  // Keyboard shortcuts (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const v = el.current;
      if (!v || (e.target as HTMLElement | null)?.closest?.("input, textarea, select, button, [contenteditable]")) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        if (v.paused) void v.play();
        else v.pause();
      } else if (e.key === "ArrowLeft") v.currentTime -= skip[0];
      else if (e.key === "ArrowRight") v.currentTime += skip[1];
      else if (e.key === "f" && item.kind === "video") void (document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen?.());
      else if (e.key === "c" && hasSubs) {
        const order = ["off", ...urls.subtitles.map((s) => s.lang)];
        const next = order[(order.indexOf(captions) + 1) % order.length]!;
        setCaptions(next);
        writePref(CAPTIONS_KEY, next);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [captions, hasSubs, item.kind, skip, urls.subtitles]);

  // Cross-device: announce or offer the other device's spot.
  const { jump, dismissJump } = sync;
  useEffect(() => {
    if (!jump || !ready) return;
    const to = decodeTime(jump.to.position) ?? 0;
    const from = decodeTime(jump.from.position) ?? 0;
    const opened = jump.kind === "opened";
    toast(opened ? `Picked up at ${formatDuration(to)} from another device` : `You're at ${formatDuration(to)} on another device`, {
      duration: 12_000,
      action: {
        label: opened ? `Go back to ${formatDuration(from)}` : "Jump there",
        onClick: () => {
          if (el.current) el.current.currentTime = opened ? from : to;
        },
      },
    });
    dismissJump();
  }, [jump, ready, dismissJump]);

  // Expired URL or unplayable file.
  const onError = useCallback(async () => {
    const v = el.current;
    if (!refreshed.current) {
      refreshed.current = true;
      try {
        const res = await fetch(`/api/items/${item.id}/stream`, { cache: "no-store" });
        if (!res.ok) throw new Error();
        pendingSeek.current = v?.currentTime || pendingSeek.current;
        resuming.current = false;
        setUrls(await res.json());
        setGeneration((g) => g + 1);
        return;
      } catch {}
    }
    setFailed(true);
  }, [item.id]);

  // An error that fired before React attached onError (e.g. an instant 403).
  useEffect(() => {
    if (el.current?.error) void onError();
  }, [generation, onError]);

  const Element = item.kind === "video" ? "video" : "audio";

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="relative">
        <Element
          ref={el}
          key={generation}
          src={urls.src}
          poster={item.kind === "video" ? (poster ?? undefined) : undefined}
          controls
          playsInline
          preload="metadata"
          // Subtitle tracks are cross-origin (presigned S3), which requires CORS mode.
          crossOrigin={hasSubs ? "anonymous" : undefined}
          className={cn("w-full", item.kind === "video" && "max-h-[75dvh] rounded-lg bg-black")}
          onTimeUpdate={() => Date.now() - lastSave.current > SAVE_EVERY && !el.current?.paused && save()}
          onPause={() => save()}
          onSeeked={() => save()}
          onEnded={() => save(true)}
          onError={onError}
        >
          {urls.subtitles.map((t) => (
            <track key={t.src} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} />
          ))}
        </Element>
        {!ready && !failed ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : null}
      </div>

      {failed ? (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          This browser can&apos;t play this file (some formats, like MKV or HEVC, only play in certain browsers).{" "}
          <a className="underline" href={`/api/items/${item.id}/download`}>
            Download it instead
          </a>
          .
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => el.current && (el.current.currentTime -= skip[0])}
          aria-label={`Back ${skip[0]} seconds`}
        >
          <RotateCcw /> {skip[0]}s
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => el.current && (el.current.currentTime += skip[1])}
          aria-label={`Forward ${skip[1]} seconds`}
        >
          {skip[1]}s <RotateCw />
        </Button>
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          Speed
          <select
            value={rate}
            onChange={(e) => {
              const r = Number(e.target.value);
              setRate(r);
              writePref(RATE_KEY, String(r));
            }}
            className="h-8 rounded-md border bg-background px-2 text-foreground"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}×
              </option>
            ))}
          </select>
        </label>
        {hasSubs ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Captions className="size-4" aria-hidden />
            <select
              aria-label="Subtitles"
              value={captions}
              onChange={(e) => {
                setCaptions(e.target.value);
                writePref(CAPTIONS_KEY, e.target.value);
              }}
              className="h-8 rounded-md border bg-background px-2 text-foreground"
            >
              <option value="off">Subtitles off</option>
              {urls.subtitles.map((t) => (
                <option key={t.lang} value={t.lang}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
    </div>
  );
}
