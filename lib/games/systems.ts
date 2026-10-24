/**
 * Consoles the retro shelf supports. `core` is the EmulatorJS core we ship
 * (see scripts/copy-emulatorjs.mjs); `id` doubles as the EmulatorJS control
 * scheme. Shared by the upload detector, the API and the player.
 */
export const SYSTEMS = {
  nes: { label: "NES", core: "fceumm", exts: ["nes", "fds", "unf", "unif"] },
  snes: { label: "SNES", core: "snes9x", exts: ["sfc", "smc"] },
  gb: { label: "Game Boy", core: "gambatte", exts: ["gb", "gbc"] },
  gba: { label: "Game Boy Advance", core: "mgba", exts: ["gba"] },
  n64: { label: "Nintendo 64", core: "mupen64plus_next", exts: ["n64", "z64", "v64"] },
  segaMD: { label: "Sega Genesis", core: "genesis_plus_gx", exts: ["md", "gen", "smd"] },
  segaMS: { label: "Master System", core: "genesis_plus_gx", exts: ["sms"] },
  segaGG: { label: "Game Gear", core: "genesis_plus_gx", exts: ["gg"] },
  psx: { label: "PlayStation", core: "pcsx_rearmed", exts: ["chd", "pbp", "cue"] },
} as const;

export type SystemId = keyof typeof SYSTEMS;
export const SYSTEM_IDS = Object.keys(SYSTEMS) as SystemId[];

export function isSystemId(v: unknown): v is SystemId {
  return typeof v === "string" && v in SYSTEMS;
}

const extension = (name: string) => name.toLowerCase().split(".").pop() ?? "";

/** Console for a ROM filename, by extension. */
export function systemForFile(name: string): SystemId | undefined {
  const ext = extension(name);
  return SYSTEM_IDS.find((id) => (SYSTEMS[id].exts as readonly string[]).includes(ext));
}

/** Known PS1 BIOS filenames (pcsx_rearmed looks them up by name). */
export const PSX_BIOS_FILES = ["scph5500.bin", "scph5501.bin", "scph5502.bin", "scph1001.bin", "scph7001.bin"] as const;
