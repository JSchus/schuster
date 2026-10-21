"use client";

import { Fingerprint, KeyRound } from "lucide-react";
import { signIn } from "next-auth/webauthn";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "signin" | "register";

/**
 * Passkey sign-in (discoverable credential, no email needed) and first-time
 * passkey registration (asks for an email to create the account).
 */
export function PasskeySignIn({ callbackUrl }: { callbackUrl: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(options: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const res = await signIn("passkey", { ...options, redirect: false, redirectTo: callbackUrl });
      if (!res?.ok || res.error) throw new Error(res?.error ?? "failed");
      window.location.href = res.url ?? callbackUrl;
    } catch (err) {
      const cancelled = err instanceof Error && err.name === "NotAllowedError";
      setError(
        cancelled
          ? "Passkey prompt was cancelled."
          : mode === "register"
            ? "Couldn't create a passkey. Is this email on the family list?"
            : "No passkey found for this site on this device. Try creating one, or use an email link.",
      );
      setBusy(false);
    }
  }

  if (mode === "register") {
    return (
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run({ action: "register", email });
        }}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="pk-email">Your email</Label>
          <Input
            id="pk-email"
            type="email"
            autoComplete="email webauthn"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        <Button type="submit" size="lg" disabled={busy}>
          <KeyRound /> Create passkey
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="button" variant="link" size="sm" onClick={() => setMode("signin")}>
          I already have a passkey
        </Button>
      </form>
    );
  }

  return (
    <div className="grid gap-3">
      <Button size="lg" disabled={busy} onClick={() => void run({})}>
        <Fingerprint /> Sign in with passkey
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button variant="link" size="sm" onClick={() => setMode("register")}>
        First time here? Create a passkey
      </Button>
    </div>
  );
}
