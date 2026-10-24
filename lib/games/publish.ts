"use client";

import JSZip from "jszip";
import type { WebFilesResponse } from "@/app/api/games/[id]/web/files/route";
import { pool } from "@/lib/upload/uploader";
import { findEntry, MAX_WEB_BYTES, MAX_WEB_FILES, safeGamePath } from "./web";

const BATCH = 100;
const PARALLEL = 6;

/**
 * Unzip a web game in the browser and upload each file straight to
 * webgames/{id}/ in S3 (presigned PUTs with the right Content-Type), then
 * mark it playable. Re-running it overwrites the same keys ("Republish").
 */
export async function publishWebGame(
  itemId: string,
  zipData: Blob | ArrayBuffer,
  onProgress?: (done: number, total: number) => void,
): Promise<{ entry: string; files: number }> {
  const zip = await JSZip.loadAsync(zipData);
  const files = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith("__MACOSX/"));
  const entry = findEntry(files.map((f) => f.name));
  if (!entry) throw new Error("No index.html found in this zip");
  if (files.length > MAX_WEB_FILES) throw new Error(`Too many files (${files.length}; max ${MAX_WEB_FILES})`);
  const bad = files.find((f) => !safeGamePath(f.name));
  if (bad) throw new Error(`Unsafe file path in zip: ${bad.name}`);
  let done = 0;
  let bytes = 0;
  onProgress?.(0, files.length);
  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const res = await fetch(`/api/games/${itemId}/web/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths: batch.map((f) => f.name) }),
    });
    if (!res.ok) throw new Error(`Couldn't prepare game files (${res.status})`);
    const { files: signed } = (await res.json()) as WebFilesResponse;
    const byPath = new Map(signed.map((s) => [s.path, s]));
    await pool(batch, PARALLEL, async (f) => {
      const target = byPath.get(f.name)!;
      const blob = await f.async("blob");
      bytes += blob.size;
      if (bytes > MAX_WEB_BYTES) throw new Error("Game is larger than 1 GB unzipped");
      const put = await fetch(target.url, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": target.contentType },
      });
      if (!put.ok) throw new Error(`Upload failed for ${f.name} (${put.status})`);
      onProgress?.(++done, files.length);
    });
  }

  const publish = await fetch(`/api/games/${itemId}/web/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entry, files: files.length }),
  });
  if (!publish.ok) throw new Error(`Couldn't publish the game (${publish.status})`);
  return { entry, files: files.length };
}
