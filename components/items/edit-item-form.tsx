"use client";

import { ImageUp, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { CoverStartResponse } from "@/app/api/items/[id]/cover/route";
import { VisibilityFields } from "@/components/sharing/visibility-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toCoverJpeg } from "@/lib/extract/image";
import type { Person } from "@/lib/db/people";
import type { Visibility } from "@/lib/permissions";
import { sendJson } from "@/lib/sharing/client";
import type { ItemPatchBody } from "@/lib/sharing/protocol";

export type EditableItem = {
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  tags: string[];
  visibility: Visibility;
  addedBy: string | null;
};

type Props = { item: EditableItem; people: Person[]; access: string[]; onDone: () => void };

/** Edit an item's details, who can see it, and its cover image. */
export function EditItemForm({ item, people, access, onDone }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(item.title);
  const [author, setAuthor] = useState(item.author ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [tags, setTags] = useState(item.tags.join(", "));
  const [visibility, setVisibility] = useState(item.visibility);
  const [selected, setSelected] = useState(access);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const body: ItemPatchBody = {
        title,
        author: author.trim() || null,
        description: description.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        visibility,
        ...(visibility === "people" ? { people: selected } : {}),
      };
      await sendJson(`/api/items/${item.id}`, "PATCH", body);
      toast.success("Saved");
      router.refresh();
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="grid gap-4 rounded-lg border p-4">
      <div className="grid gap-1.5">
        <Label htmlFor="edit-title">Title</Label>
        <Input id="edit-title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={500} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-author">Author / artist</Label>
        <Input id="edit-author" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={500} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-description">Description</Label>
        <textarea
          id="edit-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={10_000}
          className="rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 md:text-sm"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="edit-tags">Tags</Label>
        <Input id="edit-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="family, holidays, 2024" />
        <p className="text-xs text-muted-foreground">Separate with commas.</p>
      </div>
      <VisibilityFields
        value={visibility}
        onChange={setVisibility}
        people={people}
        ownerId={item.addedBy}
        selected={selected}
        onSelected={setSelected}
        noun="item"
      />
      <CoverUpload itemId={item.id} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Replace the cover with a picture from this device (resized to a JPEG in the browser). */
function CoverUpload({ itemId }: { itemId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    setBusy(true);
    try {
      const jpeg = await toCoverJpeg(file);
      const { key, uploadUrl } = await sendJson<CoverStartResponse>(`/api/items/${itemId}/cover`, "POST");
      const put = await fetch(uploadUrl, { method: "PUT", body: jpeg, headers: { "Content-Type": "image/jpeg" } });
      if (!put.ok) throw new Error(`Cover upload failed (${put.status})`);
      await sendJson(`/api/items/${itemId}/cover`, "PUT", { key });
      toast.success("Cover replaced");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't use that picture");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">Cover</span>
      <div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="animate-spin" /> : <ImageUp />} Use a picture…
        </Button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
      />
    </div>
  );
}
