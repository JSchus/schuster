"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type { CoverStartResponse } from "@/app/api/items/[id]/cover/route";
import { Button } from "@/components/ui/button";
import { makeCover } from "@/lib/extract";
import type { MediaType } from "@/lib/media-types";

type Props = { itemId: string; type: MediaType; mime: string; hasCover: boolean };

/**
 * (Re)generate an item's cover in the browser from the stored file: a video
 * frame, the EPUB's cover art, or the photo itself. The file is read through
 * a presigned S3 URL and the JPEG goes straight back to S3.
 */
export function MakeCoverButton({ itemId, type, mime, hasCover }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const start = await fetch(`/api/items/${itemId}/cover`, { method: "POST" });
      if (!start.ok) throw new Error(`Couldn't start (${start.status})`);
      const { key, uploadUrl, sourceUrl } = (await start.json()) as CoverStartResponse;

      const { cover, coverStatus } = await makeCover(type, mime, sourceUrl);
      if (!cover) {
        toast.error(coverStatus === "none" ? "This file has no cover image." : "Couldn't make a cover in this browser.");
        return;
      }

      const put = await fetch(uploadUrl, { method: "PUT", body: cover, headers: { "Content-Type": "image/jpeg" } });
      if (!put.ok) throw new Error(`Cover upload failed (${put.status})`);

      const confirm = await fetch(`/api/items/${itemId}/cover`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });
      if (!confirm.ok) throw new Error(`Couldn't save cover (${confirm.status})`);

      toast.success("Cover updated");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message || "Couldn't make a cover");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="lg" onClick={run} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
      {hasCover ? "Redo cover" : "Make cover"}
    </Button>
  );
}
