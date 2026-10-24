import JSZip from "jszip";
import { systemForFile, type SystemId } from "@/lib/games/systems";
import { findEntry } from "@/lib/games/web";

export type GameInfo = { system?: SystemId; web?: { entry: string; status: "pending" } };

/** A ROM file, by extension. */
export function detectRom(name: string): GameInfo | undefined {
  const system = systemForFile(name);
  return system ? { system } : undefined;
}

/**
 * What's inside a .zip: a web game (has index.html), a zipped ROM (EmulatorJS
 * unzips it itself), or neither (undefined, stays a plain file).
 */
export async function detectZip(data: Blob | ArrayBuffer | Uint8Array): Promise<GameInfo | undefined> {
  const zip = await JSZip.loadAsync(data);
  const names = Object.keys(zip.files);
  const entry = findEntry(names);
  if (entry) return { web: { entry, status: "pending" } };
  for (const n of names) {
    const system = systemForFile(n);
    if (system) return { system };
  }
  return undefined;
}
