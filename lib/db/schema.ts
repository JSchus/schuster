import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";
// Relative import: drizzle-kit loads this file without tsconfig path aliases.
import { MEDIA_TYPES } from "../media-types";

export { MEDIA_TYPES, type MediaType } from "../media-types";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */


export const mediaType = pgEnum("media_type", MEDIA_TYPES);
export const mediaStatus = pgEnum("media_status", ["pending", "ready"]);
export const userRole = pgEnum("user_role", ["admin", "member"]);

/* ------------------------------------------------------------------ */
/* Auth.js tables (shape required by @auth/drizzle-adapter)             */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date", withTimezone: true }),
  image: text("image"),
  role: userRole("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/** WebAuthn credentials (passkeys). */
export const authenticators = pgTable(
  "authenticators",
  {
    credentialID: text("credential_id").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("provider_account_id").notNull(),
    credentialPublicKey: text("credential_public_key").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credential_device_type").notNull(),
    credentialBackedUp: boolean("credential_backed_up").notNull(),
    transports: text("transports"),
  },
  (t) => [primaryKey({ columns: [t.userId, t.credentialID] })],
);

/* ------------------------------------------------------------------ */
/* Media                                                               */
/* ------------------------------------------------------------------ */

/** Free-form metadata extracted in the browser (EPUB OPF, video probe, ...). */
export type MediaMetadata = {
  author?: string;
  publisher?: string;
  language?: string;
  durationSec?: number;
  width?: number;
  height?: number;
  originalFilename?: string;
  /** WebVTT tracks for videos (Stage 3). */
  subtitles?: { lang: string; label: string; key: string }[];
  /** Retro games: the console (a key of SYSTEMS in lib/games/systems.ts). */
  system?: string;
  /** HTML5 web games: entry page inside webgames/{id}/, published after upload. */
  web?: { entry: string; status: "pending" | "ready"; files?: number; publishedAt?: string };
};

export const mediaItems = pgTable(
  "media_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: mediaType("type").notNull(),
    status: mediaStatus("status").notNull().default("pending"),
    title: text("title").notNull(),
    description: text("description"),
    coverKey: text("cover_key"),
    fileKey: text("file_key").notNull(),
    /** In-flight S3 multipart upload id; cleared once the upload completes. */
    uploadId: text("upload_id"),
    size: bigint("size", { mode: "number" }).notNull(),
    mime: text("mime").notNull(),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    metadata: jsonb("metadata").$type<MediaMetadata>().notNull().default({}),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("media_items_type_idx").on(t.type),
    index("media_items_created_at_idx").on(t.createdAt),
    index("media_items_tags_idx").using("gin", t.tags),
  ],
);

/**
 * Reading/playback position per user and item. `position` is opaque to the
 * DB: an EPUB CFI for books, seconds for video/audio (Stages 2–3).
 */
export const userProgress = pgTable(
  "user_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    position: text("position").notNull(),
    /** 0–100, for "continue" shelves. */
    percent: integer("percent"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const favorites = pgTable(
  "favorites",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => mediaItems.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.itemId] }),
    index("favorites_item_idx").on(t.itemId),
  ],
);

export type User = typeof users.$inferSelect;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
