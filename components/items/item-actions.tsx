"use client";

import { Library, Loader2, Pencil, Share2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { EditItemForm, type EditableItem } from "@/components/items/edit-item-form";
import { SharePanel } from "@/components/sharing/share-panel";
import { ShelfPicker, type PickerShelf } from "@/components/shelves/shelf-picker";
import { Button } from "@/components/ui/button";
import type { Person } from "@/lib/db/people";
import { sendJson } from "@/lib/sharing/client";

type Panel = "edit" | "share" | "shelves" | null;

type Props = {
  item: EditableItem;
  /** Edit, share and delete (uploader or admin). */
  canEdit: boolean;
  /** Shelves this person may add the item to; undefined for viewers. */
  shelves?: PickerShelf[];
  people: Person[];
  access: string[];
  /** Video, audio or image: the share page plays/shows it inline. */
  inline: boolean;
};

/** Edit / Share / Shelves / Delete buttons, each opening its panel below. */
export function ItemActions({ item, canEdit, shelves, people, access, inline }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<Panel>(null);
  const [deleting, setDeleting] = useState(false);
  const toggle = (p: Panel) => setOpen((o) => (o === p ? null : p));

  async function remove() {
    if (!window.confirm(`Delete “${item.title}” for everyone? This removes the file and can't be undone.`)) return;
    setDeleting(true);
    try {
      await sendJson(`/api/items/${item.id}`, "DELETE");
      toast.success("Deleted");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setDeleting(false);
    }
  }

  if (!canEdit && !shelves) return null;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {canEdit ? (
          <Button variant={open === "edit" ? "secondary" : "outline"} size="sm" onClick={() => toggle("edit")}>
            <Pencil /> Edit
          </Button>
        ) : null}
        {canEdit ? (
          <Button variant={open === "share" ? "secondary" : "outline"} size="sm" onClick={() => toggle("share")}>
            <Share2 /> Share link
          </Button>
        ) : null}
        {shelves ? (
          <Button variant={open === "shelves" ? "secondary" : "outline"} size="sm" onClick={() => toggle("shelves")}>
            <Library /> Shelves
          </Button>
        ) : null}
        {canEdit ? (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={remove} disabled={deleting}>
            {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
          </Button>
        ) : null}
      </div>
      {open === "edit" ? <EditItemForm item={item} people={people} access={access} onDone={() => setOpen(null)} /> : null}
      {open === "share" ? <SharePanel itemId={item.id} inline={inline} /> : null}
      {open === "shelves" && shelves ? <ShelfPicker itemId={item.id} shelves={shelves} /> : null}
    </div>
  );
}
