import { DrizzleAdapter } from "@auth/drizzle-adapter";
import NextAuth from "next-auth";
import Passkey from "next-auth/providers/passkey";
import Resend from "next-auth/providers/resend";
import { authConfig } from "@/auth.config";
import { canSignIn, parseAllowlist } from "@/lib/auth/allowlist";
import { adminExists, findUserByEmail, getUserRole, promoteIfFirstUser } from "@/lib/auth/roles";
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
        const existing = email ? await findUserByEmail(email) : undefined;
        return canSignIn({
          email,
          userExists: !!existing,
          adminExists: await adminExists(),
          allowlist: parseAllowlist(e.ALLOWED_EMAILS),
        });
      },
      async jwt({ token, user, trigger }) {
        // Look the role up on sign-in (and explicit session updates) only, so
        // ordinary requests never hit the database.
        if ((user?.id || trigger === "update") && token.sub) {
          token.role = (await getUserRole(token.sub)) ?? "member";
        }
        return token;
      },
    },
    events: {
      async createUser({ user }) {
        if (user.id) await promoteIfFirstUser(user.id);
      },
    },
  };
});
