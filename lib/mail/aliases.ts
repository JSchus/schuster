import { randomBytes } from "node:crypto";

/** The subdomain aliases live on (never schuster.me itself: that's the IONOS mailboxes). */
export const DEFAULT_MAIL_DOMAIN = "m.schuster.me";

/** Names nobody can take: required mailboxes, and the reverse-alias prefix. */
export const RESERVED = new Set(["postmaster", "abuse", "admin", "administrator", "mail", "noreply", "no-reply", "bounce", "bounces", "hostmaster", "webmaster", "root", "security", "support"]);
/** Built-in aliases that reach the site's admins. */
export const ADMIN_ALIASES = new Set(["postmaster", "abuse"]);
export const REVERSE_PREFIX = "r-";

const LOCAL = /^[a-z0-9](?:[a-z0-9.-]{0,38}[a-z0-9])?$/;

/** "Netflix Account!" → "netflix-account". */
export function normalizeLocal(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/@.*$/, "")
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 40);
}

/** Why a name can't be used, or null if it's fine. */
export function localProblem(local: string): string | null {
  if (local.length < 2 || !LOCAL.test(local)) return "Use 2–40 letters, numbers, dots or dashes.";
  if (local.includes("..")) return "Use 2–40 letters, numbers, dots or dashes.";
  if (RESERVED.has(local) || local.startsWith(REVERSE_PREFIX)) return `“${local}” is reserved. Try another name.`;
  return null;
}

const ADJECTIVES = ["quiet", "sunny", "brave", "lucky", "swift", "misty", "happy", "clever", "gentle", "bright", "calm", "jolly", "rapid", "silver", "golden", "cosmic"];
const ANIMALS = ["otter", "fox", "panda", "falcon", "koala", "tiger", "badger", "heron", "lynx", "moose", "gecko", "orca", "raven", "bison", "llama", "puffin"];

/** A friendly random name like "quiet-otter-42". */
export function randomLocal(rng: () => number = Math.random): string {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)]!;
  return `${pick(ADJECTIVES)}-${pick(ANIMALS)}-${10 + Math.floor(rng() * 90)}`;
}

/** Hidden reply address token: 16 lower-case base32 characters. */
export function reverseToken(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  return [...randomBytes(16)].map((b) => alphabet[b % 32]).join("");
}

export function splitAddress(address: string): { local: string; domain: string } {
  const at = address.lastIndexOf("@");
  return { local: address.slice(0, at).toLowerCase(), domain: address.slice(at + 1).toLowerCase() };
}

/** Forwarding right now: on, not paused after a complaint, not expired. */
export function isLive(alias: { active: boolean; pausedReason: string | null; expiresAt: Date | null }, now = new Date()): boolean {
  return alias.active && !alias.pausedReason && (!alias.expiresAt || alias.expiresAt > now);
}
