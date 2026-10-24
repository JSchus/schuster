// Create the dev bucket and apply infra/s3-cors.json on the local S3 emulator.
//   pnpm dev:s3
import { readFileSync } from "node:fs";
import {
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketPolicyCommand,
  S3Client,
} from "@aws-sdk/client-s3";

process.loadEnvFile?.(".env.local");
const { S3_BUCKET = "schuster-media", S3_ENDPOINT = "http://localhost:5055" } = process.env;

const s3 = new S3Client({
  region: process.env.S3_REGION ?? "us-east-1",
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "test",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "test",
  },
});

try {
  await s3.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
} catch (err) {
  if (!["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(err.name)) throw err;
}
const cors = JSON.parse(readFileSync(new URL("../infra/s3-cors.json", import.meta.url), "utf8"));
await s3.send(new PutBucketCorsCommand({ Bucket: S3_BUCKET, CORSConfiguration: cors }));
// Same public-read rule for webgames/ as production (infra/s3-webgames-policy.json).
const policy = readFileSync(new URL("../infra/s3-webgames-policy.json", import.meta.url), "utf8").replaceAll(
  "REPLACE_WITH_BUCKET_NAME",
  S3_BUCKET,
);
await s3.send(new PutBucketPolicyCommand({ Bucket: S3_BUCKET, Policy: policy }));
console.log(`Bucket "${S3_BUCKET}" ready at ${S3_ENDPOINT}`);
