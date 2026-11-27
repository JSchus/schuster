import "server-only";
import { z } from "zod";

/**
 * Server environment, validated lazily on first access so `next build`
 * succeeds without secrets present. See README "Environment variables".
 */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(16),
  AUTH_RESEND_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Schuster Media <login@mail.schuster.me>"),
  ALLOWED_EMAILS: z.string().default(""),
  STORAGE_DRIVER: z.enum(["s3", "memory"]).default("s3"),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  /** Email aliases (Amazon SES). The domain is a subdomain: schuster.me's own mail stays with IONOS. */
  MAIL_DOMAIN: z.string().default("m.schuster.me"),
  /** ARN of the SNS topic SES notifies; the inbound route only trusts messages from it. */
  MAIL_INBOUND_TOPIC_ARN: z.string().optional(),
  /** "ses" (default) or "memory" (tests). */
  MAIL_DRIVER: z.enum(["ses", "memory"]).default("ses"),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false", ""])
    .default("false")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
    }
    cached = parsed.data;
  }
  return cached;
}
