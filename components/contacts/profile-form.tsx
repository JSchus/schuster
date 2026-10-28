"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendJson } from "@/lib/sharing/client";
import type { ProfileBody } from "@/lib/sharing/protocol";

type Props = {
  initial: { displayName: string | null; phone: string | null; birthday: string | null; address: string | null; note: string | null; listed: boolean } | null;
};

/** Your own family-directory entry, and whether the family can see it. */
export function ProfileForm({ initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState(initial?.displayName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [birthday, setBirthday] = useState(initial?.birthday?.replace(/^--/, "") ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [listed, setListed] = useState(initial?.listed ?? false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: ProfileBody = {
        displayName: displayName || null,
        phone: phone || null,
        birthday: birthday ? (/^\d{2}-\d{2}$/.test(birthday) ? `--${birthday}` : birthday) : null,
        address: address || null,
        note: note || null,
        listed,
      };
      await sendJson("/api/profile", "PUT", body);
      toast.success(listed ? "Saved. The family can see your entry." : "Saved. Your entry is hidden.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {initial ? "Edit my entry" : "Add myself"}
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="grid w-full gap-3 rounded-lg border p-4">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={listed} onChange={(e) => setListed(e.target.checked)} />
        Show me in the family directory
      </label>
      <div className="grid gap-1.5">
        <Label htmlFor="p-name">Name to show</Label>
        <Input id="p-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={200} />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label htmlFor="p-phone">Phone</Label>
          <Input id="p-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={40} />
        </div>
        <div className="grid min-w-40 flex-1 gap-1.5">
          <Label htmlFor="p-bday">Birthday</Label>
          <Input id="p-bday" value={birthday} onChange={(e) => setBirthday(e.target.value)} placeholder="1985-04-12 or 04-12" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-address">Address (optional)</Label>
        <Input id="p-address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={500} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-note">Note (optional)</Label>
        <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Best to text after 6 pm" />
      </div>
      <p className="text-xs text-muted-foreground">Your email address from your account is shown too.</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
