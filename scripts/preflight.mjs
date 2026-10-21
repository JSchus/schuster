// Check that real deployment credentials work before going live.
//
//   pnpm preflight                      # reads .env.production.local
//   pnpm preflight .env.local           # or any env file
//
// Every check prints ✅ / ❌ / ⚠️ with a hint. Exit code 1 if anything failed.
// It creates and deletes one small object under `preflight/` in the bucket.
import { resolve4, resolveMx } from "node:dns/promises";
import { existsSync, readFileSync } from "node:fs";
import {
  AbortMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const envFile = process.argv[2] ?? ".env.production.local";
if (!existsSync(envFile)) {
  console.error(`❌ ${envFile} not found. Copy .env.example to it and fill in production values.`);
  process.exit(1);
}
process.loadEnvFile(envFile);
const env = process.env;
console.log(`Preflight using ${envFile}\n`);

let failed = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const warn = (msg, hint) => console.log(`  ⚠️  ${msg}${hint ? `\n      → ${hint}` : ""}`);
const fail = (msg, hint) => {
  failed++;
  console.log(`  ❌ ${msg}${hint ? `\n      → ${hint}` : ""}`);
};

/** ✅ `pass` if cond, else ❌ `failure` with an optional hint. */
const check = (cond, pass, failure, hint) => (cond ? ok(pass) : fail(failure, hint));

/** Run a named section; an unexpected throw counts as a failure. */
async function section(name, fn) {
  console.log(name);
  try {
    await fn();
  } catch (err) {
    fail(`${err.name ?? "Error"}: ${err.message}`, hintFor(err));
  }
  console.log("");
}

function hintFor(err) {
  const name = err.name ?? "";
  if (name === "AccessDenied" || err.$metadata?.httpStatusCode === 403)
    return "IAM policy: check infra/iam-policy.json was attached with the right bucket name.";
  if (name === "NoSuchBucket") return "S3_BUCKET doesn't exist in S3_REGION.";
  if (name === "InvalidAccessKeyId" || name === "SignatureDoesNotMatch")
    return "S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY are wrong.";
  if (name === "PermanentRedirect" || name === "AuthorizationHeaderMalformed")
    return "S3_REGION doesn't match the bucket's region.";
  return undefined;
}

/* ------------------------------------------------------------------ */

await section("Environment", async () => {
  const required = ["DATABASE_URL", "AUTH_SECRET", "S3_BUCKET", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"];
  for (const k of required) (env[k] ? ok : fail)(`${k} ${env[k] ? "set" : "missing"}`);
  if (env.AUTH_SECRET && env.AUTH_SECRET.length < 16) fail("AUTH_SECRET is too short", "Run: npx auth secret");

  const url = env.AUTH_URL;
  if (!url) warn("AUTH_URL not set", "Set AUTH_URL=https://schuster.me so passkeys bind to the right domain.");
  else if (url.startsWith("https://")) ok(`AUTH_URL ${url}`);
  else if (/^http:\/\/localhost\b/.test(url)) warn(`AUTH_URL ${url} (fine locally, not for production)`);
  else fail(`AUTH_URL ${url} is not https`, "Passkeys require HTTPS outside localhost.");

  if (env.S3_ENDPOINT) warn(`S3_ENDPOINT=${env.S3_ENDPOINT}`, "Leave S3_ENDPOINT empty for AWS S3.");
  if (!env.AUTH_RESEND_KEY) warn("AUTH_RESEND_KEY not set", "Magic-link emails won't send in production.");
  if (!env.ALLOWED_EMAILS) warn("ALLOWED_EMAILS empty", "Only the first account (admin) can sign up.");
});

await section("Database", async () => {
  const url = env.DATABASE_URL;
  if (!url) return fail("DATABASE_URL missing");
  const isNeon = /\.neon\.tech\b/.test(new URL(url).hostname);
  if (isNeon && !new URL(url).hostname.includes("-pooler"))
    warn("Neon URL is not the pooled one", "In Neon → Connect, tick 'Connection pooling' and copy that string.");

  let query;
  let close = async () => {};
  if (isNeon) {
    const { neon } = await import("@neondatabase/serverless");
    const sql = neon(url);
    query = (text) => sql.query(text);
  } else {
    const postgres = (await import("postgres")).default;
    const sql = postgres(url, { max: 1, onnotice: () => {} });
    query = (text) => sql.unsafe(text);
    close = () => sql.end();
  }

  try {
    await query("select 1");
    ok(`connected (${isNeon ? "Neon HTTP" : "postgres"} driver)`);
    const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
    const expected = journal.entries.length;
    let applied = 0;
    try {
      const rows = await query("select count(*)::int as n from drizzle.__drizzle_migrations");
      applied = (rows.rows ?? rows)[0].n;
    } catch {
      applied = 0;
    }
    if (applied >= expected) ok(`migrations applied (${applied}/${expected})`);
    else fail(`migrations applied ${applied}/${expected}`, `Run: DATABASE_URL='…' pnpm db:migrate`);
  } finally {
    await close();
  }
});

await section("S3", async () => {
  if (!env.S3_BUCKET) return fail("S3_BUCKET missing");
  const Bucket = env.S3_BUCKET;
  const s3 = new S3Client({
    region: env.S3_REGION || "us-east-1",
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
    // Same settings as lib/storage/s3.ts.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  // CORS: browsers PUT parts directly and must read the ETag header.
  try {
    const { CORSRules = [] } = await s3.send(new GetBucketCorsCommand({ Bucket }));
    const exposesEtag = CORSRules.some((r) => r.ExposeHeaders?.some((h) => h.toLowerCase() === "etag"));
    const allowsPut = CORSRules.some((r) => r.AllowedMethods?.includes("PUT"));
    const origin = env.AUTH_URL ? new URL(env.AUTH_URL).origin : undefined;
    const allowsOrigin = !origin || CORSRules.some((r) => r.AllowedOrigins?.some((o) => o === "*" || o === origin));
    check(
      exposesEtag && allowsPut && allowsOrigin,
      "CORS allows PUT from the app and exposes ETag",
      `CORS incomplete (ETag exposed: ${exposesEtag}, PUT: ${allowsPut}, origin ${origin}: ${allowsOrigin})`,
      "Bucket → Permissions → CORS → paste infra/s3-cors.json.",
    );
  } catch (err) {
    if (err.name === "NoSuchCORSConfiguration") fail("No CORS configuration", "Bucket → Permissions → CORS → paste infra/s3-cors.json.");
    else fail(`GetBucketCors: ${err.name}: ${err.message}`, hintFor(err) ??
          (err.$metadata
            ? "Add s3:GetBucketCors to the IAM policy (see infra/iam-policy.json)."
            : "Can't reach S3: check S3_REGION / S3_ENDPOINT and your network."));
  }

  // Multipart create + abort (what every upload does first / on cancel).
  const key = `preflight/${Date.now()}.txt`;
  const { UploadId } = await s3.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: "text/plain" }));
  await s3.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId }));
  ok("multipart upload create + abort");

  // Presigned PUT → HEAD → presigned GET → DELETE, like the browser does.
  const body = "schuster preflight";
  const putUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: "text/plain" }), { expiresIn: 60 });
  const put = await fetch(putUrl, { method: "PUT", body, headers: { "Content-Type": "text/plain" } });
  if (!put.ok) return fail(`presigned PUT returned ${put.status}`, (await put.text()).slice(0, 200));
  ok(`presigned PUT (ETag ${put.headers.get("etag")})`);

  const head = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
  check(head.ContentLength === body.length, "HEAD sees the object", `HEAD size ${head.ContentLength}`);

  const getUrl = await getSignedUrl(s3, new GetObjectCommand({ Bucket, Key: key }), { expiresIn: 60 });
  const got = await fetch(getUrl);
  check((await got.text()) === body, "presigned GET returns the bytes", `presigned GET returned ${got.status}`);

  await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
  ok("DELETE (cleaned up)");
});

// The apex domain also hosts IONOS mailboxes: make sure the deploy hasn't broken them.
const appHost = env.AUTH_URL ? new URL(env.AUTH_URL).hostname : "";
if (appHost && !/^(localhost|127\.|\[::1\])/.test(appHost)) {
  await section("DNS (email safety)", async () => {
    const VERCEL_IP = "76.76.21.21";
    try {
      const mx = (await resolveMx(appHost)).sort((a, b) => a.priority - b.priority).map((r) => r.exchange);
      if (!mx.length) {
        fail(`No MX records on ${appHost}`, "Your IONOS email would stop working. Restore the MX records from your step-0 screenshot.");
      } else if (mx.some((h) => /ionos|1and1|perfora/i.test(h))) {
        ok(`MX intact: ${mx.join(", ")}`);
      } else {
        warn(`MX points at ${mx.join(", ")}, not IONOS`, "If your mailboxes are at IONOS, check the MX records weren't changed.");
      }
    } catch (err) {
      // ENODATA: the domain resolves but has no MX. ENOTFOUND is ambiguous (offline DNS), so only warn.
      if (err.code === "ENODATA")
        fail(`No MX records on ${appHost}`, "Your IONOS email would stop working. Restore the MX records from your step-0 screenshot.");
      else warn(`Couldn't look up MX for ${appHost} (${err.code ?? err.message})`, "Check your network and re-run.");
    }

    try {
      const a = await resolve4(appHost);
      if (a.includes(VERCEL_IP)) ok(`${appHost} → ${VERCEL_IP} (Vercel)`);
      else
        warn(`${appHost} → ${a.join(", ")}`, `Not pointed at Vercel yet; expected before DEPLOY.md step 7 (A @ → ${VERCEL_IP}).`);
    } catch (err) {
      warn(`Couldn't resolve ${appHost} (${err.code ?? err.message})`, `Set A @ → ${VERCEL_IP} in DEPLOY.md step 7.`);
    }

    const fromDomain = (env.EMAIL_FROM ?? "").match(/@([^>\s]+)/)?.[1];
    if (fromDomain === appHost)
      warn(`EMAIL_FROM sends from ${fromDomain}`, `Send from mail.${appHost} so Resend stays separate from the IONOS mail domain.`);
    else if (fromDomain) ok(`sign-in emails sent from ${fromDomain}, separate from the IONOS mailboxes`);
  });
}

if (env.AUTH_RESEND_KEY) {
  await section("Resend", async () => {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${env.AUTH_RESEND_KEY}` },
    });
    if (res.status === 401 || res.status === 403) {
      // "Sending access" keys can send mail but not list domains.
      if (/restricted/i.test(await res.text()))
        return warn("Key is send-only, so domain status can't be checked", "Confirm the domain shows Verified in Resend → Domains.");
      return fail("API key rejected", "Create a new key in Resend → API Keys.");
    }
    if (!res.ok) return fail(`Resend API returned ${res.status}`);
    const { data = [] } = await res.json();
    const from = env.EMAIL_FROM ?? "login@mail.schuster.me";
    const domain = from.match(/@([^>\s]+)/)?.[1];
    const match = data.find((d) => d.name === domain);
    if (!match) fail(`Domain ${domain} not added in Resend`, "Resend → Domains → Add domain, then add its DNS records.");
    else if (match.status !== "verified") fail(`Domain ${domain} status: ${match.status}`, "Add Resend's DNS records and wait for verification.");
    else ok(`sending domain ${domain} verified`);
  });
}

console.log(failed ? `❌ ${failed} check(s) failed.` : "✅ All checks passed. Ready to deploy.");
process.exit(failed ? 1 : 0);
