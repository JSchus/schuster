"use client";

import { Cloud, Cpu, Loader2, RefreshCw, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { SavesResponse } from "@/app/api/games/[id]/saves/route";
import { Button } from "@/components/ui/button";
import { publishWebGame } from "@/lib/games/publish";
import { PSX_BIOS_FILES, SYSTEM_IDS, SYSTEMS, type SystemId } from "@/lib/games/systems";
import { listSaves } from "./cloud-saves";

type Props = {
  itemId: string;
  system?: SystemId;
  isWeb: boolean;
  canEdit: boolean;
  isAdmin: boolean;
  /** PS1 only: whether the BIOS has been uploaded. */
  biosMissing: boolean;
};

/** Game extras on the item page: cloud save, console picker, republish, PS1 BIOS. */
export function GamePanel({ itemId, system, isWeb, canEdit, isAdmin, biosMissing }: Props) {
  return (
    <div className="grid max-w-md gap-3">
      {!isWeb && system ? <CloudSaveCard itemId={itemId} /> : null}
      {!isWeb && canEdit ? <SystemPicker itemId={itemId} system={system} /> : null}
      {isWeb && canEdit ? <RepublishButton itemId={itemId} /> : null}
      {system === "psx" && biosMissing ? <BiosCard isAdmin={isAdmin} /> : null}
    </div>
  );
}

function ago(ms: number) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function CloudSaveCard({ itemId }: { itemId: string }) {
  const [saves, setSaves] = useState<SavesResponse | null>(null);
  useEffect(() => {
    listSaves(itemId).then(setSaves, () => setSaves({}));
  }, [itemId]);
  if (!saves) return null;
  if (!saves.state && !saves.sram) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Cloud className="size-4" /> No cloud save yet. In the game, use “Save state” and it follows you to any device.
      </p>
    );
  }
  return (
    <section className="flex items-center gap-3 rounded-lg border p-3">
      {saves.screenshot ? (
        <img src={saves.screenshot.url} alt="" className="h-14 w-20 rounded object-cover [image-rendering:pixelated]" />
      ) : (
        <Cloud className="size-6 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">Cloud save</p>
        <p className="text-muted-foreground">
          {saves.state?.savedAt ? `Saved ${ago(saves.state.savedAt)}` : "In-game save"}
          {saves.sram?.savedAt && saves.state ? " · in-game save too" : ""}
        </p>
      </div>
      {saves.state ? (
        <Button asChild size="sm">
          <a href={`/play/${itemId}?resume=1`}>Resume</a>
        </Button>
      ) : null}
    </section>
  );
}

function SystemPicker({ itemId, system }: { itemId: string; system?: SystemId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <label className="flex items-center gap-2 text-sm">
      <Cpu className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">Console</span>
      <select
        disabled={busy}
        value={system ?? ""}
        onChange={async (e) => {
          setBusy(true);
          const res = await fetch(`/api/games/${itemId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ system: e.target.value }),
          });
          setBusy(false);
          if (res.ok) router.refresh();
          else toast.error("Couldn't change the console");
        }}
        className="h-9 rounded-md border bg-background px-2"
      >
        {!system ? <option value="">Choose…</option> : null}
        {SYSTEM_IDS.map((id) => (
          <option key={id} value={id}>
            {SYSTEMS[id].label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RepublishButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState<string | null>(null);
  return (
    <Button
      variant="outline"
      className="w-fit"
      disabled={progress !== null}
      onClick={async () => {
        setProgress("Downloading…");
        try {
          // The download route redirects to a presigned S3 URL (bytes skip Vercel).
          const zip = await (await fetch(`/api/items/${itemId}/download`)).blob();
          const { files } = await publishWebGame(itemId, zip, (d, t) => setProgress(`${d}/${t} files`));
          toast.success(`Published ${files} files`);
          router.refresh();
        } catch (err) {
          toast.error((err as Error).message);
        } finally {
          setProgress(null);
        }
      }}
    >
      {progress ? <Loader2 className="animate-spin" /> : <RefreshCw />} {progress ?? "Republish game"}
    </Button>
  );
}

function BiosCard({ isAdmin }: { isAdmin: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!isAdmin) {
    return <p className="text-sm text-muted-foreground">PlayStation games need a BIOS file. Ask the admin to add it.</p>;
  }
  return (
    <section className="grid gap-2 rounded-lg border p-3 text-sm">
      <p>
        PlayStation games need a PS1 BIOS (you must own it). Accepted names: {PSX_BIOS_FILES.join(", ")}.
      </p>
      <Button variant="outline" className="w-fit" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload />} Add PS1 BIOS
      </Button>
      <input
        ref={input}
        type="file"
        accept=".bin"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const start = await fetch("/api/games/bios", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ filename: file.name }),
            });
            const body = await start.json();
            if (!start.ok) throw new Error(body.error ?? "Couldn't start upload");
            const put = await fetch(body.uploadUrl, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": "application/octet-stream" },
            });
            if (!put.ok) throw new Error(`Upload failed (${put.status})`);
            toast.success("BIOS added");
            router.refresh();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
    </section>
  );
}
