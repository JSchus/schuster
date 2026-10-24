/** Play-order helpers for the playlist player (pure, tested). */

export type RepeatMode = "off" | "all" | "one";

/** Position after `pos` in a queue of `length`, or null at the end (unless repeating). */
export function nextIndex(pos: number, length: number, repeat: Exclude<RepeatMode, "one">): number | null {
  if (length === 0) return null;
  if (pos + 1 < length) return pos + 1;
  return repeat === "all" ? 0 : null;
}

/** Position before `pos`; at the start it stays put unless repeating. */
export function prevIndex(pos: number, length: number, repeat: Exclude<RepeatMode, "one">): number {
  if (pos > 0) return pos - 1;
  return repeat === "all" && length > 0 ? length - 1 : 0;
}

/**
 * A random order of 0..length-1 that starts with `first`, so turning
 * shuffle on doesn't interrupt the song that's playing.
 */
export function shuffled(length: number, first: number, random: () => number = Math.random): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return length > 0 && first >= 0 && first < length ? [first, ...rest] : rest;
}
