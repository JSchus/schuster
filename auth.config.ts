import type { NextAuthConfig } from "next-auth";

/** Paths reachable without a session. */
const PUBLIC_PATHS = [
  /^\/login$/,
  /^\/offline$/,
  /^\/api\/auth\//,
  // Invite links and public share links (each checks its own token).
  /^\/invite\/[^/]+$/,
  /^\/api\/invites\/[^/]+$/,
  /^\/s\/[^/]+$/,
  /^\/api\/s\/[^/]+\/download$/,
  // Short links (public by design; each checks its own expiry and password).
  /^\/go\/[^/]+$/,
];

/**
 * Edge-safe subset of the Auth.js config, used by middleware. It only decodes
 * the JWT session cookie — no database or provider code runs at the edge.
 */
export const authConfig = {
  pages: { signIn: "/login", verifyRequest: "/login", error: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (PUBLIC_PATHS.some((p) => p.test(pathname))) return true;
      if (auth?.user) return true;
      // API calls get a 401 instead of an HTML redirect.
      if (pathname.startsWith("/api/")) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }
      return false;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      session.user.role = token.role ?? "viewer";
      return session;
    },
  },
} satisfies NextAuthConfig;
