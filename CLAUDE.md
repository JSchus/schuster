# Schuster Media: notes for Claude

A private media hub at **https://schuster.me** for John Schuster's family and friends: books (EPUB/PDF reader), video and audio (player with resume), retro and web games (EmulatorJS, cloud saves), files, shelves, playlists (with offline playback), invites, roles and share links. The GitHub owner is `JSchus`.

## Stack
- Next.js 15 App Router, TypeScript, Tailwind v4, shadcn/ui.
- Drizzle ORM on **Neon Postgres** (pooled URL; Neon HTTP driver at runtime).
- **Auth.js v5**:
  - passkeys, plus email magic links via **Resend** from `login@mail.schuster.me`;
  - JWT sessions; the role is re-read every 5 minutes.
- **AWS S3**: bucket `schuster-media`, us-east-1.
- **Vercel** Hobby: team "Company Chicago's projects". Production builds deploy from `main`.

## Hard rules
- **Never touch the schuster.me email DNS.** Two IONOS mailboxes depend on it:
  - DNS is hosted at IONOS; the domain is registered at Hover;
  - never change the nameservers, the MX records, TXT on `@`, or mail CNAMEs;
  - Resend uses the `mail.` subdomain only.
- **Media bytes never pass through Next.js.** Uploads go straight to S3 (presigned multipart PUTs), and playback and downloads use presigned GETs.
- **Only the `webgames/` S3 prefix is public**; everything else stays private.
- **Never ask for, print or commit secrets**: AWS keys, `DATABASE_URL`, `AUTH_SECRET`, `AUTH_RESEND_KEY`. John sets them in Vercel himself.
- **No AI model names** in commits, PR text or code.
- **Schema changes** go in a new Drizzle migration (`pnpm db:generate`). `scripts/migrate.mjs` applies migrations during Vercel *production* builds only, never previews. Keep migrations additive.
- Keep server routes short (`maxDuration = 10`). Storage goes through the `StorageAdapter` (`lib/storage`), and access rules through `lib/permissions.ts` and `visibleTo()` in `lib/db/queries.ts`.

## How John likes to work
- **Plain language, one step at a time**, for anything he has to do: setup, consoles, merging.
- He uses a Mac (Chrome) and an iPhone, has **no local Node or terminal setup**, and does setup in web consoles: Vercel, AWS, Neon, Resend, IONOS.
- Every piece of work goes on a branch with a **pull request he merges himself**. After merging, tell him what to check on the live site.
- Give usage-limit reset times in **Chicago time**.

## Where things are
- `docs/DEPLOY.md`: setup steps 0–11 and troubleshooting.
- `docs/ROADMAP.md`: what's done and the follow-ups.
- `README.md`: architecture and environment variables.
- Code layout:
  - `app/`: pages and API routes;
  - `components/`: UI, small and one job each;
  - `lib/`: db, storage, auth, player, reader, games, sharing;
  - `tests/`: Vitest;
  - `infra/`: S3 CORS, IAM and bucket policies to paste into AWS.

## Before opening a PR
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
- Optional Postgres suite: `TEST_DATABASE_URL=postgres://… pnpm test tests/db`.
- Local services for end-to-end checks:
  - Postgres;
  - the moto S3 emulator on `:5055` (`pnpm dev:s3` creates the bucket and CORS);
  - `.env.local` points at both.
- Test in a browser for anything user-facing. Say plainly what couldn't be tested here, for example real iPhone/Safari behaviour.

## Vercel
The Vercel connector may be available. Use it to **read** deployments, build logs and runtime logs. **Ask John before any write**: deploying, environment variables, domains, settings.
