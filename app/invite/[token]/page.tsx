import { Link2Off } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { InviteForm } from "@/components/sharing/invite-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usableInvite } from "@/lib/db/people";
import { isTokenShape } from "@/lib/sharing/tokens";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "You're invited",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Landing page for an invite link: enter your email, then create a passkey or get an email link. */
export default async function InvitePage({ params }: Props) {
  const { token } = await params;
  const [invite, session] = await Promise.all([isTokenShape(token) ? usableInvite(token) : undefined, auth()]);

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
          <CardTitle className="text-xl">{invite ? "You're invited to Schuster Media" : "Invite link not valid"}</CardTitle>
          <CardDescription>
            {invite
              ? "Books, movies, music and games for family & friends."
              : "It may have expired or been used up. Ask for a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {session?.user ? (
            <>
              <p className="text-center text-sm text-muted-foreground">You&apos;re already signed in as {session.user.email}.</p>
              <Button asChild>
                <Link href="/">Go to the library</Link>
              </Button>
            </>
          ) : invite ? (
            <InviteForm token={token} />
          ) : (
            <>
              <Link2Off className="mx-auto size-8 text-muted-foreground" />
              <p className="text-center text-sm text-muted-foreground">Already used this link? You&apos;re in: just sign in.</p>
              <Button asChild variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
