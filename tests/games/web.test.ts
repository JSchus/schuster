import { describe, expect, it } from "vitest";
import { contentTypeFor, findEntry, safeGamePath } from "@/lib/games/web";

describe("safeGamePath", () => {
  it("accepts normal relative paths", () => {
    expect(safeGamePath("index.html")).toBe("index.html");
    expect(safeGamePath("My Game/assets/sprite 01.png")).toBe("My Game/assets/sprite 01.png");
  });

  it.each(["../evil.html", "a/../../b", "/etc/passwd", "a\\b.js", "a//b", "./x", "dir/", "", "x\u0000.js", "a".repeat(301)])(
    "rejects %j",
    (p) => expect(safeGamePath(p)).toBeUndefined(),
  );
});

describe("findEntry", () => {
  it("prefers a root index.html", () => {
    expect(findEntry(["index.html", "sub/index.html"])).toBe("index.html");
  });
  it("accepts a single top folder and ignores macOS junk", () => {
    expect(findEntry(["Game/", "Game/INDEX.HTML", "__MACOSX/Game/._INDEX.HTML"])).toBe("Game/INDEX.HTML");
  });
  it("gives up when ambiguous", () => {
    expect(findEntry(["a/index.html", "b/index.html"])).toBeUndefined();
    expect(findEntry(["game.js"])).toBeUndefined();
  });
});

describe("contentTypeFor", () => {
  it("serves what browsers need", () => {
    expect(contentTypeFor("Build/game.wasm")).toBe("application/wasm");
    expect(contentTypeFor("index.HTML")).toBe("text/html; charset=utf-8");
    expect(contentTypeFor("main.mjs")).toBe("text/javascript");
    expect(contentTypeFor("level.unknown")).toBe("application/octet-stream");
  });
});
