import { Link2Off, Lock } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countClick, getLink, isLive } from "@/lib/db/links";
import { env } from "@/lib/env";
import { isValidSlug } from "@/lib/links/rules";
import { safeEqual, shareUnlockValue, verifyPassword } from "@/lib/sharing/tokens";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ wrong?: string }> };

export const metadata: Metadata = {
  title: "Schuster Media",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const cookieName = (slug: string) => `link-${slug}`;
const unlockValue = (slug: string, hash: string) => shareUnlockValue(env().AUTH_SECRET, `go:${slug}`, hash);

/** Check the password and remember it for 12 hours in an httpOnly cookie. */
async function unlock(slug: string, formData: FormData) {
  "use server";
  const link = isValidSlug(slug) ? await getLink(slug) : undefined;
  const password = String(formData.get("password") ?? "");
  if (!isLive(link) || !link.passwordHash || !(await verifyPassword(password, link.passwordHash))) {
    redirect(`/go/${slug}?wrong=1`);
  }
  (await cookies()).set(cookieName(slug), unlockValue(slug, link.passwordHash), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 3600,
  });
  redirect(`/go/${slug}`);
}

/**
 * Public short link: counts the visit and redirects. Turned-off, expired
 * or unknown links get a friendly page; password links ask first.
 */
export default async function ShortLinkPage({ params, searchParams }: Props) {
  const { slug: raw } = await params;
  const slug = raw.toLowerCase();
  const link = isValidSlug(slug) ? await getLink(slug) : undefined;

  if (!isLive(link)) {
    return (
      <Shell>
        <Card className="w-full max-w-sm text-center">
          <CardHeader>
            <Link2Off className="mx-auto size-8 text-muted-foreground" />
            <CardTitle>This link doesn&apos;t work any more</CardTitle>
            <CardDescription>It may have expired or been turned off. Ask the person who sent it for a new one.</CardDescription>
          </CardHeader>
        </Card>
      </Shell>
    );
  }

  if (link.passwordHash) {
    const cookie = (await cookies()).get(cookieName(slug))?.value ?? "";
    if (!safeEqual(cookie, unlockValue(slug, link.passwordHash))) {
      const { wrong } = await searchParams;
      return (
        <Shell>
          <Card className="w-full max-w-sm">
            <CardHeader className="text-center">
              <Lock className="mx-auto size-8 text-muted-foreground" />
              <CardTitle>Password needed</CardTitle>
              <CardDescription>Enter the password you were given to open this link.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={unlock.bind(null, slug)} className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="link-pw">Password</Label>
                  <Input id="link-pw" name="password" type="password" autoComplete="off" required autoFocus />
                </div>
                {wrong ? <p className="text-sm text-destructive">That password isn&apos;t right.</p> : null}
                <Button type="submit">Open</Button>
              </form>
            </CardContent>
          </Card>
        </Shell>
      );
    }
  }

  await countClick(slug);
  redirect(link.targetUrl);
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className="absolute top-4 right-4" style={{ marginTop: "env(safe-area-inset-top)" }}>
        <ThemeToggle />
      </div>
      {children}
    </main>
  );
}
