"use client";

import type { SavesResponse } from "@/app/api/games/[id]/saves/route";
import type { SaveKind } from "@/lib/storage";

/** This user's cloud saves for a game (fresh presigned URLs). */
export async function listSaves(itemId: string): Promise<SavesResponse> {
  const res = await fetch(`/api/games/${itemId}/saves`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Couldn't load cloud saves (${res.status})`);
  return res.json();
}

/** Upload one save slot straight to S3 via a presigned PUT. */
export async function uploadSave(itemId: string, kind: SaveKind, bytes: Uint8Array): Promise<void> {
  const start = await fetch(`/api/games/${itemId}/saves`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind }),
  });
  if (!start.ok) throw new Error(`Couldn't start upload (${start.status})`);
  const { uploadUrl, contentType } = await start.json();
  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: bytes as BodyInit,
    headers: { "Content-Type": contentType },
    keepalive: bytes.byteLength < 60_000, // lets small in-game saves finish while the tab closes
  });
  if (!put.ok) throw new Error(`Save upload failed (${put.status})`);
}

export async function downloadSave(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't download save (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Byte-for-byte comparison, to skip uploading unchanged in-game saves. */
export function sameBytes(a: Uint8Array | null | undefined, b: Uint8Array | null | undefined): boolean {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}
