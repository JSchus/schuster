# Go-live checklist: schuster.me

Work top to bottom and tick each box. Allow about an hour, plus however long DNS takes.

Collect every secret in a local file named **`.env.production.local`**. It's gitignored, so it never gets committed. At the end you'll copy the same values into Vercel.

```bash
cp .env.example .env.production.local
```

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

```dotenv
DATABASE_URL=postgresql://…-pooler….neon.tech/neondb?sslmode=require
```

## 3. Resend, for magic-link email (≈10 min plus DNS)

- [ ] Sign up at [resend.com](https://resend.com) → *Domains* → *Add domain* → `schuster.me`, region us-east-1.
- [ ] Add the DNS records Resend shows (an MX and TXT on a `send` subdomain, plus a DKIM TXT) at your domain registrar. Click *Verify*; it usually turns green within minutes, but can take up to a few hours.
- [ ] *API Keys* → *Create API key* → permission **Sending access** → copy it.

```dotenv
AUTH_RESEND_KEY=re_…
EMAIL_FROM="Schuster Media <media@schuster.me>"
```

## 4. Auth settings

- [ ] Generate the session secret: `npx auth secret`. It prints `AUTH_SECRET="…"`; copy the value.
- [ ] Decide who can create accounts. You can always add more later in Vercel and redeploy.

```dotenv
AUTH_SECRET=…
AUTH_URL=https://schuster.me
ALLOWED_EMAILS=mom@example.com, dad@example.com, sam@example.com
```

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
- the Resend domain.

## 6. Vercel (≈10 min)

- [ ] Go to [vercel.com/new](https://vercel.com/new) → import `jschus/schuster`. Framework: Next.js; install command `pnpm install` (both auto-detected).
- [ ] Before clicking *Deploy*, open **Environment Variables** and paste the whole `.env.production.local` file into the first field. Vercel splits it into one variable per line. Target: **Production** (Preview is optional).

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled string |
| `AUTH_SECRET` | from `npx auth secret` |
| `AUTH_URL` | `https://schuster.me` |
| `AUTH_RESEND_KEY` | `re_…` |
| `EMAIL_FROM` | `Schuster Media <media@schuster.me>` |
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
- [ ] At your domain registrar, create the records Vercel shows. Usually:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `76.76.21.21` |
| CNAME | `www` | `cname.vercel-dns.com` |

  Remove any other A/AAAA records on `@` (registrar "parking" pages).
- [ ] Wait for both domains to show **Valid Configuration** in Vercel. HTTPS certificates are issued automatically. DNS changes can take a few minutes to a few hours to propagate; check with `dig schuster.me +short`, which should print `76.76.21.21`.

## 8. First login: do this right away

- [ ] Open **https://schuster.me/login** → *First time here? Create a passkey* → your email → confirm with Face ID, Touch ID or your PIN. **The first account becomes admin.**
- [ ] Upload one EPUB and one video from your phone. Check that the covers appear in the library and that *Download* works.
- [ ] Install the app:
  - **iPhone/iPad:** Safari → Share → *Add to Home Screen*.
  - **Android:** Chrome → ⋮ → *Install app*.
- [ ] Sign out, sign back in with the passkey, and try *Email me a sign-in link* once to confirm email delivery.
- [ ] Tell family to visit schuster.me and choose *Create a passkey* with the email you listed.

---

## Troubleshooting

| Symptom | Cause → fix |
| --- | --- |
| Upload fails: "Missing ETag — check the bucket CORS" | CORS not saved, or `ETag` missing from *ExposeHeaders*. Re-paste `infra/s3-cors.json`. |
| Upload fails with 403 | IAM policy has the wrong bucket name, or the access key in Vercel is wrong. Run `pnpm preflight`. |
| Upload fails: CORS error in browser console | The site's origin isn't in *AllowedOrigins*. Add it, e.g. a `*.vercel.app` preview URL. |
| Passkey error mentioning "RP ID" or "origin" | `AUTH_URL` doesn't match the address in the browser. It must be `https://schuster.me`; open the site at that address, not `www` or the vercel.app URL. |
| "That email isn't on the family list yet" | Add the address to `ALLOWED_EMAILS` in Vercel → *Deployments* → ⋯ → *Redeploy*. |
| Magic-link email never arrives | Resend domain not *Verified* yet, or `EMAIL_FROM` uses a different domain. Check Resend → *Logs*. |
| `500` on every page right after deploy | An env var is missing or misspelled. Vercel → *Logs* shows `Invalid environment: …` with the variable name. |
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
