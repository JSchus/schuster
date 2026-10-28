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

/* Contacts and the family directory */

const birthday = z
  .string()
  .regex(/^(\d{4}|-)-\d{2}-\d{2}$/, "Birthday must look like 1985-04-12")
  .nullable();
const contactEmail = z.string().trim().toLowerCase().email().max(320);
const contactPhone = z
  .string()
  .trim()
  .max(40)
  .transform((p) => {
    const digits = p.replace(/[^\d]/g, "");
    return digits ? (p.startsWith("+") ? `+${digits}` : digits) : "";
  });

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(200),
  emails: z.array(contactEmail).max(10).default([]),
  phones: z
    .array(contactPhone)
    .max(10)
    .default([])
    .transform((ps) => [...new Set(ps.filter(Boolean))]),
  birthday: birthday.default(null),
  org: z.string().trim().max(200).nullable().default(null),
  note: z.string().trim().max(2000).nullable().default(null),
});
export type ContactBody = z.input<typeof contactSchema>;

export const contactPatchSchema = contactSchema.partial().strict();

export const IMPORT_BATCH = 500;

/**
 * Already parsed in the browser (lib/contacts/vcard.ts). Lenient on purpose:
 * the route re-cleans each email and phone and drops bad ones, so one odd
 * address can't reject a batch of 500.
 */
export const contactImportSchema = z.object({
  contacts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        emails: z.array(z.string().max(320)).max(10).default([]),
        phones: z.array(z.string().max(40)).max(10).default([]),
        birthday: z.string().max(40).nullable().default(null),
        org: z.string().trim().max(200).nullable().default(null),
        note: z.string().trim().max(2000).nullable().default(null),
        uid: z.string().trim().max(200).nullable().default(null),
      }),
    )
    .min(1)
    .max(IMPORT_BATCH),
});

export const profileSchema = z.object({
  displayName: z.string().trim().max(200).nullable(),
  phone: z.string().trim().max(40).nullable(),
  birthday,
  address: z.string().trim().max(500).nullable(),
  note: z.string().trim().max(500).nullable(),
  listed: z.boolean(),
});
export type ProfileBody = z.input<typeof profileSchema>;
