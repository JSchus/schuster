import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MagicLinkForm } from "@/components/auth/magic-link-form";
import { PasskeySignIn } from "@/components/auth/passkey-sign-in";
import { ThemeToggle } from "@/components/theme-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  AccessDenied: "That email isn't on the family list yet. Ask the admin to add you.",
  Verification: "That sign-in link has expired or was already used.",
};

/** Auth.js sends `?provider=resend&type=email` to the verify-request page (also /login). */
type Props = { searchParams: Promise<{ callbackUrl?: string; error?: string; type?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { callbackUrl: rawCallback, error, type } = await searchParams;
  const sent = type === "email";
  const callbackUrl = safeCallback(rawCallback);
  if ((await auth())?.user) redirect(callbackUrl);

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="absolute top-4 right-4" style={{ marginTop: "env(safe-area-inset-top)" }}>
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-xl bg-primary text-xl font-bold text-primary-foreground">
            S
          </div>
          <CardTitle className="text-xl">Schuster Media</CardTitle>
          <CardDescription>Books, movies, music and games for family &amp; friends.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {sent ? (
            <p className="rounded-md bg-muted p-3 text-center text-sm">
              Check your inbox. We sent you a sign-in link.
            </p>
          ) : null}
          {error ? (
            <p className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
              {ERRORS[error] ?? "Sign-in failed. Please try again."}
            </p>
          ) : null}
          <PasskeySignIn callbackUrl={callbackUrl} />
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <MagicLinkForm callbackUrl={callbackUrl} />
        </CardContent>
      </Card>
    </main>
  );
}

/** Reduce any callback (relative or absolute) to a same-origin path. */
function safeCallback(raw: string | undefined): string {
  if (!raw) return "/";
  try {
    const u = new URL(raw, "http://local");
    return `${u.pathname}${u.search}${u.hash}` || "/";
  } catch {
    return "/";
  }
}
