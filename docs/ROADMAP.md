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

## Stage 2: Book reader with cross-device progress ✅

- `/read/[id]`: full-screen reader for **EPUB** (epub.js) and **PDF** (pdf.js legacy build, streamed with Range requests). The book comes from a presigned S3 GET, never through Vercel.
- Progress (EPUB CFI or `page:N`, plus percent) is saved to `localStorage` immediately and to `PUT /api/progress/:itemId` (debounced, with a `sendBeacon` on close). The server keeps only the newest write, so a device syncing late can't roll back progress made elsewhere.
- Opening a book picks the newer of this device's and the synced position. If another device was ahead, a toast offers "Go back"; returning to a tab after a while offers "Jump there".
- Per-device settings: text size/zoom, light/sepia/dark, serif/sans, pages or scroll. Contents panel and "go to page".
- "Continue reading" shelf with progress bars; Read / Continue button on the item page.
- **Keep offline** per book: the file and its reader page go into a `books` Cache API store (kept across service-worker upgrades). Offline progress is queued and synced from any page once back online.
- PDFs get their first page as a cover.

Follow-ups: highlights and bookmarks, reading statistics, offline covers, searching inside a book.

## Stage 3: Video and audio player with resume, subtitles and range requests ✅

- `/watch/[id]` (video) and `/listen/[id]` (audio) on the native media element: iOS fullscreen, AirPlay and picture-in-picture still work. Files stream straight from S3; seeking uses S3's native Range support.
- Resume where you stopped on any device, via the same `user_progress` sync as the reader (`t:<seconds>` positions). Near the end it starts over instead. Finishing marks it 100%, which drops it off the shelf.
- Skip buttons (−10/+30 s video, −15/+30 s audio), speed 0.75–2×, and keyboard shortcuts (space, ←/→, F, C).
- Subtitles: uploaders or admins add `.srt`/`.vtt` per language on the video page. SRT is converted to WebVTT in the browser and stored as `subs/{id}/{lang}-{ts}.vtt`; the list lives in `media_items.metadata.subtitles` (no new table).
- Audio: large artwork plus Media Session metadata and handlers for lock-screen and headphone controls.
- Presigned URLs last 6 h. If one expires mid-session, the player fetches fresh ones from `/api/items/[id]/stream` and continues where it was.
- Unplayable formats (e.g. MKV/HEVC in some browsers) show a "download instead" message.
- The library shelf "Pick up where you left off" covers books, video and audio, with "42 min left".

Follow-ups: CloudFront signed cookies (cheaper egress), a MediaConvert job for formats browsers can't play, `.m4b` chapters, automatic subtitle matching at upload (`movie.en.srt` next to `movie.mp4`), and offline video.

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
