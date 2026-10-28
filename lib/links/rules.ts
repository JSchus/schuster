/**
 * Short-link rules (pure, shared by the API and the browser form).
 * Slugs are the word after schuster.me/go/.
 */

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
/** No 0/o, 1/l/i: random words are easy to read aloud and type. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** "My Recital!" → "my-recital". */
export function normalizeSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function isValidSlug(slug: string): boolean {
  return slug.length >= 2 && SLUG.test(slug);
}

export function randomSlug(length = 6, random: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < length; i++) s += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return s;
}

/**
 * A destination we're willing to redirect to: http(s) only, no passwords in
 * the URL, and not another /go/ link on this site (no loops). Returns the
 * cleaned URL, or an error message.
 */
export function validateTarget(raw: string, ownHost?: string): { url: string } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: "Enter where the link should go." };
  if (text.length > 2048) return { error: "That address is too long." };
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return { error: "That doesn't look like a web address." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { error: "Only web addresses (http or https) are allowed." };
  if (u.username || u.password) return { error: "Addresses with a password in them aren't allowed." };
  if (!u.hostname.includes(".") && u.hostname !== "localhost") return { error: "That doesn't look like a web address." };
  const host = u.hostname.replace(/^www\./, "");
  if (ownHost && host === ownHost.replace(/^www\./, "") && u.pathname.startsWith("/go/")) {
    return { error: "A short link can't point to another short link." };
  }
  return { url: u.toString() };
}
