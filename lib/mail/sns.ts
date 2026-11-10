import { createVerify } from "node:crypto";

/**
 * Amazon SNS message signature check. Without it anyone could POST a fake
 * "new email" notification to the public inbound route.
 * https://docs.aws.amazon.com/sns/latest/dg/sns-verify-signature-of-message.html
 */

export type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  Subject?: string;
  Token?: string;
  SubscribeURL?: string;
};

const NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"] as const;
const SUBSCRIPTION_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"] as const;

/** The exact text SNS signed. */
export function stringToSign(m: SnsMessage): string {
  const keys = m.Type === "Notification" ? NOTIFICATION_KEYS : SUBSCRIPTION_KEYS;
  return keys
    .filter((k) => m[k] !== undefined)
    .map((k) => `${k}\n${m[k]}\n`)
    .join("");
}

/** Only certificates served by SNS itself, over https. */
export function isSnsCertUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /^sns\.[a-z0-9-]+\.amazonaws\.com$/.test(u.hostname) && u.pathname.endsWith(".pem");
  } catch {
    return false;
  }
}

const certCache = new Map<string, string>();

async function fetchCert(url: string): Promise<string> {
  const cached = certCache.get(url);
  if (cached) return cached;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't fetch the SNS certificate (${res.status})`);
  const pem = await res.text();
  certCache.set(url, pem);
  return pem;
}

export type VerifyOptions = {
  topicArn: string | undefined;
  /** Tests inject a certificate instead of fetching one. */
  getCert?: (url: string) => Promise<string>;
  now?: number;
  /** Reject messages older than this (replays). Default 1 hour. */
  maxAgeMs?: number;
};

/** Throws with a reason unless the message is a genuine, recent SNS message for our topic. */
export async function verifySns(m: SnsMessage, opts: VerifyOptions): Promise<void> {
  if (!opts.topicArn || m.TopicArn !== opts.topicArn) throw new Error("Unexpected SNS topic");
  if (!isSnsCertUrl(m.SigningCertURL)) throw new Error("Untrusted certificate URL");
  const age = (opts.now ?? Date.now()) - Date.parse(m.Timestamp);
  if (!Number.isFinite(age) || age > (opts.maxAgeMs ?? 3_600_000) || age < -300_000) throw new Error("Stale SNS message");
  const algorithm = m.SignatureVersion === "2" ? "RSA-SHA256" : m.SignatureVersion === "1" ? "RSA-SHA1" : null;
  if (!algorithm) throw new Error("Unknown SNS signature version");
  const pem = await (opts.getCert ?? fetchCert)(m.SigningCertURL);
  const ok = createVerify(algorithm).update(stringToSign(m), "utf8").verify(pem, m.Signature, "base64");
  if (!ok) throw new Error("Bad SNS signature");
}
