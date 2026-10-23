import type { MediaType } from "@/lib/media-types";
import type { MediaMetadata } from "@/lib/db/schema";
import { detectMediaType, normalizeMime, titleFromFilename } from "./detect";
import { parseEpub } from "./epub";
import { toCoverJpeg } from "./image";
import { probeAudio, probeVideo } from "./media";

export type Extracted = {
  type: MediaType;
  mime: string;
  title: string;
  description?: string;
  tags: string[];
  metadata: Omit<MediaMetadata, "originalFilename">;
  cover?: Blob;
};

/**
 * Run in the browser before upload. Never throws: extraction is best-effort,
 * so a corrupt EPUB still uploads with a filename-derived title.
 */
export async function extractFileInfo(file: File): Promise<Extracted> {
  const mime = normalizeMime(file.name, file.type);
  const base: Extracted = {
    type: detectMediaType(file.name, mime),
    mime,
    title: titleFromFilename(file.name),
    tags: [],
    metadata: {},
  };
  try {
    if (mime === "application/epub+zip") {
      const epub = await parseEpub(file);
      return {
        ...base,
        title: epub.title ?? base.title,
        description: epub.description,
        tags: epub.subjects.map((s) => s.toLowerCase()).slice(0, 10),
        metadata: { author: epub.author, publisher: epub.publisher, language: epub.language },
        cover: epub.cover
          ? await toCoverJpeg(new Blob([epub.cover.data as BlobPart], { type: epub.cover.mime }))
          : undefined,
      };
    }
    if (base.type === "video") {
      const { poster, ...metadata } = await probeVideo(file);
      return { ...base, metadata, cover: poster };
    }
    if (base.type === "audio") {
      return { ...base, metadata: await probeAudio(file) };
    }
  } catch (err) {
    console.warn(`Metadata extraction failed for ${file.name}`, err);
  }
  return base;
}
