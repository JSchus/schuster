import { z } from "zod";
import { SYSTEM_IDS } from "@/lib/games/systems";
import { safeGamePath } from "@/lib/games/web";
import { MEDIA_TYPES } from "@/lib/media-types";
import { MAX_PARTS } from "./plan";

/**
 * Request/response shapes shared by the upload API routes and the browser
 * client. Every route is a small control-plane call; bytes go to S3 directly.
 */

export const metadataSchema = z
  .object({
    author: z.string().max(500).optional(),
    publisher: z.string().max(500).optional(),
    language: z.string().max(50).optional(),
    durationSec: z.number().nonnegative().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    originalFilename: z.string().max(500).optional(),
    system: z.enum(SYSTEM_IDS as [string, ...string[]]).optional(),
    // Always stored as "pending" (see the init route); it becomes "ready" only after publishing.
    web: z.object({ entry: z.string().min(1).max(300).refine((e) => !!safeGamePath(e), "Invalid entry path"), status: z.enum(["pending", "ready"]) }).strict().optional(),
  })
  .strict();

const tagsSchema = z
  .array(z.string().trim().toLowerCase().min(1).max(40))
  .max(30)
  .transform((t) => [...new Set(t)]);

export const initRequestSchema = z.object({
  filename: z.string().min(1).max(500),
  size: z.number().int().nonnegative(),
  mime: z.string().max(200).default("application/octet-stream"),
  type: z.enum(MEDIA_TYPES),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).optional(),
  tags: tagsSchema.default([]),
  metadata: metadataSchema.default({}),
});
export type InitRequest = z.input<typeof initRequestSchema>;

export type InitResponse = {
  itemId: string;
  partSize: number;
  partCount: number;
};

export const partsRequestSchema = z.object({
  partNumbers: z.array(z.number().int().min(1).max(MAX_PARTS)).min(1).max(100),
});
export type PartsResponse = { parts: { partNumber: number; url: string }[] };

export const coverRequestSchema = z.object({
  contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});
export type CoverResponse = { url: string };

export const completeRequestSchema = z.object({
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(MAX_PARTS), etag: z.string().min(1) }))
    .min(1)
    .max(MAX_PARTS),
  hasCover: z.boolean().default(false),
});
export type CompleteRequest = z.input<typeof completeRequestSchema>;
export type CompleteResponse = { itemId: string };
