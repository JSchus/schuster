# Roadmap

Every stage keeps the Stage 1 rule: **media bytes never pass through Next.js.** They flow between the browser and S3 (later a CDN) via presigned or signed URLs. Server functions stay short.

## Stage 1: Foundation ✅

- Next.js 15, Tailwind and shadcn/ui; Drizzle with Neon.
- Auth.js with passkeys and a magic-link fallback. The first user becomes admin, and an email allowlist gates sign-up.
- Schema: `users`, `media_items`, `user_progress`, `favorites`.
- Library grid with type, search and tag filters and "Recently added"; item detail with a presigned download.
- Direct-to-S3 multipart uploads with in-browser metadata extraction: EPUB cover and metadata, video poster and duration.
- PWA (manifest, icons, service worker), dark mode, View Transitions.
- `StorageAdapter` interface with an S3 implementation.

## Stage 2: EPUB reader with cross-device progress

- `/items/[id]/read` uses an in-browser reader (epub.js or foliate-js). It loads the book from a presigned GET; CORS `GET` + `Range` are already allowed.
- Progress is saved as an EPUB CFI in `user_progress.position`, plus `percent`:
  - debounced `PUT /api/progress/:itemId`;
  - flushed on `visibilitychange` / `pagehide` with `navigator.sendBeacon`.
- Opening a book on another device resumes at the latest `updated_at`. Conflicts: last write wins, with a "Jump to page N from your phone?" prompt when the difference is large.
- Reader settings stored per user in localStorage: font size, theme (light/sepia/dark), margins, paginated vs scrolled.
- A "Continue reading" shelf on the library page from `user_progress`.
- Offline: cache the last N opened books in the Cache API (opt-in per book). The service worker serves them when offline.
- PDF: render with pdf.js under the same progress model (page number as the position).

## Stage 3: Video player with resume, subtitles and range requests

- `/items/[id]/watch` uses a native `<video>` element (plus hls.js later if transcoding is added). The source is a presigned GET.
  - S3 serves HTTP `Range` requests natively, so seeking works without any proxy.
  - Use longer expiries (≈6 h) for playback URLs, refreshed by the player before they expire.
- Resume: position in seconds is stored in `user_progress` every ~10 s and on pause. "Continue watching" shelf.
- Subtitles: upload `.srt` / `.vtt` next to a video. Convert SRT → VTT in the browser and store it at `subs/{itemId}/{lang}.vtt`, served as presigned `<track>` sources. Requires a `media_subtitles` table.
- Audio player: same resume model, media session API (lock-screen controls), chapters for `.m4b`.
- Optional: **CloudFront** in front of the bucket with signed cookies, giving cheaper egress and better seek latency. The `StorageAdapter.presignGet` can return CloudFront URLs.
- Optional: an AWS MediaConvert job (triggered by S3 events, not by Vercel) for HEVC/MKV sources browsers can't play.

## Stage 4: Retro games (EmulatorJS) and a web-games shelf

- `/items/[id]/play` embeds [EmulatorJS](https://emulatorjs.org). The core is chosen from the ROM extension (`nes`, `snes`, `gba`, `gb`, `n64`, `segaMD`, …), and the ROM is loaded from a presigned GET.
  - Host the EmulatorJS data/cores in the bucket or on a CDN, not in the Next.js bundle.
  - Needs COOP/COEP headers on the play route only, for threaded cores.
- Save states and SRAM: upload to `saves/{userId}/{itemId}/…` via a presigned PUT, listed per user. They sync across devices like reading progress.
- Gamepad support and on-screen touch controls on mobile.
- **Web-games shelf:** HTML5 games uploaded as a `.zip`.
  - Unzip in the browser and upload each file to `webgames/{itemId}/…`.
  - Serve them in a sandboxed `<iframe>` from a separate origin (e.g. `games.schuster.me` behind CloudFront), so game code can never read the app's cookies.
- BIOS files (PS1 etc.) are admin-only uploads, never listed in the library.

## Stage 5: Sharing, roles and invites

- Roles: `admin`, `member`, and possibly `viewer` (can't upload) and `kid` (filtered shelves).
- **Invites** replace `ALLOWED_EMAILS`:
  - an admin creates an invite link (a token in an `invites` table, with expiry and max uses);
  - opening it lets someone register a passkey directly.
- Collections / shelves: named groups of items, private or shared with specific users.
- Per-item visibility: everyone (default), specific people, or just me.
- Public share links: time-limited, optionally password-protected, for a single item. They reuse presigned GETs and never expose the bucket.
- Item editing: title, tags, cover replacement and deletion (uploader or admin). Deleting removes the S3 objects.
- Admin page: users, roles, storage usage per user, and pending/orphaned uploads.
- Audit log of uploads, deletes and shares.

## Deferred / housekeeping

- A daily Vercel Cron (Hobby allows daily) that deletes `pending` rows older than 3 days. The S3 lifecycle rule already aborts the parts.
- Full-text search with Postgres `tsvector` (title, author, description, tags) and fuzzy matching via `pg_trgm`.
- Duplicate detection: SHA-256 computed in a Web Worker before upload.
- Thumbnails at several sizes; a blurhash placeholder in `metadata`.
- More storage adapters: Cloudflare R2 (zero egress) and Backblaze B2. Both are S3-compatible, so mostly configuration.
- Playwright end-to-end tests in CI, using a virtual WebAuthn authenticator and an S3 emulator.
