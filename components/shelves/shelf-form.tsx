"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { VisibilityFields } from "@/components/sharing/visibility-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Person } from "@/lib/db/people";
import type { Visibility } from "@/lib/permissions";
import { sendJson } from "@/lib/sharing/client";
import type { ShelfBody } from "@/lib/sharing/protocol";

type Existing = { id: string; name: string; description: string | null; visibility: Visibility; ownerId: string };

type Props = {
  /** Omit to create a new shelf. */
  shelf?: Existing;
  ownerId: string;
  people: Person[];
  access?: string[];
};

/** Create a shelf, or rename / re-share / delete an existing one. */
export function ShelfForm({ shelf, ownerId, people, access = [] }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shelf?.name ?? "");
  const [description, setDescription] = useState(shelf?.description ?? "");
  const [visibility, setVisibility] = useState<Visibility>(shelf?.visibility ?? "everyone");
  const [selected, setSelected] = useState(access);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: ShelfBody = {
        name,
        description: description.trim() || null,
        visibility,
        ...(visibility === "people" ? { people: selected } : {}),
      };
      if (shelf) {
        await sendJson(`/api/shelves/${shelf.id}`, "PATCH", body);
        toast.success("Shelf saved");
        setOpen(false);
        router.refresh();
      } else {
        const { id } = await sendJson<{ id: string }>("/api/shelves", "POST", body);
        router.push(`/shelves/${id}`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!shelf || !window.confirm(`Delete the shelf “${shelf.name}”? The items stay in the library.`)) return;
    try {
      await sendJson(`/api/shelves/${shelf.id}`, "DELETE");
      router.push("/shelves");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (!open) {
    return (
      <Button variant={shelf ? "outline" : "default"} size="sm" onClick={() => setOpen(true)}>
        {shelf ? "Shelf settings" : (
          <>
            <Plus /> New shelf
          </>
        )}
      </Button>
    );
  }

  return (
    <form onSubmit={save} className="grid w-full gap-4 rounded-lg border p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="shelf-name">Name</Label>
        <Input id="shelf-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="shelf-description">Description (optional)</Label>
        <Input id="shelf-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
      </div>
      <VisibilityFields
        value={visibility}
        onChange={setVisibility}
        people={people}
        ownerId={shelf?.ownerId ?? ownerId}
        selected={selected}
        onSelected={setSelected}
        noun="shelf"
      />
      <p className="text-xs text-muted-foreground">
        A shelf only groups things: people see the items on it that they&apos;re allowed to see.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} {shelf ? "Save" : "Create shelf"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {shelf ? (
          <Button type="button" variant="ghost" className="ml-auto text-destructive" onClick={remove}>
            <Trash2 /> Delete shelf
          </Button>
        ) : null}
      </div>
    </form>
  );
}
