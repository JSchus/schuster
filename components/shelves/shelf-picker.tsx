"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendJson } from "@/lib/sharing/client";

export type PickerShelf = { id: string; name: string; has: boolean };

/** Tick the shelves an item belongs on, or start a new shelf with it. */
export function ShelfPicker({ itemId, shelves: initial }: { itemId: string; shelves: PickerShelf[] }) {
  const router = useRouter();
  const [shelves, setShelves] = useState(initial);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function toggle(shelf: PickerShelf) {
    // Tick immediately; undo if the server refuses.
    const flip = (has: boolean) => setShelves((all) => all.map((s) => (s.id === shelf.id ? { ...s, has } : s)));
    flip(!shelf.has);
    setBusy(shelf.id);
    try {
      await sendJson(`/api/shelves/${shelf.id}/items`, shelf.has ? "DELETE" : "POST", { itemId });
      router.refresh();
    } catch (err) {
      flip(shelf.has);
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy("new");
    try {
      const { id } = await sendJson<{ id: string }>("/api/shelves", "POST", { name });
      await sendJson(`/api/shelves/${id}/items`, "POST", { itemId });
      setShelves((all) => [...all, { id, name: name.trim(), has: true }]);
      setName("");
      toast.success("Shelf created");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      {shelves.length ? (
        <div className="grid gap-1.5">
          {shelves.map((s) => (
            <label key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={s.has} disabled={busy === s.id} onChange={() => toggle(s)} />
              {s.name}
              {busy === s.id ? <Loader2 className="size-3 animate-spin" /> : null}
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">You don&apos;t have any shelves yet.</p>
      )}
      <form onSubmit={create} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New shelf name" maxLength={100} aria-label="New shelf name" />
        <Button type="submit" variant="outline" disabled={busy === "new" || !name.trim()}>
          {busy === "new" ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
      </form>
    </div>
  );
}
