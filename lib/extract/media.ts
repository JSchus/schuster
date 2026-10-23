import { toCoverJpeg } from "./image";

export type VideoInfo = { durationSec?: number; width?: number; height?: number; poster?: Blob };

/**
 * Probe a local video file: duration, dimensions, and a poster frame taken at
 * min(1s, 10%) — the very first frame is often black.
 */
export async function probeVideo(file: Blob, timeoutMs = 15_000): Promise<VideoInfo> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await once(video, "loadedmetadata", timeoutMs);
    const info: VideoInfo = {
      durationSec: finite(video.duration),
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
    };
    if (video.videoWidth) {
      video.currentTime = Math.min(1, (info.durationSec ?? 0) * 0.1);
      await once(video, "seeked", timeoutMs);
      info.poster = await toCoverJpeg(video, 800);
    }
    return info;
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/** Duration of a local audio file. */
export async function probeAudio(file: Blob, timeoutMs = 10_000): Promise<{ durationSec?: number }> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement("audio");
  audio.preload = "metadata";
  audio.src = url;
  try {
    await once(audio, "loadedmetadata", timeoutMs);
    return { durationSec: finite(audio.duration) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function finite(n: number): number | undefined {
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : undefined;
}

function once(el: HTMLMediaElement, event: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error(`Timed out waiting for ${event}`)), timeoutMs);
    const onEvent = () => done();
    const onError = () => done(new Error("Browser cannot decode this media"));
    function done(err?: Error) {
      clearTimeout(timer);
      el.removeEventListener(event, onEvent);
      el.removeEventListener("error", onError);
      if (err) reject(err);
      else resolve();
    }
    el.addEventListener(event, onEvent, { once: true });
    el.addEventListener("error", onError, { once: true });
  });
}
