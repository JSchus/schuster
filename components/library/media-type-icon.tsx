import { BookOpen, File as FileIcon, Film, Gamepad2, Music, type LucideProps } from "lucide-react";
import type { MediaType } from "@/lib/media-types";

const ICONS = { book: BookOpen, video: Film, audio: Music, game: Gamepad2, file: FileIcon };

/** Lucide icon for a media type. */
export function MediaTypeIcon({ type, ...props }: { type: MediaType } & LucideProps) {
  const Icon = ICONS[type];
  return <Icon {...props} />;
}
