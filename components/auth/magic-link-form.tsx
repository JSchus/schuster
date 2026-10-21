import { Mail } from "lucide-react";
import { signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Email magic-link fallback for devices without passkey support. */
export function MagicLinkForm({ callbackUrl }: { callbackUrl: string }) {
  return (
    <form
      className="grid gap-3"
      action={async (formData) => {
        "use server";
        await signIn("resend", { email: String(formData.get("email") ?? ""), redirectTo: callbackUrl });
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="ml-email">Email</Label>
        <Input id="ml-email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      </div>
      <Button type="submit" variant="outline">
        <Mail /> Email me a sign-in link
      </Button>
    </form>
  );
}
