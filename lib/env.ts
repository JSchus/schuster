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
