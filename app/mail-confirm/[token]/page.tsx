import { CheckCircle2, Link2Off } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { confirmReplyAddress } from "@/lib/db/mail";
import { hashToken } from "@/lib/mail/confirm";
import { isTokenShape } from "@/lib/sharing/tokens";

type Props = { params: Promise<{ token: string }> };

export const metadata: Metadata = {
  title: "Confirm reply address",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export const dynamic = "force-dynamic";

/** The link from a "Confirm replies from this address" email. Works without signing in. */
export default async function MailConfirmPage({ params }: Props) {
  const { token } = await params;
  const row = isTokenShape(token) ? await confirmReplyAddress(hashToken(token)) : undefined;
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 text-primary">{row ? <CheckCircle2 className="size-10" /> : <Link2Off className="size-10 text-muted-foreground" />}</div>
          <CardTitle className="text-xl">{row ? "Address confirmed" : "Link not valid"}</CardTitle>
          <CardDescription>
            {row
              ? `Replies to your email aliases from ${row.email} will now go out as the alias.`
              : "It may have expired (links last 24 hours) or already been used. Add the address again on the Email aliases page."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/mail">Go to Email aliases</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
