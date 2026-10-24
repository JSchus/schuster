"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendJson } from "@/lib/sharing/client";

/** Uploads that never finished: clean them up (aborts the S3 upload, drops the row). */
export function StaleUploads({ uploads }: { uploads: { id: string; title: string; size: string; started: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cleanAll() {
    setBusy(true);
    try {
      for (const u of uploads) await sendJson(`/api/admin/uploads/${u.id}`, "DELETE");
      toast.success("Cleaned up");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!uploads.length) return <p className="text-sm text-muted-foreground">None. Every upload finished.</p>;
  return (
    <div className="grid gap-3">
      <ul className="grid gap-1 text-sm">
        {uploads.map((u) => (
          <li key={u.id} className="truncate text-muted-foreground">
            {u.title} · {u.size} · started {u.started}
          </li>
        ))}
      </ul>
      <div>
        <Button variant="outline" size="sm" onClick={cleanAll} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Clean up {uploads.length}
        </Button>
      </div>
    </div>
  );
}
