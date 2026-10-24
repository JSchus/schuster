import { describe, expect, it } from "vitest";
import {
  clampPercent,
  decodePdfPosition,
  encodePdfPosition,
  isReadable,
  pickResume,
  type Spot,
} from "@/lib/reader/progress";

const spot = (position: string, percent: number, at: number): Spot => ({ position, percent, at });

describe("pickResume", () => {
  it("returns nothing for a new book", () => {
    expect(pickResume(null, null)).toEqual({});
  });

  it("uses whichever copy exists", () => {
    const s = spot("a", 10, 1);
    expect(pickResume(s, null)).toEqual({ start: s });
    expect(pickResume(undefined, s)).toEqual({ start: s });
  });

  it("prefers this device when it is newer (e.g. read offline)", () => {
    const local = spot("local", 30, 200);
    expect(pickResume(local, spot("server", 20, 100))).toEqual({ start: local });
  });

  it("jumps to a newer spot from another device and offers going back", () => {
    const local = spot("cfi-12", 12, 100);
    const server = spot("cfi-47", 47, 200);
    expect(pickResume(local, server)).toEqual({ start: server, previous: local });
  });

  it("doesn't offer going back for tiny differences or the same spot", () => {
    expect(pickResume(spot("a", 40, 100), spot("b", 41, 200))).toEqual({ start: spot("b", 41, 200) });
    expect(pickResume(spot("a", 40, 100), spot("a", 40, 200))).toEqual({ start: spot("a", 40, 200) });
  });

  it("treats equal timestamps as already in sync", () => {
    expect(pickResume(spot("a", 10, 100), spot("b", 50, 100))).toEqual({ start: spot("b", 50, 100) });
  });
});

describe("helpers", () => {
  it("encodes and decodes PDF pages", () => {
    expect(encodePdfPosition(4)).toBe("page:4");
    expect(encodePdfPosition(0)).toBe("page:1");
    expect(decodePdfPosition("page:12")).toBe(12);
    expect(decodePdfPosition("epubcfi(/6/4!/4)")).toBeUndefined();
    expect(decodePdfPosition(undefined)).toBeUndefined();
  });

  it("clamps percentages", () => {
    expect(clampPercent(-3)).toBe(0);
    expect(clampPercent(47.6)).toBe(48);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it("knows which formats the reader opens", () => {
    expect(isReadable("application/epub+zip")).toBe(true);
    expect(isReadable("application/pdf")).toBe(true);
    expect(isReadable("application/x-mobipocket-ebook")).toBe(false);
  });
});
