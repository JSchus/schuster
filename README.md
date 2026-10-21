# Schuster Media

A private media hub at **[schuster.me](https://schuster.me)** for family and friends to store and enjoy ebooks, video, audio, games and files.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · Drizzle ORM on Postgres (Neon) · Auth.js v5 (passkeys + email magic link) · AWS S3 · deployed on Vercel Hobby.

> **Status:** Stage 1 (foundation). See [docs/ROADMAP.md](docs/ROADMAP.md) for the reader, player, games and sharing stages.

---

## Architecture

Vercel Hobby functions are short-lived and bandwidth-metered, so **media bytes never pass through Next.js**. The server only handles auth, database rows and URL signing.

```
                    ┌──────────── control plane (tiny JSON) ────────────┐
 Browser ──────────►│ Next.js on Vercel: auth · Postgres rows · signing │──► Neon Postgres
   │                └────────────────────────┬───────────────────────────┘
   │   presigned PUT (multipart parts)       │ CreateMultipartUpload /
   │   presigned GET (download, covers)      │ Complete / Abort / Head
   ▼                                         ▼
 ┌──────────────────────── AWS S3 bucket ────────────────────────┐
 │  media/{itemId}/{file}            covers/{itemId}.jpg         │
 └───────────────────────────────────────────────────────────────┘
```

### Upload flow

1. **In the browser**, before any upload starts, `lib/extract` reads:
   - **EPUB:** title, author, description, subjects (become tags) and the cover image (downscaled to JPEG);
   - **video:** duration, resolution and a poster frame;
   - **audio:** duration.
2. `POST /api/uploads` creates a `pending` row and an S3 multipart upload. The server chooses the object key; the client never does.
3. The `uploadFile` helper in `lib/upload/uploader.ts` sends 10 MiB+ parts **straight to S3**:
   - 4 parts in parallel, using presigned URLs fetched in batches of 20;
   - each part retries with backoff;
   - per-file progress is reported to the UI.
4. The cover is uploaded via its own presigned PUT.
5. `POST /api/uploads/:id/complete` completes the multipart upload and verifies the object size with HEAD. It then marks the item `ready`. Failures and cancellations abort the upload.

Downloads hit `/api/items/:id/download`, which returns a **302** to a 5-minute presigned GET. Cover URLs are signed with an hour-aligned timestamp so the browser can cache them.

### Storage adapter

`lib/storage/types.ts` defines a small `StorageAdapter` interface:
- create / presign parts / complete / abort a multipart upload;
- presign a PUT or a GET;
- head and delete.

`S3StorageAdapter` implements it for AWS and any S3-compatible service; `MemoryStorageAdapter` backs the tests. To add a backend (R2, B2, GCS…), implement the interface and add a case to `getStorage()` in `lib/storage/index.ts`.

### Auth

- **Passkeys** (WebAuthn) are the primary login. The **email magic link** (via Resend) is the fallback, and you can add a passkey after signing in with it (the key icon in the header).
- **The first account ever created becomes admin.** This is a single atomic SQL `UPDATE … WHERE NOT EXISTS (admin)`, so two simultaneous sign-ups can't both win.
- **New accounts are limited to `ALLOWED_EMAILS`** until Stage 5 adds invites. Existing users can always sign in.
- Sessions are JWTs, so the edge middleware never touches the database.

---

## Project layout

```
app/
  (app)/                 signed-in pages: library, items/[id], upload
  login/                 passkey + magic-link sign-in
  api/uploads/…          upload control plane (init, parts, cover, complete, cancel)
  api/items/[id]/download  302 → presigned S3 URL
  manifest.ts, icons/, icon.tsx, apple-icon.tsx, offline/   PWA
components/
  ui/                    shadcn/ui primitives
  library/ upload/ auth/ feature components (small, one job each)
lib/
  db/                    Drizzle schema, client, queries
  storage/               StorageAdapter, S3 + memory implementations, key layout
  upload/                part planning, uploader, browser transport, API protocol (zod)
  extract/               in-browser EPUB / video / audio metadata extraction
  auth/                  allowlist + first-admin logic
drizzle/                 generated SQL migrations
infra/                   S3 CORS, IAM policy, lifecycle rule (paste into AWS)
public/sw.js             service worker
tests/                   Vitest suites
```

---

## Local development

**Prerequisites:** Node 20.18+ (22 recommended), pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env.local          # then set AUTH_SECRET (npx auth secret)
docker compose up -d                # Postgres on :5432, S3 emulator on :5055
pnpm dev:s3                         # create the bucket + apply infra/s3-cors.json
pnpm db:migrate                     # apply drizzle/ migrations
pnpm dev                            # http://localhost:3000
```

Then:
- Open `/login` → **First time here? Create a passkey**. You become the admin.
- Without `AUTH_RESEND_KEY`, magic links are **printed to the dev server console**.
- Passkeys work on `localhost` in all modern browsers. The local S3 emulator keeps objects in memory: after restarting it, run `pnpm dev:s3` again.
- The service worker only registers in production builds (`pnpm build && pnpm start`).

### Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Next.js dev server |
| `pnpm build` / `pnpm start` | Production build / serve |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest (storage adapter, upload planner/uploader/API routes, EPUB parser) |
| `pnpm db:generate` | Generate a migration after editing `lib/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations to `DATABASE_URL` |
| `pnpm db:studio` | Drizzle Studio |
| `pnpm dev:s3` | Create the local bucket and apply CORS |
| `pnpm preflight [envfile]` | Check production credentials (DB, migrations, S3 CORS/permissions, Resend) before deploying. Defaults to `.env.production.local` |

---

## Environment variables

All of them are server-side. They are validated lazily in `lib/env.ts`, so `next build` works without secrets.

| Variable | Required | Example | Purpose |
| --- | --- | --- | --- |
| `DATABASE_URL` | ✅ | `postgresql://…neon.tech/neondb?sslmode=require` | Postgres connection. Neon URLs use the serverless HTTP driver; anything else uses `postgres-js`. Use Neon's **pooled** string. |
| `AUTH_SECRET` | ✅ | `npx auth secret` | Encrypts session JWTs and signs tokens. ≥ 16 chars. |
| `AUTH_URL` | prod | `https://schuster.me` | Canonical origin. Passkeys are bound to this domain (WebAuthn RP ID), so keep it stable. |
| `AUTH_TRUST_HOST` | non-Vercel | `true` | Trust the `Host` header. Vercel sets this automatically. |
| `AUTH_RESEND_KEY` | prod | `re_…` | [Resend](https://resend.com) API key for magic-link emails. Empty in dev = links logged to the console. |
| `EMAIL_FROM` | | `Schuster Media <login@mail.schuster.me>` | Sender address. Its domain (`mail.schuster.me`) must be verified in Resend. A subdomain keeps Resend apart from the IONOS mailboxes on `schuster.me`. |
| `ALLOWED_EMAILS` | | `mom@x.com, sam@y.org` | Who may **create** an account. The first account is always allowed (and becomes admin). |
| `STORAGE_DRIVER` | | `s3` | `s3` (default) or `memory` (tests only). |
| `S3_BUCKET` | ✅ | `schuster-media` | Bucket name. |
| `S3_REGION` | ✅ | `us-east-1` | Bucket region. |
| `S3_ACCESS_KEY_ID` | ✅ | `AKIA…` | IAM user key (see `infra/iam-policy.json`). |
| `S3_SECRET_ACCESS_KEY` | ✅ | | IAM user secret. |
| `S3_ENDPOINT` | | `http://localhost:5055` | Only for S3-compatible services. **Leave empty for AWS.** |
| `S3_FORCE_PATH_STYLE` | | `true` | Path-style URLs (needed by most emulators). `false` for AWS. |

---

## AWS setup

1. **Create a bucket** (e.g. `schuster-media`) in your region.
   - Keep **Block Public Access ON**: everything is served through presigned URLs.
2. **CORS:** Bucket → Permissions → CORS → paste [`infra/s3-cors.json`](infra/s3-cors.json).
   - `ExposeHeaders: ETag` is **required**: the browser reads each part's ETag to complete the upload.
   - Add any preview domains you use to `AllowedOrigins`.
3. **Lifecycle:** Bucket → Management → Create lifecycle rule. Choose "Delete expired object delete markers or incomplete multipart uploads" and set 3 days, or apply [`infra/s3-lifecycle.json`](infra/s3-lifecycle.json) with
   `aws s3api put-bucket-lifecycle-configuration --bucket schuster-media --lifecycle-configuration file://infra/s3-lifecycle.json`.
4. **IAM:**
   - Create an IAM user (e.g. `schuster-media-app`) with **no console access**.
   - Attach an inline policy from [`infra/iam-policy.json`](infra/iam-policy.json), replacing `REPLACE_WITH_BUCKET_NAME`.
   - Create an access key and put it in `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`.

## Neon setup

1. Create a project at [neon.tech](https://neon.tech) in a region near your bucket and Vercel functions (e.g. `us-east-1`).
2. Copy the **pooled** connection string into `DATABASE_URL`.
3. Run the migrations from your machine:
   `DATABASE_URL='postgresql://…' pnpm db:migrate`

## Deploying to Vercel (Hobby)

> **Step-by-step:** follow [docs/DEPLOY.md](docs/DEPLOY.md). It has exact values to paste, a `pnpm preflight` credential check, and troubleshooting.

1. Push this repo to GitHub and **Import** it in Vercel. The framework (Next.js) and pnpm are auto-detected.
2. **Settings → Environment Variables:** add every ✅ / prod variable above for Production (and Preview if you use it):
   - `AUTH_URL=https://schuster.me`
   - leave `S3_ENDPOINT` empty
   - `S3_FORCE_PATH_STYLE=false`
3. **Settings → Domains:** add `schuster.me` (and redirect `www.schuster.me` to it). At your DNS host:
   - point the apex `A` record to `76.76.21.21`;
   - set `www` as a `CNAME` to `cname.vercel-dns.com`.

   Use the A/CNAME method, **not** Vercel nameservers. Leave every MX, TXT and mail CNAME alone: the IONOS mailboxes on `schuster.me` depend on them.
4. **Resend:** verify the subdomain `mail.schuster.me` (its DNS records all live under `mail.`), then set `AUTH_RESEND_KEY` and `EMAIL_FROM`.
5. Run `pnpm db:migrate` against the Neon URL (once per schema change), then deploy.
6. Visit `https://schuster.me/login` and **create the first passkey right away**: that account becomes admin. Afterwards, only `ALLOWED_EMAILS` can sign up.

**Hobby-plan notes:**
- Every API route sets `maxDuration = 10` and does only DB and signing work.
- Uploads and downloads are browser ↔ S3, so they don't count against Vercel bandwidth or function time.
- Images use plain `<img>` (no Vercel image optimisation).

### Installing the app (PWA)

- **Android / Chrome:** menu → *Install app*.
- **iOS / Safari:** Share → *Add to Home Screen*.

The manifest, maskable icons, Apple touch icon and an offline fallback page are included.

---

## Testing

`pnpm test` runs:
- `tests/storage/s3.test.ts`:
  - the S3 adapter commands (via `aws-sdk-client-mock`);
  - presigned URL contents;
  - no browser-incompatible checksum params;
  - stable cover signatures.
- `tests/storage/memory.test.ts`: adapter contract and key sanitising.
- `tests/upload/plan.test.ts`: part sizing at the S3 limits.
- `tests/upload/uploader.test.ts`: concurrency, presign batching, monotonic progress, retries, abort on failure/cancel, cover handling.
- `tests/upload/routes.test.ts`:
  - the real route handlers end to end (init → parts → cover → complete), using the memory adapter;
  - the 401, 404, ownership and size-mismatch cases.
- `tests/extract/epub.test.ts`: EPUB 2 and 3 metadata and cover extraction.
