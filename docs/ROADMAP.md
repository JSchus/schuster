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

## Stage 4: Retro games (EmulatorJS) and a web-games shelf ✅

- `/play/[id]` runs **EmulatorJS 4.2.3**, self-hosted from npm under `/emulatorjs/` (pinned, no third-party CDN). It supports NES, SNES, Game Boy/Color, GBA, N64, Genesis/Master System/Game Gear and PS1. ROMs (or zipped ROMs) stream from presigned S3 URLs. No threaded cores, so no COOP/COEP headers are needed.
- The console is detected from the ROM extension at upload, or from the ROM inside a `.zip`. Editors can change it on the game page.
- **Cloud saves per user:** "Save state" and "Load state" in the emulator go to `saves/{userId}/{itemId}/` in S3. In-game (battery/memory card) saves upload every minute and when the tab is hidden, and are restored on start. The game page shows "Cloud save · 2 h ago" and a **Resume** button, on any device.
- **PS1 BIOS:** the admin uploads it once (`bios/psx/scph5501.bin` etc.).
- **Web games:** a `.zip` with an `index.html` is unzipped in the browser and published file by file to the bucket's **public `webgames/` folder**. It plays in a sandboxed iframe on S3's own domain, so it can't read schuster.me cookies or pages.

Follow-ups: netplay, more consoles (DS, PSP: these need threads and COOP/COEP), multiple save slots, cheats, cover art for games (box-art lookup or a screenshot from the first cloud save).

## Stage 5: Sharing, roles and invites ✅

- Roles: `admin`, `member` (uploads and shares), `viewer` (can't upload). A role change or removal applies within 5 minutes.
- **Invites:** the admin makes a link with a role, an expiry and a number of uses; opening it approves the person's email and they create a passkey. Admins can also approve an email directly. `ALLOWED_EMAILS` still works as a fallback.
- **Shelves:** named groups of items, visible to everyone, specific people, or only their owner.
- **Per-item visibility:** everyone (default), specific people, or only the uploader. Admins see everything.
- **Public share links:** 1, 7 or 30 days, optional password, download on/off for playable media. Presigned GETs never outlive the link.
- **Item editing:** title, author, description, tags, visibility, cover (generated or a picture). Deleting removes every S3 object of the item, including everyone's cloud saves.
- **Admin page:** people, roles, uploads and storage per person, invite links, approved emails, cleanup of unfinished uploads.
- Migrations run automatically on Vercel production builds.

Follow-ups: audit log (uploads, deletes, shares), a `kid` role with filtered shelves, choosing visibility at upload time, reading a shared EPUB/PDF in the browser instead of downloading, rate limiting share-link passwords (needs a KV store).

## Playlists ✅

- Playlists of audio items: anyone (viewers too) can make and edit their own; visible to everyone, specific people, or only the owner.
- Player with shuffle, repeat, auto-advance, lock-screen next/previous, and resume per playlist.
- Public expiring links (optional password and per-song downloads).
- **Keep offline:** songs are saved on the device and play with no connection, from the playlist page or the offline page.

Follow-ups: drag-and-drop reordering, playlist cover art (a grid of the first four covers), "Play next" / queue from anywhere, crossfade, offline video.

## Deferred / housekeeping

- A daily Vercel Cron (Hobby allows daily) that deletes `pending` rows older than 3 days (the admin page can already clean them up by hand). The S3 lifecycle rule already aborts the parts.
- Full-text search with Postgres `tsvector` (title, author, description, tags) and fuzzy matching via `pg_trgm`.
- Duplicate detection: SHA-256 computed in a Web Worker before upload.
- Thumbnails at several sizes; a blurhash placeholder in `metadata`.
- More storage adapters: Cloudflare R2 (zero egress) and Backblaze B2. Both are S3-compatible, so mostly configuration.
- Playwright end-to-end tests in CI, using a virtual WebAuthn authenticator and an S3 emulator.
