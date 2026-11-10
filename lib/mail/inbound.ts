import "server-only";
import {
  addLog,
  adminEmails,
  countMessage,
  emailsFor,
  getAliasByLocal,
  getReverse,
  pruneLog,
  reverseTokenFor,
  updateAlias,
} from "@/lib/db/mail";
import type { MailAlias } from "@/lib/db/schema";
import type { StorageAdapter } from "@/lib/storage/types";
import { ADMIN_ALIASES, isLive, REVERSE_PREFIX, reverseToken, splitAddress } from "./aliases";
import { decodeWords, formatAddress, getHeader, parseAddress, parseMessage, rewriteMessage } from "./headers";
import type { MailSender } from "./sender";

/** The parts of an SES notification we use (Received, Bounce, Complaint). */
export type SesNotification = {
  notificationType: "Received" | "Bounce" | "Complaint" | string;
  mail: { source: string; destination?: string[]; commonHeaders?: { subject?: string } };
  receipt?: {
    recipients: string[];
    spamVerdict?: { status: string };
    virusVerdict?: { status: string };
    spfVerdict?: { status: string };
    dkimVerdict?: { status: string };
    action: { type: string; objectKey?: string; objectKeyPrefix?: string };
  };
  bounce?: { bounceType?: string };
  complaint?: unknown;
};

export const INBOUND_PREFIX = "inbound/";
export const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

/** Headers removed before forwarding: signatures and routing that would fail or leak. */
const FORWARD_STRIP = [
  "DKIM-Signature",
  "DomainKey-Signature",
  "ARC-Seal",
  "ARC-Message-Signature",
  "ARC-Authentication-Results",
  "Return-Path",
  "Sender",
  "Reply-To",
  "X-Original-From",
  "Received-SPF",
  "Authentication-Results",
];

/** On masked replies we keep only these headers, so nothing about the real sender leaks. */
const REPLY_KEEP = [
  "Subject",
  "Date",
  "Message-ID",
  "In-Reply-To",
  "References",
  "MIME-Version",
  "Content-Type",
  "Content-Transfer-Encoding",
  "Content-Language",
];

export type Deps = { storage: StorageAdapter; sender: MailSender; domain: string; now?: Date };
export type Outcome = { recipient: string; outcome: string };

const passed = (v?: { status: string }) => v?.status === "PASS";
const failed = (v?: { status: string }) => v?.status === "FAIL";

/** Handle one SES notification from SNS. Returns what happened to each recipient (for logs and tests). */
export async function handleSesNotification(n: SesNotification, deps: Deps): Promise<Outcome[]> {
  if (n.notificationType === "Bounce" || n.notificationType === "Complaint") return handleFeedback(n, deps);
  if (n.notificationType !== "Received" || !n.receipt) return [];

  const key = n.receipt.action.objectKey ?? "";
  // Only ever read what SES stored for us: never any other part of the bucket.
  if (n.receipt.action.type !== "S3" || !key.startsWith(INBOUND_PREFIX) || key.includes("..")) {
    throw new Error("Refusing a receipt outside inbound/");
  }
  const raw = await deps.storage.getBytes(key, MAX_MESSAGE_BYTES);
  if (!raw) throw new Error("Stored message not found");

  const results: Outcome[] = [];
  for (const recipient of n.receipt.recipients) {
    const { local, domain } = splitAddress(recipient);
    if (domain !== deps.domain) continue;
    const outcome = local.startsWith(REVERSE_PREFIX)
      ? await reply(local.slice(REVERSE_PREFIX.length), n, raw, key, deps)
      : await forward(local, n, raw, key, deps);
    results.push({ recipient, outcome });
  }
  await pruneLog(deps.now);
  return results;
}

/** Mail to an alias → its owner (or group members), shown as "Name via Schuster Media". */
async function forward(local: string, n: SesNotification, raw: Uint8Array, key: string, deps: Deps): Promise<string> {
  const parsed = parseMessage(raw);
  const from = parseAddress(getHeader(parsed, "From")) ?? parseAddress(n.mail.source);
  const subject = decodeWords(getHeader(parsed, "Subject") ?? n.mail.commonHeaders?.subject ?? "");
  const aliasAddress = `${local}@${deps.domain}`;

  // postmaster@ and abuse@ must work; they go to the admins.
  if (ADMIN_ALIASES.has(local)) {
    if (failed(n.receipt!.virusVerdict)) return "virus";
    const to = await adminEmails();
    if (to.length) await deps.sender.sendRaw(aliasAddress, to, rewriteMessage(raw, { remove: FORWARD_STRIP }));
    return "delivered";
  }

  const alias = await getAliasByLocal(local);
  if (!alias) return "unknown";
  const log = (outcome: string) =>
    addLog({ aliasId: alias.id, direction: "in", fromAddr: from?.address ?? n.mail.source, toAddr: aliasAddress, subject, s3Key: key, outcome });

  let blockedAs: string | null = null;
  if (failed(n.receipt!.virusVerdict)) blockedAs = "virus";
  else if (failed(n.receipt!.spamVerdict)) blockedAs = "spam";
  else if (!isLive(alias, deps.now)) blockedAs = alias.expiresAt && alias.expiresAt <= (deps.now ?? new Date()) ? "expired" : "off";
  if (blockedAs) {
    await log(blockedAs);
    await countMessage(alias.id, false);
    return blockedAs;
  }

  const to = await recipientsOf(alias);
  if (!to.length || !from) {
    await log("failed");
    return "failed";
  }
  const token = await reverseTokenFor(alias.id, from.address, reverseToken());
  const out = rewriteMessage(raw, {
    remove: FORWARD_STRIP,
    set: [
      ["From", formatAddress(`${decodeWords(from.name) || from.address} via Schuster Media`, aliasAddress)],
      ["Reply-To", `${REVERSE_PREFIX}${token}@${deps.domain}`],
      ["X-Original-From", from.address],
    ],
  });
  await deps.sender.sendRaw(aliasAddress, to, out);
  await log("delivered");
  await countMessage(alias.id, true);
  return "delivered";
}

/** A reply to r-{token}@ from the alias's owner → the original sender, from the alias. */
async function reply(token: string, n: SesNotification, raw: Uint8Array, key: string, deps: Deps): Promise<string> {
  const rev = await getReverse(token);
  if (!rev) return "unknown";
  const { alias, externalAddress } = rev;
  const parsed = parseMessage(raw);
  const sender = parseAddress(getHeader(parsed, "From"))?.address ?? n.mail.source.toLowerCase();
  const aliasAddress = `${alias.localPart}@${deps.domain}`;
  const subject = decodeWords(getHeader(parsed, "Subject") ?? "");
  const log = (outcome: string) =>
    addLog({ aliasId: alias.id, direction: "out", fromAddr: aliasAddress, toAddr: externalAddress, subject, s3Key: key, outcome });

  // Only the alias's own people may send as it, and only with a passing SPF or DKIM check (no spoofing).
  const allowed = await recipientsOf(alias);
  const authentic = passed(n.receipt!.spfVerdict) || passed(n.receipt!.dkimVerdict);
  if (!allowed.includes(sender) || !authentic || failed(n.receipt!.virusVerdict)) {
    await log("rejected");
    return "rejected";
  }
  if (!isLive(alias, deps.now)) {
    await log("off");
    return "off";
  }
  const out = rewriteMessage(raw, {
    keepOnly: REPLY_KEEP,
    set: [
      ["From", aliasAddress],
      ["To", externalAddress],
    ],
  });
  await deps.sender.sendRaw(aliasAddress, [externalAddress], out);
  await log("delivered");
  return "delivered";
}

/** Bounces are logged; a complaint about a forward pauses that alias (protects the SES reputation). */
async function handleFeedback(n: SesNotification, deps: Deps): Promise<Outcome[]> {
  const { local, domain } = splitAddress(n.mail.source);
  if (domain !== deps.domain) return [];
  const alias = await getAliasByLocal(local);
  if (!alias) return [];
  const outcome = n.notificationType === "Complaint" ? "complained" : "bounced";
  await addLog({
    aliasId: alias.id,
    direction: "out",
    fromAddr: n.mail.source,
    toAddr: (n.mail.destination ?? []).join(", "),
    subject: n.mail.commonHeaders?.subject ?? null,
    s3Key: null,
    outcome,
  });
  if (outcome === "complained") {
    await updateAlias(alias.id, { pausedReason: "An email from this alias was marked as spam, so it was paused." });
  }
  return [{ recipient: n.mail.source, outcome }];
}

/** Who an alias delivers to: the owner, plus the members of a group. */
async function recipientsOf(alias: MailAlias): Promise<string[]> {
  const ids = alias.kind === "group" ? [alias.ownerId, ...alias.memberIds] : [alias.ownerId];
  return [...new Set(await emailsFor([...new Set(ids)]))];
}
