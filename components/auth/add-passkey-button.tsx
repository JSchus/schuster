"use client";

import { KeyRound } from "lucide-react";
import { signIn } from "next-auth/webauthn";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * Register a passkey for the signed-in user — the upgrade path after a
 * magic-link login, or for adding a second device.
 */
export function AddPasskeyButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={busy}
      aria-label="Add a passkey for this device"
      title="Add a passkey for this device"
      onClick={async () => {
        setBusy(true);
        try {
          const res = await signIn("passkey", { action: "register", redirect: false });
          if (!res?.ok || res.error) throw new Error(res?.error ?? "Registration failed");
          toast.success("Passkey added. Next time just use your fingerprint or face.");
        } catch {
          toast.error("Couldn't add a passkey on this device.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <KeyRound />
    </Button>
  );
}
