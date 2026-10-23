import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let instance: Db | undefined;

/** True for Neon-hosted URLs, which use the stateless HTTP driver. */
export function isNeonUrl(url: string): boolean {
  return /\.neon\.tech\b/.test(new URL(url).hostname);
}

/**
 * Lazily-created Drizzle client. Neon → HTTP driver (one fetch per query,
 * ideal for short-lived serverless functions). Anything else (local Docker
 * Postgres) → postgres-js. Both expose the same query builder.
 */
export function db(): Db {
  if (!instance) {
    const url = env().DATABASE_URL;
    instance = isNeonUrl(url)
      ? drizzleNeon(neon(url), { schema })
      : (drizzlePg(postgres(url, { max: 5 }), { schema }) as unknown as Db);
  }
  return instance;
}

export { schema };
