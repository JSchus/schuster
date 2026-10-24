import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Passkey from "next-auth/providers/passkey";
import Resend from "next-auth/providers/resend";
import { authConfig } from "@/auth.config";
import { canSignIn, parseAllowlist, roleIsStale } from "@/lib/auth/allowlist";
import { adminExists, assignInitialRole, findApprovedEmail, findUserByEmail, getUserRole } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { accounts, authenticators, sessions, users, verificationTokens } from "@/lib/db/schema";
import { env } from "@/lib/env";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const e = env();
  return {
    ...authConfig,
    adapter: DrizzleAdapter(db(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
      authenticatorsTable: authenticators,
    }),
    experimental: { enableWebAuthn: true },
    logger: {
      // Passkeys are "experimental" in Auth.js v5; don't log that on every request.
      warn: (code) => code !== "experimental-webauthn" && console.warn(`[auth][warn] ${code}`),
    },
    providers: [
      Passkey,
      Resend({
        apiKey: e.AUTH_RESEND_KEY,
        from: e.EMAIL_FROM,
        // Local dev without a Resend key: print the magic link to the console.
        ...(!e.AUTH_RESEND_KEY && process.env.NODE_ENV !== "production"
          ? {
              sendVerificationRequest: async ({ identifier, url }) => {
                console.info(`\n🔗 Magic link for ${identifier}:\n${url}\n`);
              },
            }
          : {}),
      }),
    ],
    callbacks: {
      ...authConfig.callbacks,
      async signIn({ user }) {
        const email = user.email ?? null;
        const [existing, approved, hasAdmin] = await Promise.all([
          email ? findUserByEmail(email) : undefined,
          email ? findApprovedEmail(email) : undefined,
          adminExists(),
        ]);
        return canSignIn({
          email,
          userExists: !!existing,
          adminExists: hasAdmin,
          approved: !!approved,
          allowlist: parseAllowlist(e.ALLOWED_EMAILS),
        });
      },
      async jwt({ token, user, trigger }) {
        // Look the role up on sign-in, then at most every few minutes, so an
        // admin's role change or removal takes effect without a sign-out.
        if (token.sub && (user?.id || trigger === "update" || roleIsStale(token.roleAt))) {
          let role: Awaited<ReturnType<typeof getUserRole>> | "unknown";
          try {
            role = await getUserRole(token.sub);
          } catch (err) {
            // Database hiccup: keep the last known role and try again next time.
            console.error("[auth] role check failed", err);
            role = "unknown";
          }
          if (!role) return null; // the account was removed: end the session
          if (role !== "unknown") {
            token.role = role;
            token.roleAt = Date.now();
          }
        }
        return token;
      },
    },
    events: {
      async createUser({ user }) {
        if (user.id) await assignInitialRole(user.id, user.email);
      },
    },
  };
});
