import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { detectRom, detectZip } from "@/lib/extract/game";
import { detectMediaType } from "@/lib/extract/detect";
import { systemForFile } from "@/lib/games/systems";

async function zipOf(files: Record<string, string>) {
  const z = new JSZip();
  for (const [p, c] of Object.entries(files)) z.file(p, c);
  return z.generateAsync({ type: "uint8array" });
}

describe("ROM detection", () => {
  it.each([
    ["Mario.nes", "nes"],
    ["Zelda.SFC", "snes"],
    ["tetris.gb", "gb"],
    ["pokemon.gbc", "gb"],
    ["metroid.gba", "gba"],
    ["mario64.z64", "n64"],
    ["sonic.md", "segaMD"],
    ["sonic.smd", "segaMD"],
    ["alex.sms", "segaMS"],
    ["shinobi.gg", "segaGG"],
    ["ff7.chd", "psx"],
    ["crash.pbp", "psx"],
  ])("%s → %s", (name, system) => {
    expect(systemForFile(name)).toBe(system);
    expect(detectRom(name)).toEqual({ system });
    expect(detectMediaType(name, "")).toBe("game");
  });

  it("leaves unknown files alone", () => {
    expect(systemForFile("game.bin")).toBeUndefined();
    expect(detectRom("notes.txt")).toBeUndefined();
  });
});

describe("zip detection", () => {
  it("finds a web game at the root or in one folder", async () => {
    expect(await detectZip(await zipOf({ "index.html": "<p>", "game.js": "" }))).toEqual({
      web: { entry: "index.html", status: "pending" },
    });
    expect(await detectZip(await zipOf({ "MyGame/index.html": "<p>", "MyGame/a.js": "", "__MACOSX/MyGame/._x": "" }))).toEqual({
      web: { entry: "MyGame/index.html", status: "pending" },
    });
  });

  it("treats a zipped ROM as a retro game", async () => {
    expect(await detectZip(await zipOf({ "readme.txt": "", "Sonic (USA).md": "rom" }))).toEqual({ system: "segaMD" });
  });

  it("ignores ordinary zips", async () => {
    expect(await detectZip(await zipOf({ "photos/a.jpg": "", "b.txt": "" }))).toBeUndefined();
    // index.html buried two levels deep across folders is not a game
    expect(await detectZip(await zipOf({ "a/index.html": "", "b/x.js": "" }))).toBeUndefined();
  });
});
