/**
 * Sign-up gate. A sign-in is allowed when:
 *  - the user already exists (they were let in before), or
 *  - no admin exists yet (the very first user bootstraps the instance), or
 *  - their email was approved through an invite link or by an admin, or
 *  - their email is listed in ALLOWED_EMAILS (comma/space separated; the
 *    pre-Stage 5 mechanism, still honoured).
 */
export function parseAllowlist(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function canSignIn(opts: {
  email: string | null | undefined;
  userExists: boolean;
  adminExists: boolean;
  approved: boolean;
  allowlist: Set<string>;
}): boolean {
  if (opts.userExists) return true;
  if (!opts.adminExists) return true;
  if (opts.approved) return true;
  return !!opts.email && opts.allowlist.has(opts.email.toLowerCase());
}

/** Re-read the role from the database at most this often (ms). */
export const ROLE_TTL = 5 * 60_000;

export function roleIsStale(roleAt: number | undefined, now = Date.now()): boolean {
  return !roleAt || now - roleAt > ROLE_TTL;
}
