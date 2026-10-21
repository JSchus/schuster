/**
 * Sign-up gate until Stage 5 adds invites. A sign-in is allowed when:
 *  - the user already exists (they were let in before), or
 *  - no admin exists yet (the very first user bootstraps the instance), or
 *  - their email is listed in ALLOWED_EMAILS (comma/space separated).
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
  allowlist: Set<string>;
}): boolean {
  if (opts.userExists) return true;
  if (!opts.adminExists) return true;
  return !!opts.email && opts.allowlist.has(opts.email.toLowerCase());
}
