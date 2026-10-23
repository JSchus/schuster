import type { MediaType } from "@/lib/media-types";

export { canMakeCover } from "@/lib/media-types";
import type { MediaMetadata } from "@/lib/db/schema";
import { detectMediaType, normalizeMime, titleFromFilename } from "./detect";
import { parseEpub } from "./epub";
import { imageSize, toCoverJpeg } from "./image";
import { probeAudio, probeVideo } from "./media";

/** ok: cover made · none: the file has no cover to offer · failed: it has one but we couldn't make it. */
export type CoverStatus = "ok" | "none" | "failed";

export type Extracted = {
  type: MediaType;
  mime: string;
  title: string;
  description?: string;
  tags: string[];
  metadata: Omit<MediaMetadata, "originalFilename">;
  cover?: Blob;
  coverStatus: CoverStatus;
};

/**
 * Run in the browser before upload. Never throws: extraction is best-effort,
 * so a corrupt EPUB still uploads with a filename-derived title, and a cover
 * that can't be rendered never costs the title or author.
 */
export async function extractFileInfo(file: File): Promise<Extracted> {
  const mime = normalizeMime(file.name, file.type);
  const base: Extracted = {
    type: detectMediaType(file.name, mime),
    mime,
    title: titleFromFilename(file.name),
    tags: [],
    metadata: {},
    coverStatus: "none",
  };
  try {
    if (mime === "application/epub+zip") return { ...base, ...(await extractEpub(file, base.title)) };
    if (base.type === "video") return { ...base, ...(await extractVideo(file)) };
    if (base.type === "audio") return { ...base, metadata: await probeAudio(file) };
    if (mime.startsWith("image/")) return { ...base, ...(await extractImage(file)) };
  } catch (err) {
    console.warn(`Metadata extraction failed for ${file.name}`, err);
  }
  return base;
}

/**
 * Just the cover for a file already in the library ("Make cover"). Videos
 * are read from `source` as a URL so only the needed byte ranges download.
 */
export async function makeCover(
  type: MediaType,
  mime: string,
  source: Blob | string,
): Promise<{ cover?: Blob; coverStatus: CoverStatus }> {
  if (type === "video") return extractVideo(source);
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  if (type === "book") return extractEpub(blob);
  if (mime.startsWith("image/")) return extractImage(blob);
  return { coverStatus: "none" };
}

async function extractEpub(file: Blob, fallbackTitle?: string) {
  const epub = await parseEpub(file);
  const image = epub.cover && new Blob([epub.cover.data as BlobPart], { type: epub.cover.mime });
  const { cover, coverStatus } = await render(image);
  return {
    title: epub.title ?? fallbackTitle ?? "Untitled",
    description: epub.description,
    tags: epub.subjects.map((s) => s.toLowerCase()).slice(0, 10),
    metadata: { author: epub.author, publisher: epub.publisher, language: epub.language },
    cover,
    coverStatus,
  };
}

async function extractVideo(source: Blob | string) {
  const { poster, ...metadata } = await probeVideo(source);
  // No video track (e.g. an audio-only .mp4) means there's nothing to grab.
  const coverStatus: CoverStatus = poster ? "ok" : metadata.width ? "failed" : "none";
  return { metadata, cover: poster, coverStatus };
}

async function extractImage(file: Blob) {
  const metadata = await imageSize(file).catch(() => ({}));
  return { metadata, ...(await render(file)) };
}

/** Turn a source image into a JPEG cover, recording failure instead of throwing. */
async function render(image: Blob | undefined): Promise<{ cover?: Blob; coverStatus: CoverStatus }> {
  if (!image) return { coverStatus: "none" };
  try {
    return { cover: await toCoverJpeg(image), coverStatus: "ok" };
  } catch (err) {
    console.warn("Cover image could not be rendered", err);
    return { coverStatus: "failed" };
  }
}
