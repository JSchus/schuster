import "server-only";
import { createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual, type BinaryLike } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (pw: BinaryLike, salt: BinaryLike, len: number) => Promise<Buffer>;

/** URL-safe random secret for invite and share links (24 bytes ≈ 192 bits). */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}

/** Plausible link token: what randomToken() makes. Cheap filter before any DB lookup. */
export function isTokenShape(s: string): boolean {
  return /^[A-Za-z0-9_-]{20,64}$/.test(s);
}

/** scrypt password hash, stored as "scrypt$salt$hash" (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32);
  return `scrypt$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Value of the cookie that proves a visitor typed a share link's password.
 * Bound to the token and the password hash, so changing the password (or
 * AUTH_SECRET) invalidates it.
 */
export function shareUnlockValue(secret: string, token: string, passwordHash: string): string {
  return createHmac("sha256", secret).update(`${token}\n${passwordHash}`).digest("base64url");
}

export function shareCookieName(token: string): string {
  return `share-${token}`;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
