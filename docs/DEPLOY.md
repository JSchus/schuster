# Go-live checklist: schuster.me

Work top to bottom and tick each box. Allow about an hour, plus however long DNS takes.

Collect every secret in a local file named **`.env.production.local`**. It's gitignored, so it never gets committed. At the end you'll copy the same values into Vercel.

```bash
cp .env.example .env.production.local
```

---

## 0. Protect your IONOS email (≈5 min). Do this first

The two mailboxes on `@schuster.me` are hosted at IONOS and must keep working. They depend on DNS records this deploy must **not** touch.

- [ ] **Find who runs your DNS.** Run `dig NS schuster.me +short`, or look the domain up at [whois.com](https://www.whois.com/whois/schuster.me) under *Name Servers*. Every DNS edit below happens in **that company's** control panel. It isn't IONOS, and it isn't Vercel.
- [ ] **Screenshot or export every existing DNS record** before changing anything, so you can restore it. IONOS mail typically uses records like:

| Type | Name | Value (example) |
| --- | --- | --- |
| MX | `@` | `mx00.ionos.com` / `mx01.ionos.com` |
| TXT | `@` | `v=spf1 include:_spf-us.ionos.com ~all` |
| CNAME | `autodiscover` | `adsredir.ionos.info` |
| TXT | `_dmarc`, `…._domainkey` | if present |

- [ ] **Ground rules for the whole checklist:**
  - **Never change the nameservers.** Vercel will offer "Use Vercel DNS"; decline it.
  - **Never edit or delete MX records, TXT records on `@`, or mail-related CNAMEs.**
  - The only records this deploy changes are **`A @`**, **`AAAA @`** (only if it points at an old website) and **`www`**. It also **adds** new records under **`mail.`** for Resend.

The app sends its sign-in links from **`login@mail.schuster.me`**, a subdomain. All of Resend's records live under `mail.schuster.me`, so they can't interfere with IONOS mail on `schuster.me`.

---

## 1. AWS S3 (≈10 min)

- [ ] **Create the bucket.** S3 → *Create bucket*:
  - Name: `schuster-media`. If that name is taken, pick another and use it everywhere `schuster-media` appears below.
  - Region: **US East (N. Virginia) us-east-1**.
  - Object Ownership: *ACLs disabled*.
  - **Block all public access: ON.** Every file is reached through short-lived signed links, so nothing is ever public.
  - Leave everything else at the defaults → *Create bucket*.
- [ ] **CORS.** Open the bucket → *Permissions* → *Cross-origin resource sharing (CORS)* → *Edit*, then paste the full contents of [`infra/s3-cors.json`](../infra/s3-cors.json) **without** the outer `{"CORSRules": …}` wrapper, i.e. just the `[ … ]` array. Save.
  > Uploads fail with "Missing ETag" if this step is skipped.
- [ ] **Lifecycle rule.** *Management* → *Create lifecycle rule*:
  - Name: `abort-stale-multipart-uploads`.
  - Scope: *Apply to all objects*. Tick the acknowledgement.
  - Action: tick *Delete expired object delete markers or incomplete multipart uploads* → *Delete incomplete multipart uploads* → **3** days.
  - Create.
- [ ] **IAM user.** IAM → *Users* → *Create user*:
  - Name: `schuster-media-app`. **No** console access.
  - Permissions: *Attach policies directly* → skip → *Create user*.
  - Open the user → *Permissions* → *Add permissions* → *Create inline policy* → *JSON*.
  - Paste [`infra/iam-policy.json`](../infra/iam-policy.json) and replace both `REPLACE_WITH_BUCKET_NAME` with `schuster-media`.
  - Policy name: `schuster-media-bucket` → *Create policy*.
- [ ] **Access key.** On the user → *Security credentials* → *Create access key* → *Application running outside AWS* → *Create*. Copy both values now; the secret is shown only once.

```dotenv
S3_BUCKET=schuster-media
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIA…
S3_SECRET_ACCESS_KEY=…
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
STORAGE_DRIVER=s3
```

## 2. Neon Postgres (≈5 min)

- [ ] Go to [console.neon.tech](https://console.neon.tech) → *New project*:
  - Name: `schuster-media`.
  - Postgres 16 or 17.
  - Region: **AWS US East 1 (N. Virginia)**, the same region as the bucket and Vercel's default functions.
- [ ] *Connect* → turn **Connection pooling ON** → copy the connection string. Its host contains `-pooler`.
- [ ] Create the tables from your computer:

```bash
DATABASE_URL='postgresql://…-pooler…neon.tech/neondb?sslmode=require' pnpm db:migrate
```

You should see `migrations applied successfully!`.

  **No Node.js on your computer?** Create the tables in Neon's website instead:
  1. In Neon, open *Postgres database* → **SQL Editor** (branch `production`, database `neondb`).
  2. Paste the whole of [`drizzle/0000_init.sql`](../drizzle/0000_init.sql) (GitHub → *Copy raw file*) and click **Run**.
  3. Clear the editor, then paste and run this, so future `pnpm db:migrate` runs know the first migration is already applied:

     ```sql
     CREATE SCHEMA IF NOT EXISTS drizzle;
     CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
     INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     VALUES ('c7a7925d61bbc7eac06ad2ba046e614a985f454d0cf8f484940143e9cec2ceac', 1792556134248);
     ```

     The hash is the SHA-256 of `0000_init.sql` and the number is its `when` in `drizzle/meta/_journal.json`; both only apply to this first migration.
  4. *Tables* should list 8 tables: `accounts`, `authenticators`, `favorites`, `media_items`, `sessions`, `user_progress`, `users`, `verification_tokens`.

```dotenv
DATABASE_URL=postgresql://…-pooler….neon.tech/neondb?sslmode=require
```

## 3. Resend, for magic-link email (≈10 min plus DNS)

- [ ] Sign up at [resend.com](https://resend.com) → *Domains* → *Add domain* → **`mail.schuster.me`** (the subdomain, not `schuster.me`), region us-east-1.
- [ ] At your DNS host, **add** the records Resend shows. They all sit under `mail.`, for example:

| Type | Name to enter | Purpose |
| --- | --- | --- |
| TXT | `resend._domainkey.mail` | DKIM signature key (copy the full `p=…` value) |
| CNAME | `rsend.mail` | Resend sending/SPF (copy the full `….rmta.net` value) |
| CNAME | `send.mail` | Resend bounce handling (copy the full `….rmta.net` value) |

  Resend's layout changes now and then (older accounts show an MX + TXT on `send.mail` instead); add exactly what *your* Resend screen lists. **Skip the optional `_dmarc` row**: its name is the bare `_dmarc`, which applies to the main `schuster.me` domain where the IONOS mail lives.

  Most DNS panels add `.schuster.me` automatically, so enter `send.mail`, not `send.mail.schuster.me`. These are **new** records: don't edit the existing `@` MX/TXT records, which belong to IONOS.
- [ ] Click *Verify* in Resend; it usually turns green within minutes, but can take up to a few hours.
- [ ] *API Keys* → *Create API key* → permission **Sending access** → copy it.

```dotenv
AUTH_RESEND_KEY=re_…
EMAIL_FROM="Schuster Media <login@mail.schuster.me>"
```

## 4. Auth settings

- [ ] Generate the session secret: `npx auth secret`. It prints `AUTH_SECRET="…"`; copy the value.
- [ ] Optional: list emails allowed to create accounts. Since Stage 5 you can leave this empty and send invite links from the admin page instead.

```dotenv
AUTH_SECRET=…
AUTH_URL=https://schuster.me
ALLOWED_EMAILS=
```

> Your own `@schuster.me` addresses work fine here: sign-in links arrive in your IONOS inbox as usual.
>
> `AUTH_URL` must be exactly `https://schuster.me`. Passkeys are permanently bound to that domain: a passkey made on a preview URL won't work on schuster.me.

## 5. Preflight: test every credential before deploying

```bash
pnpm install
pnpm preflight          # reads .env.production.local
```

Fix any ❌ using the hint printed beneath it, then re-run until you see **✅ All checks passed**. It checks:
- the env vars are present;
- the database connects and migrations are applied;
- the S3 CORS rules;
- S3 permissions for multipart upload, presigned PUT/GET and delete;
- the Resend domain;
- DNS safety: the IONOS **MX records are still in place**, and whether `schuster.me` points at Vercel yet (it won't until step 7, so a ⚠️ there is expected).

## 6. Vercel (≈10 min)

- [ ] Go to [vercel.com/new](https://vercel.com/new) → import `jschus/schuster`. Framework: Next.js; install command `pnpm install` (both auto-detected).
- [ ] Before clicking *Deploy*, open **Environment Variables** and paste the whole `.env.production.local` file into the first field. Vercel splits it into one variable per line. Target: **Production** (Preview is optional).

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled string |
| `AUTH_SECRET` | from `npx auth secret` |
| `AUTH_URL` | `https://schuster.me` |
| `AUTH_RESEND_KEY` | `re_…` |
| `EMAIL_FROM` | `Schuster Media <login@mail.schuster.me>` |
| `ALLOWED_EMAILS` | family emails, comma-separated |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | `schuster-media` |
| `S3_REGION` | `us-east-1` |
| `S3_ACCESS_KEY_ID` | `AKIA…` |
| `S3_SECRET_ACCESS_KEY` | … |
| `S3_FORCE_PATH_STYLE` | `false` |

  Leave `S3_ENDPOINT` out entirely. `AUTH_TRUST_HOST` isn't needed on Vercel.
- [ ] Confirm the production branch is `main`, which is Vercel's default for this repo.
- [ ] Merge the Stage 1 pull request into `main`. Vercel builds and deploys it, and the build takes about 1–2 minutes.

## 7. Domain (≈5 min plus DNS)

- [ ] Vercel project → *Settings* → *Domains*:
  - add `schuster.me`;
  - add `www.schuster.me` and choose *Redirect to schuster.me*.
- [ ] **Check which one is the main address.** Vercel often makes `www` the primary and redirects `schuster.me` to it. The app needs the reverse, because `AUTH_URL` and passkeys use `https://schuster.me`. If the `schuster.me` row shows `308 → www.schuster.me`:
  1. *Edit* **schuster.me** → *Connect to an environment* → **Production** → Save (do this first; Vercel won't let the two redirect to each other);
  2. *Edit* **www.schuster.me** → *Redirect to Another Domain* → **308** → pick **schuster.me** → Save.

  If Vercel offers **"Vercel DNS" / changing nameservers, don't**: that would drop your IONOS MX records. Use the **A record / CNAME** option.
- [ ] Click **View DNS configuration** on each row and use **exactly the values Vercel shows**. They're per project, for example:

| Type | Name | Value (example) |
| --- | --- | --- |
| A | `@` | `216.198.79.1` |
| CNAME | `www` | `5452b742d153da56.vercel-dns-017.com` |

  Vercel's older values (`A @ → 76.76.21.21`, `CNAME www → cname.vercel-dns.com`) still work too.
- [ ] At your DNS host (from step 0), set only these records:
  - If `A @` already exists (pointing at an old website or parking page), **edit** it to Vercel's address rather than adding a second one.
  - IONOS may update an `A www` record automatically when you change `A @`. An `A www` record pointing at the same Vercel address works just as well as the CNAME, so you can leave it.
  - Delete an `AAAA @` record only if it points at that same old website; otherwise IPv6 visitors land there.
  - If `www` exists, change it to the CNAME above.
  - **Don't touch** MX, TXT on `@`, `autodiscover` or anything under `mail.`.
  - **Cloudflare users:** set both records to **DNS only** (grey cloud).
- [ ] **Check email still works:** send a message to each IONOS mailbox from another account, reply from it, then re-run `pnpm preflight` and confirm the MX check is ✅.
- [ ] Wait for both domains to show **Valid Configuration** in Vercel. HTTPS certificates are issued automatically. DNS changes can take a few minutes to a few hours to propagate; check with `dig schuster.me +short`, which should print the address Vercel gave you.

## 8. First login: do this right away

- [ ] Open **https://schuster.me/login** → *First time here? Create a passkey* → your email → confirm with Face ID, Touch ID or your PIN. **The first account becomes admin.**
- [ ] Upload one EPUB and one video from your phone. Check that the covers appear in the library and that *Download* works.
- [ ] Install the app:
  - **iPhone/iPad:** Safari → Share → *Add to Home Screen*.
  - **Android:** Chrome → ⋮ → *Install app*.
- [ ] Sign out, sign back in with the passkey, and try *Email me a sign-in link* once to confirm email delivery.
- [ ] Invite family: open the shield icon (**Admin**) → *Invite someone* → *Make link & copy*, then text or email them the link. See step 10.

---

## 9. Web games (Stage 4, ≈5 min)

HTML5 games run from a **public `webgames/` folder** in the bucket, on S3's own web address, so they can't see your schuster.me login. Everything else in the bucket stays private.

- [ ] **Allow a bucket policy.** S3 → `schuster-media` → *Permissions* → *Block public access (bucket settings)* → *Edit*:
  - **untick** "Block public access to buckets and objects granted through *new public bucket or access point policies*";
  - **untick** "Block public and cross-account access to buckets and objects through *any public bucket or access point policies*";
  - **keep ticked** both boxes about *access control lists (ACLs)*.

  Save, and type `confirm`.
- [ ] **Add the policy.** Same tab → *Bucket policy* → *Edit* → paste [`infra/s3-webgames-policy.json`](../infra/s3-webgames-policy.json) with `REPLACE_WITH_BUCKET_NAME` replaced by `schuster-media` → *Save*. It allows reading **only** `webgames/*`.
- [ ] **Check:** `pnpm preflight` should show ✅ for both "webgames/ folder is publicly readable" and "the rest of the bucket stays private".

The IAM policy doesn't change: the app's key can already write anywhere in the bucket.

## 10. Invites, roles and sharing (Stage 5)

Nothing to set up in AWS, Neon or Vercel: the first production deploy of Stage 5 adds the new tables itself (the build log shows `[migrate] database is up to date`).

- [ ] **Invite someone:** shield icon → *Invite someone*. Pick *Member* (can upload) or *Viewer* (can only read, watch and play), how long the link works and how many people may use it, then *Make link & copy* and send it. They enter their email and create a passkey.
- [ ] **Limit who sees something:** open an item → *Edit* → *Who can see this item?* → *Everyone*, *Specific people* or *Only me*. New uploads start as *Everyone*.
- [ ] **Shelves:** *Shelves* in the header, or *Shelves* on any item, to group things (“Holiday movies”). A shelf can be shared the same three ways.
- [ ] **Share with someone who has no account:** item → *Share link* → choose 1, 7 or 30 days and optionally a password → the link is copied. *Turn off* stops it at once.
- [ ] **Change a role or remove someone:** Admin → *People*. It takes effect within 5 minutes; their uploads stay.

## 11. Playlists

Nothing to set up: the next production deploy adds the tables itself.

- [ ] **Make one:** *Playlists* in the header → *New playlist*, then *Edit songs* to add, reorder or remove songs. Or open any song → *Playlists*.
- [ ] **Offline:** on a playlist, *Keep offline*. On iPhone, add the site to the Home Screen first: iOS keeps an installed app's offline files much longer than Safari's.
- [ ] **Share:** *Share link* on the playlist (members and admins), like sharing a single item.

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Upload fails: "Missing ETag — check the bucket CORS" | CORS not saved, or `ETag` missing from *ExposeHeaders*. Re-paste `infra/s3-cors.json`. |
| Upload fails with 403 | IAM policy has the wrong bucket name, or the access key in Vercel is wrong. Run `pnpm preflight`. |
| Upload fails: CORS error in browser console | The site's origin isn't in *AllowedOrigins*. Add it, e.g. a `*.vercel.app` preview URL. |
| Passkey error mentioning "RP ID" or "origin" | `AUTH_URL` doesn't match the address in the browser. It must be `https://schuster.me`; open the site at that address, not `www` or the vercel.app URL. |
| "That email isn't on the family list yet" | Send them an invite link (Admin → *Invite someone*), or add their email under *Allow an email directly*. |
| Invite link says "not valid" | It expired, was used up or turned off. Make a new one. |
| Deploy fails at `[migrate] failed` | The build couldn't reach Neon, or `DATABASE_URL` is wrong for *Production* in Vercel. The previous version keeps running; fix the variable and redeploy. |
| Magic-link email never arrives | Resend domain `mail.schuster.me` not *Verified* yet, or `EMAIL_FROM` isn't `…@mail.schuster.me`. Check Resend → *Logs*. |
| Magic link lands in spam | The Resend records under `mail.` aren't all verified yet. Wait for every record to show green in Resend. |
| IONOS mail stopped arriving | The MX records on `@` were changed or deleted, or the nameservers were switched. Restore them from your step-0 screenshot; `pnpm preflight` shows the current MX. |
| `500` on every page right after deploy | An env var is missing or misspelled. Vercel → *Logs* shows `Invalid environment: …` with the variable name. |
| Offline playlist disappeared on iPhone | iOS clears website storage that isn't used for a few weeks. Use the Home Screen app and open it now and then, or tap *Keep offline* again. |
| Web game shows "AccessDenied" | The bucket policy from step 9 is missing, or Block Public Access still blocks bucket policies. |
| Console game says the BIOS is missing | PS1 needs a BIOS file; the admin adds it on any PlayStation game's page. |
| Library loads but covers are broken | S3 credentials or region are wrong in Vercel. Covers are presigned GETs. |
| A Vercel preview deploy can't sign in | Expected: passkeys and `AUTH_URL` are bound to schuster.me. Test on production. |

## What it costs

| Service | Plan | Cost |
| --- | --- | --- |
| Vercel | Hobby | $0. Media bytes never go through Vercel. |
| Neon | Free | $0 (0.5 GB storage is plenty for metadata). |
| Resend | Free | $0 up to 3,000 emails/month. |
| AWS S3 | Pay as you go | ≈ $0.023 per GB stored per month, plus ≈ $0.09 per GB downloaded (first 100 GB/month free). 200 GB of media ≈ $4.60/month in storage. |
| Domain | — | your registrar's renewal fee |
