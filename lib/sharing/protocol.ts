import { z } from "zod";
import { ROLES, VISIBILITIES } from "@/lib/permissions";
import { tagsSchema } from "@/lib/upload/protocol";

/**
 * Request shapes for Stage 5 routes (items, shares, shelves, admin), shared
 * by the route handlers and the browser forms.
 */

const people = z.array(z.string().uuid()).max(200);

export const itemPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    description: z.string().trim().max(10_000).nullable(),
    author: z.string().trim().max(500).nullable(),
    tags: tagsSchema,
    visibility: z.enum(VISIBILITIES),
    /** With visibility "people": who besides the uploader can see it. */
    people,
  })
  .partial()
  .strict();
export type ItemPatchBody = z.input<typeof itemPatchSchema>;

export const SHARE_DAYS = [1, 7, 30] as const;

export const shareCreateSchema = z.object({
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  password: z.string().min(4).max(200).optional(),
  allowDownload: z.boolean().default(true),
});
export type ShareCreateBody = z.input<typeof shareCreateSchema>;

export const shelfSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000).nullable(),
    visibility: z.enum(VISIBILITIES),
    people,
  })
  .partial()
  .strict();
export type ShelfBody = z.input<typeof shelfSchema>;

export const shelfItemSchema = z.object({ itemId: z.string().uuid() });

/** Playlists take the same fields as shelves. */
export const playlistSchema = shelfSchema;
export type PlaylistBody = ShelfBody;
export const trackSchema = z.object({ itemId: z.string().uuid() });
export const reorderSchema = z.object({ itemIds: z.array(z.string().uuid()).max(2000) });

export const INVITE_DAYS = [1, 7, 30] as const;

export const inviteCreateSchema = z.object({
  role: z.enum(ROLES).exclude(["admin"]),
  days: z.union([z.literal(1), z.literal(7), z.literal(30)]),
  maxUses: z.number().int().min(1).max(50),
  note: z.string().trim().max(200).optional(),
});
export type InviteCreateBody = z.input<typeof inviteCreateSchema>;

const email = z.string().trim().toLowerCase().email().max(320);

export const approvalSchema = z.object({ email, role: z.enum(ROLES).exclude(["admin"]) });
export const removeApprovalSchema = z.object({ email });
export const redeemSchema = z.object({ email });
export const roleSchema = z.object({ role: z.enum(ROLES) });

/** Absolute link for an invite or share token. */
export function inviteUrl(origin: string, token: string) {
  return `${origin}/invite/${token}`;
}
export function shareUrl(origin: string, token: string) {
  return `${origin}/s/${token}`;
}

export const LINK_DAYS = [1, 7, 30, 365] as const;

export const linkCreateSchema = z.object({
  target: z.string().min(1).max(2048),
  /** Optional custom word; normalized server-side. Omitted → random. */
  slug: z.string().max(100).optional(),
  note: z.string().trim().max(200).optional(),
  /** null or omitted = never expires. */
  days: z.union([z.literal(1), z.literal(7), z.literal(30), z.literal(365), z.null()]).optional(),
  /** Exact expiry (ms), e.g. to match a share link's; at most about a year ahead. */
  expiresAt: z
    .number()
    .int()
    .refine((t) => t > Date.now() && t < Date.now() + 400 * 86_400_000, "Expiry must be within the next year")
    .optional(),
  password: z.string().min(4).max(200).optional(),
});
export type LinkCreateBody = z.input<typeof linkCreateSchema>;

export const linkPatchSchema = z
  .object({
    target: z.string().min(1).max(2048),
    note: z.string().trim().max(200).nullable(),
    disabled: z.boolean(),
  })
  .partial()
  .strict();

export function shortUrl(origin: string, slug: string) {
  return `${origin}/go/${slug}`;
}
