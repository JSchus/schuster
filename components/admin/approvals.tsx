"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { sendJson } from "@/lib/sharing/client";

/**
 * Emails allowed to sign up that haven't yet, plus a form to allow one
 * directly (no link: they just go to schuster.me and sign in).
 */
export function Approvals({ pending }: { pending: { email: string; role: Role }[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "viewer">("member");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            await sendJson("/api/admin/approvals", "POST", { email, role });
            setEmail("");
          }, "Added. They can sign in at schuster.me now.");
        }}
      >
        <label className="grid min-w-56 flex-1 gap-1.5 text-sm">
          <span className="font-medium">Email</span>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="someone@example.com" />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">As</span>
          <select value={role} onChange={(e) => setRole(e.target.value as "member" | "viewer")} className="h-9 rounded-md border bg-background px-2">
            <option value="member">Member</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Plus />} Allow
        </Button>
      </form>
      {pending.length ? (
        <ul className="grid gap-2">
          {pending.map((p) => (
            <li key={p.email} className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {p.email} · {ROLE_LABELS[p.role]} · hasn&apos;t signed up yet
              </span>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => run(() => sendJson("/api/admin/approvals", "DELETE", { email: p.email }), "Removed")}
              >
                <X /> Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
