import { canvasToJpeg, drawScaled, isMostlyDark } from "./image";

export type VideoInfo = { durationSec?: number; width?: number; height?: number; poster?: Blob };

/** Fractions of the duration tried, in order, until a frame isn't black. */
const POSTER_POSITIONS = [0.1, 0.25, 0.5];

/**
 * Probe a video: duration, dimensions, and a poster frame. `source` is a
 * local file (before upload) or a presigned URL (making a cover for an item
 * already in the library; the browser fetches only the byte ranges it needs).
 *
 * The poster is best-effort: if grabbing a frame fails, duration and size are
 * still returned.
 */
export async function probeVideo(source: Blob | string, timeoutMs = 20_000): Promise<VideoInfo> {
  const local = typeof source !== "string";
  const url = local ? URL.createObjectURL(source) : source;
  const video = document.createElement("video");
  // "auto" (not "metadata"): Safari otherwise reports a seek as done before
  // it has decoded the frame, and the canvas captures solid black.
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  // Presigned S3 URLs are cross-origin; CORS keeps the canvas readable.
  if (!local) video.crossOrigin = "anonymous";
  // Keep it in the document (invisibly): Safari may not decode frames for
  // detached video elements.
  video.style.cssText = "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
  document.body.appendChild(video);
  video.src = url;
  try {
    await once(video, "loadedmetadata", timeoutMs);
    const info: VideoInfo = {
      durationSec: finite(video.duration),
      width: video.videoWidth || undefined,
      height: video.videoHeight || undefined,
    };
    if (video.videoWidth) {
      try {
        info.poster = await grabPoster(video, info.durationSec ?? 0, timeoutMs);
      } catch (err) {
        console.warn("Poster frame failed", err);
      }
    }
    return info;
  } finally {
    video.removeAttribute("src");
    video.load();
    video.remove();
    if (local) URL.revokeObjectURL(url);
  }
}

/** Seek through POSTER_POSITIONS and keep the first frame that isn't black. */
async function grabPoster(video: HTMLVideoElement, duration: number, timeoutMs: number): Promise<Blob> {
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await once(video, "loadeddata", timeoutMs);
  let canvas: HTMLCanvasElement | undefined;
  for (const fraction of POSTER_POSITIONS) {
    await seekTo(video, duration * fraction, timeoutMs);
    canvas = drawScaled(video, 800);
    const ctx = canvas.getContext("2d")!;
    if (!isMostlyDark(ctx.getImageData(0, 0, canvas.width, canvas.height).data)) break;
  }
  // Every sample was dark: the video may simply be dark, so keep the last.
  return canvasToJpeg(canvas!);
}

/** Seek and wait until the new frame has actually been painted. */
async function seekTo(video: HTMLVideoElement, time: number, timeoutMs: number): Promise<void> {
  const target = Math.max(0.1, Math.min(time, (video.duration || time) - 0.1));
  if (Math.abs(video.currentTime - target) > 0.01) {
    const seeked = once(video, "seeked", timeoutMs);
    video.currentTime = target;
    await seeked;
  }
  await nextFrame(video);
}

/** Resolve once a decoded frame is presented (or after a short fallback). */
function nextFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 500);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(() => done());
    } else {
      requestAnimationFrame(() => requestAnimationFrame(done));
    }
  });
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
