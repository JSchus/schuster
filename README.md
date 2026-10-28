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
- **New accounts need an invite** (or an email the admin approved, or one listed in `ALLOWED_EMAILS`). Existing users can always sign in.
- Sessions are JWTs, so the edge middleware never touches the database. The role is re-read from the database at most every 5 minutes (`auth.ts`), so a role change or a removed account takes effect without a sign-out.

---

### Reader (Stage 2)

- `/read/[id]` opens EPUBs with **epub.js** and PDFs with **pdf.js** (legacy build for older iPads; its worker is copied to `public/pdf.worker.min.mjs` by `scripts/copy-pdf-worker.mjs` before `dev`/`build`). Books load from a 6-hour presigned S3 URL; PDFs stream with Range requests.
- **Progress sync** (`components/reader/use-progress-sync.ts`, `app/api/progress/[itemId]`): every page turn is written to `localStorage`, then a debounced `PUT` (and `sendBeacon` on close). The upsert only overwrites when the incoming timestamp is newer, so late offline syncs never roll back another device. `lib/reader/progress.ts#pickResume` chooses where to open.
- **Offline books** (`lib/reader/offline.ts`): "Keep offline" stores the file and its reader page in the `books` Cache API store; the service worker never clears it. `ProgressFlusher` sends queued positions from any page once back online.

### Player (Stage 3)

- `/watch/[id]` and `/listen/[id]` use the native `<video>`/`<audio>` element (`components/player/media-player.tsx`). It streams the presigned S3 URL, and Range requests make seeking work with no server involvement.
- Positions (`t:<seconds>`) reuse the reader's progress sync and API. `lib/player/position.ts#resumeTime` restarts instead of resuming in the last ~5%.
- Subtitles: `components/player/subtitle-manager.tsx` converts SRT→VTT in the browser (`lib/player/subtitles.ts`) and uploads via `/api/items/[id]/subtitles`. Tracks are listed in `metadata.subtitles`, and the media element uses `crossOrigin="anonymous"` so cross-origin tracks load.
- Expired URLs: one automatic refresh through `/api/items/[id]/stream`, which remounts the element and seeks back.

### Games (Stage 4)

- **EmulatorJS** is self-hosted: `scripts/copy-emulatorjs.mjs` (run by `pnpm assets` before `dev`/`build`) copies `@emulatorjs/emulatorjs` and 7 pinned cores into `public/emulatorjs/` (about 17 MB, gitignored). It also joins the sources into the `emulator.min.js` the loader expects. Consoles and cores are listed in `lib/games/systems.ts`.
- **`components/games/emulator.tsx`** sets the `EJS_*` globals. Its `EJS_onSaveState`/`EJS_onLoadState`/`EJS_onGameStart` hooks sync save states and in-game saves to `saves/{userId}/{itemId}/` through `/api/games/[id]/saves`. The user id always comes from the session.
- **Web games:** `lib/games/publish.ts` unzips in the browser and PUTs each file (with the right Content-Type, e.g. `application/wasm`) to `webgames/{id}/`. `infra/s3-webgames-policy.json` makes only that prefix publicly readable. Games play in a sandboxed iframe on S3's origin.

### Sharing, roles and invites (Stage 5)

- **Roles** (`lib/permissions.ts`): `admin` (everything), `member` (uploads, edits their own items, makes shelves and share links), `viewer` (reads, watches and plays only).
- **Invites** (`/admin` → *Invite someone*): a link `/invite/{token}` with a role, an expiry and a number of uses. Accepting one approves the email in `approved_emails` (one conditional `UPDATE` takes a use, so the last use can't be taken twice); the person then creates a passkey or gets an email link. Admins can also approve an email directly.
- **Visibility** per item and per shelf: *Everyone*, *Specific people* (`item_access` / `shelf_access`), or *Only me*. Every item query goes through `visibleTo(viewer)` in `lib/db/queries.ts`; admins see everything. A shelf only groups items: people see the items on it they're allowed to see.
- **Edit and delete** (uploader or admin): title, author, description, tags, visibility and cover (generated, or a picture from the device). Deleting removes the file, every cover version, subtitles, published web-game files and everyone's cloud saves from S3, then the row (progress, shelves and links cascade).
- **Share links** (`/s/{token}`): public, expire after 1, 7 or 30 days, optional password (scrypt; an httpOnly cookie remembers it for 12 h). Video, audio and images play inline from presigned S3 URLs that never outlive the link; everything else is a download. The owner sees view counts and can turn a link off.
- **Admin page** (`/admin`): people with roles, upload counts and storage; invite links; approved emails; total storage; cleanup of uploads that never finished.
- **Migrations** run automatically on Vercel **production** builds (`scripts/migrate.mjs`, before `next build`). Preview builds skip them, so an unmerged branch never changes the database.

### Playlists

- **Anyone signed in (viewers too)** can make playlists of audio items: *Playlists* in the header, or *Playlists* on any song's page. A playlist only lists songs, so each listener hears the ones they're allowed to see (`playlistTracksFor` in `lib/db/playlists.ts`). Visibility works like shelves; the owner or an admin edits it.
- **Player** (`components/player/playlist-player.tsx`): one native `<audio>` element (iOS background playback, AirPlay, lock screen), previous/next, shuffle, repeat, tap-to-play, auto-advance, Media Session `nexttrack`/`previoustrack`. It remembers the song and time per playlist, and saves each song's position through the normal progress API.
- **Public links:** the same share links as items (`shares.playlist_id`), made by members/admins who can edit the playlist. A link plays what its creator can see; per-song downloads are optional.
- **Offline** (`lib/player/offline-audio.ts`): *Keep offline* downloads every song straight from S3 into the `audio` Cache API store (each song stored once, shared between playlists). The service worker serves `/offline-audio/{id}` with byte ranges (`public/sw-range.js`), which Safari needs for media. Kept playlists also play from the `/offline` page.

### Short links

- `schuster.me/go/{word}` redirects anywhere (`app/go/[slug]/page.tsx`, public). Members and admins make them on **/links** (the link icon in the header); viewers can't, so strangers can't use the site to disguise links.
- A chosen word (normalized to `a-z0-9-`) or a random 6-character one without look-alike characters (`lib/links/rules.ts`). Destinations must be http(s), with no password in the URL and no `/go/` loops.
- Optional expiry and password (scrypt; an httpOnly cookie remembers it for 12 h), visit counts, QR codes (made in the browser with `qrcode`), change destination, turn off or on.
- **Short link** next to any share link makes a `/go/` version that expires with it.

### Contacts and family directory

- **People → My contacts** (`/contacts`): a private address book for everyone, viewers too. **Every query is scoped to the owner, with no admin exception** (`lib/db/contacts.ts`).
- **Import:** the phone's export (`.vcf`) is read in the browser (`lib/contacts/vcard.ts`: vCard 2.1/3.0/4.0, quoted-printable, Apple `item1.` groups, photos skipped). The person picks who to keep, and only those are sent, in batches of 500. Re-imports match on UID, then email or phone (`lib/contacts/merge.ts`), so nothing is duplicated.
- **Text / Email / Send to…** open the person's own Messages or Mail app with the message filled in (`sms:` / `mailto:` in `lib/contacts/compose.ts`). The server sends nothing. **Send to…** sits next to share links, short links and invite links.
- **Invite** (admins): a single-use, 7-day invite for a contact, then Messages or Mail opens with the link.
- **Family directory** (`/family`): each account holder can list their own name, phone, birthday and address (`profiles`, off by default). Imported contacts never appear there.
- Upcoming birthdays (next 30 days, Chicago time) show on both pages.

## Project layout

```
app/
  (app)/                 signed-in pages: library, items/[id], upload, shelves, admin
  login/                 passkey + magic-link sign-in
  invite/[token]         accept an invite link (public)
  s/[token]              public share page (password, inline player, download)
  api/uploads/…          upload control plane (init, parts, cover, complete, cancel)
  api/items/[id]/download  302 → presigned S3 URL
  api/items/[id]         edit (PATCH) and delete (DELETE); …/shares for share links
  api/shelves/…          shelves and their items
  api/admin/…            roles, removals, invites, approvals, unfinished uploads
  manifest.ts, icons/, icon.tsx, apple-icon.tsx, offline/   PWA
components/
  ui/                    shadcn/ui primitives
  library/ upload/ auth/ items/ sharing/ shelves/ admin/   feature components (small, one job each)
lib/
  db/                    Drizzle schema, client, queries (items, people, shares, shelves)
  permissions.ts         roles and visibility rules
  sharing/               link tokens, share passwords, request schemas (zod)
  items/purge.ts         delete an item and all of its S3 objects
  storage/               StorageAdapter, S3 + memory implementations, key layout
  upload/                part planning, uploader, browser transport, API protocol (zod)
  extract/               in-browser EPUB / video / audio metadata extraction
  auth/                  sign-up gate, first-admin and invited-role logic
drizzle/                 generated SQL migrations (applied by scripts/migrate.mjs)
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
| `ALLOWED_EMAILS` | | `mom@x.com, sam@y.org` | Optional since Stage 5 (use invites instead). Extra emails allowed to **create** an account, as members. The first account is always allowed (and becomes admin). |
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

   No Node.js handy? Paste `drizzle/0000_init.sql` into Neon's SQL Editor instead; [docs/DEPLOY.md](docs/DEPLOY.md) step 2 has the extra bookkeeping row to add.

## Deploying to Vercel (Hobby)

> **Step-by-step:** follow [docs/DEPLOY.md](docs/DEPLOY.md). It has exact values to paste, a `pnpm preflight` credential check, and troubleshooting.

1. Push this repo to GitHub and **Import** it in Vercel. The framework (Next.js) and pnpm are auto-detected.
2. **Settings → Environment Variables:** add every ✅ / prod variable above for Production (and Preview if you use it):
   - `AUTH_URL=https://schuster.me`
   - leave `S3_ENDPOINT` empty
   - `S3_FORCE_PATH_STYLE=false`
3. **Settings → Domains:** add `schuster.me` as the **Production** domain and redirect `www.schuster.me` to it (Vercel may default to the reverse; fix that). At your DNS host, set the records Vercel shows under *View DNS configuration*:
   - the apex `A` record (e.g. `216.198.79.1`; the legacy `76.76.21.21` also works);
   - `www` as the CNAME Vercel lists, or an `A` record to the same address.

   Use the A/CNAME method, **not** Vercel nameservers. Leave every MX, TXT and mail CNAME alone: the IONOS mailboxes on `schuster.me` depend on them.
4. **Resend:** verify the subdomain `mail.schuster.me` (its DNS records all live under `mail.`), then set `AUTH_RESEND_KEY` and `EMAIL_FROM`.
5. Deploy. Production builds apply pending migrations themselves (`scripts/migrate.mjs`); `pnpm db:migrate` does the same by hand.
6. Visit `https://schuster.me/login` and **create the first passkey right away**: that account becomes admin. Afterwards, people join with invite links from `/admin`.

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
- `tests/sharing/rules.test.ts`: roles, the sign-up gate, the role re-check, link tokens, share passwords and unlock cookies.
- `tests/sharing/routes.test.ts`: item edit/delete (every S3 object goes), share links, invites (uses, expiry, existing accounts), admin guards (last admin, self-removal), viewers refused.
- `tests/playlists/offline-audio.test.ts`: offline playlists (songs stored once, removal keeps shared songs, failed downloads), service-worker byte ranges, play order.
- `tests/playlists/routes.test.ts`: playlist routes (viewers edit their own, audio only, reorder must be a permutation, signed URLs only for songs the listener may hear, public links).
- `tests/db/sharing.int.test.ts`: the real visibility, shelf, role and invite SQL. Skipped unless `TEST_DATABASE_URL` points at a migrated Postgres, e.g. `TEST_DATABASE_URL=postgres://schuster:schuster@localhost:5432/schuster pnpm test tests/db`.
