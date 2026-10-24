import { encodeTime, percentOf } from "./position";

/**
 * Save a song's position the same way the single-song player does: into
 * localStorage (so /listen/{id} resumes there) and as "pending" for the
 * server. The PUT clears the pending copy when it lands; if it doesn't,
 * ProgressFlusher retries when back online.
 */
export function saveTrackProgress(itemId: string, seconds: number, duration: number, ended = false) {
  if (!Number.isFinite(duration) || duration <= 0) return;
  const spot = {
    position: encodeTime(ended ? duration : seconds),
    percent: Math.round(ended ? 100 : percentOf(seconds, duration)),
    at: Date.now(),
  };
  const body = JSON.stringify(spot);
  try {
    localStorage.setItem(`progress:${itemId}`, body);
    localStorage.setItem(`progress-pending:${itemId}`, body);
  } catch {}
  void fetch(`/api/progress/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then((res) => {
      if (res.ok && localStorage.getItem(`progress-pending:${itemId}`) === body) {
        localStorage.removeItem(`progress-pending:${itemId}`);
      }
    })
    .catch(() => {});
}
