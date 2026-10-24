"use client";

import { Loader2, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ROLE_LABELS, ROLES, type Role } from "@/lib/permissions";
import { sendJson } from "@/lib/sharing/client";

type Props = {
  user: { id: string; name: string | null; email: string | null; role: Role; joined: string; items: number; storage: string };
  isSelf: boolean;
};

/** One person on the admin page: change their role, or remove them. */
export function UserRow({ user, isSelf }: Props) {
  const router = useRouter();
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
    <tr className="border-t align-middle">
      <td className="py-2 pr-3">
        <div className="font-medium">{user.name ?? user.email}</div>
        {user.name ? <div className="text-xs text-muted-foreground">{user.email}</div> : null}
      </td>
      <td className="py-2 pr-3">
        <select
          aria-label={`Role for ${user.email}`}
          value={user.role}
          disabled={busy}
          onChange={(e) =>
            run(() => sendJson(`/api/admin/users/${user.id}`, "PATCH", { role: e.target.value }), "Role changed. It applies within 5 minutes.")
          }
          className="h-8 rounded-md border bg-background px-2"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 pr-3 text-muted-foreground tabular-nums">{user.items}</td>
      <td className="py-2 pr-3 text-muted-foreground tabular-nums">{user.storage}</td>
      <td className="py-2 pr-3 text-muted-foreground">{user.joined}</td>
      <td className="py-2 text-right">
        {isSelf ? (
          <span className="text-xs text-muted-foreground">you</span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={() =>
              window.confirm(`Remove ${user.email}? They'll be signed out. Things they uploaded stay in the library.`) &&
              run(() => sendJson(`/api/admin/users/${user.id}`, "DELETE"), "Removed")
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <UserX />} Remove
          </Button>
        )}
      </td>
    </tr>
  );
}
