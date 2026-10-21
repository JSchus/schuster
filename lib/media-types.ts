/** The kinds of things the library holds. Shared by client and server. */
export const MEDIA_TYPES = ["book", "video", "audio", "game", "file"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  book: "Books",
  video: "Video",
  audio: "Audio",
  game: "Games",
  file: "Files",
};

export function isMediaType(v: unknown): v is MediaType {
  return typeof v === "string" && (MEDIA_TYPES as readonly string[]).includes(v);
}
