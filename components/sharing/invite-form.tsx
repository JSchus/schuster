"use client";

import { KeyRound, Loader2, Mail } from "lucide-react";
import { signIn as emailSignIn } from "next-auth/react";
import { signIn as passkeySignIn } from "next-auth/webauthn";
import Link from "next/link";
import { useState } from "react";
import type { RedeemResponse } from "@/app/api/invites/[token]/route";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Accept an invite: step 1 approves the email (one use of the link), step 2
 * creates the account with a passkey, or by an emailed sign-in link.
 */
export function InviteForm({ token }: { token: string }) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | RedeemResponse["status"]>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invites/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Something went wrong");
      setStep((body as RedeemResponse).status);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createPasskey() {
    setBusy(true);
    setError(null);
    try {
      const res = await passkeySignIn("passkey", { action: "register", email, redirect: false, redirectTo: "/" });
      if (!res?.ok || res.error) throw new Error(res?.error ?? "failed");
      window.location.href = "/";
    } catch (err) {
      const cancelled = err instanceof Error && err.name === "NotAllowedError";
      setError(cancelled ? "Passkey prompt was cancelled." : "Couldn't create a passkey here. Try the email link instead.");
      setBusy(false);
    }
  }

  async function sendLink() {
    setBusy(true);
    setError(null);
    try {
      const res = await emailSignIn("resend", { email, redirect: false, redirectTo: "/" });
      if (res?.error) throw new Error(res.error);
      setSent(true);
    } catch {
      setError("Couldn't send the email. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (step === "email") {
    return (
      <form className="grid gap-3" onSubmit={redeem}>
        <div className="grid gap-1.5">
          <Label htmlFor="invite-email">Your email</Label>
          <Input
            id="invite-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Continue
        </Button>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </form>
    );
  }

  if (step === "existing") {
    return (
      <div className="grid gap-3 text-center">
        <p className="text-sm text-muted-foreground">{email} already has an account. Just sign in.</p>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (sent) {
    return (
      <p className="rounded-md bg-muted p-3 text-center text-sm">
        Check your inbox at {email}. The link in that email signs you in.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-center text-sm text-muted-foreground">
        Welcome! Create a passkey to sign in with your fingerprint or face from now on.
      </p>
      <Button size="lg" onClick={createPasskey} disabled={busy}>
        <KeyRound /> Create passkey
      </Button>
      <Button variant="outline" onClick={sendLink} disabled={busy}>
        <Mail /> Email me a sign-in link instead
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
