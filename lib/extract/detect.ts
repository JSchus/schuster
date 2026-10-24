import type { MediaType } from "@/lib/media-types";

const BOOK_EXT = /\.(epub|pdf|mobi|azw3?|cbz|cbr|djvu|fb2)$/i;
const GAME_EXT = /\.(nes|fds|unf|unif|sfc|smc|gb|gbc|gba|n64|z64|v64|nds|md|gen|smd|sms|gg|chd|pbp|cue|pce|a26|lnx|ws|wsc|ngp|swf)$/i;
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi)$/i;
const AUDIO_EXT = /\.(mp3|m4a|m4b|aac|flac|ogg|opus|wav)$/i;

/** Best-guess media type from MIME and extension. */
export function detectMediaType(name: string, mime: string): MediaType {
  if (BOOK_EXT.test(name) || mime === "application/epub+zip") return "book";
  if (GAME_EXT.test(name)) return "game";
  if (mime.startsWith("video/") || VIDEO_EXT.test(name)) return "video";
  if (mime.startsWith("audio/") || AUDIO_EXT.test(name)) return "audio";
  return "file";
}

/** Browsers often report "" for EPUB and ROMs; fill in a sensible MIME. */
export function normalizeMime(name: string, mime: string): string {
  if (mime) return mime;
  if (/\.epub$/i.test(name)) return "application/epub+zip";
  if (/\.pdf$/i.test(name)) return "application/pdf";
  return "application/octet-stream";
}

/** "my_great-movie.2019.mkv" → "my great movie 2019" */
export function titleFromFilename(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[._]+/g, " ").replace(/\s+/g, " ").trim() || name;
}
