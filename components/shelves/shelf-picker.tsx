"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendJson } from "@/lib/sharing/client";

export type PickerShelf = { id: string; name: string; has: boolean };

/** Shelves and playlists share this picker; only the routes and words differ. */
const KINDS = {
  shelf: { base: "/api/shelves", members: "items", noun: "shelf", plural: "shelves" },
  playlist: { base: "/api/playlists", members: "tracks", noun: "playlist", plural: "playlists" },
} as const;

type Props = { itemId: string; shelves: PickerShelf[]; kind?: keyof typeof KINDS };

/** Tick the shelves (or playlists) an item belongs on, or start a new one with it. */
export function ShelfPicker({ itemId, shelves: initial, kind = "shelf" }: Props) {
  const k = KINDS[kind];
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
      await sendJson(`${k.base}/${shelf.id}/${k.members}`, shelf.has ? "DELETE" : "POST", { itemId });
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
      const { id } = await sendJson<{ id: string }>(k.base, "POST", { name });
      await sendJson(`${k.base}/${id}/${k.members}`, "POST", { itemId });
      setShelves((all) => [...all, { id, name: name.trim(), has: true }]);
      setName("");
      toast.success(kind === "shelf" ? "Shelf created" : "Playlist created");
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
        <p className="text-sm text-muted-foreground">You don&apos;t have any {k.plural} yet.</p>
      )}
      <form onSubmit={create} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={`New ${k.noun} name`} maxLength={100} aria-label={`New ${k.noun} name`} />
        <Button type="submit" variant="outline" disabled={busy === "new" || !name.trim()}>
          {busy === "new" ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
      </form>
    </div>
  );
}
