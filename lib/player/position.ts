/** Playback positions are stored as "t:<seconds>" in user_progress.position. */

export function encodeTime(seconds: number): string {
  return `t:${Math.max(0, Math.round(seconds * 10) / 10)}`;
}

export function decodeTime(position: string | undefined): number | undefined {
  const m = position?.match(/^t:(\d+(?:\.\d+)?)$/);
  return m ? Number(m[1]) : undefined;
}

export function percentOf(seconds: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (seconds / duration) * 100));
}

/**
 * Where to start playing from a saved position: resume, unless it was near
 * the end (the credits), in which case start over. "Near the end" is the
 * last 5% of the media, or up to 30 s for shorter things (capped at 10% so
 * a short clip doesn't count as "all credits").
 */
export function resumeTime(saved: number | undefined, duration: number): number {
  if (!saved || saved < 3) return 0;
  if (!Number.isFinite(duration) || duration <= 0) return saved;
  const tail = Math.max(duration * 0.05, Math.min(30, duration * 0.1));
  if (saved >= duration - tail) return 0;
  return saved;
}
