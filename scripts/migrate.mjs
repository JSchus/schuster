// Apply pending Drizzle migrations (drizzle/*.sql) before `next build`.
//
// Runs on Vercel *production* builds only, so a preview deploy of an unmerged
// branch never changes the shared database. Locally it runs when called with
// --force (`pnpm db:migrate`). Migrations are additive; if one fails the
// build fails and the previous deployment keeps serving.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const force = process.argv.includes("--force");
if (!force && process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
  process.exit(0);
}

const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

// postgres.js sends unknown URL parameters (e.g. Neon's channel_binding=require)
// to the server as settings, which it rejects. Keep only the TLS choice.
const url = new URL(raw);
const sslmode = url.searchParams.get("sslmode");
url.search = "";
const client = postgres(url.toString(), {
  max: 1,
  prepare: false, // works through Neon's pgbouncer pooler
  ssl: sslmode && sslmode !== "disable" ? "require" : false,
  onnotice: () => {},
});

/**
 * A database whose first migration was pasted into Neon's SQL editor has the
 * tables but may lack the migrations table. Record 0000 as applied so the
 * migrator doesn't try to create the tables again.
 */
async function baseline() {
  const [state] = await client`
    select to_regclass('public.media_items') is not null as tables,
           to_regclass('drizzle.__drizzle_migrations') is not null as journal`;
  if (!state.tables) return;
  if (state.journal) {
    const [{ n }] = await client`select count(*)::int as n from drizzle.__drizzle_migrations`;
    if (n > 0) return;
  }
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  const first = journal.entries[0];
  const sql = readFileSync(`drizzle/${first.tag}.sql`, "utf8");
  const hash = createHash("sha256").update(sql).digest("hex");
  await client`create schema if not exists drizzle`;
  await client`create table if not exists drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
  await client`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${first.when})`;
  console.log(`[migrate] recorded ${first.tag} as already applied`);
}

try {
  await baseline();
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  console.log("[migrate] database is up to date");
} catch (err) {
  console.error("[migrate] failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}
