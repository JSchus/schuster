import { describe, expect, it } from "vitest";
import { isMostlyDark } from "@/lib/extract/image";

/** RGBA buffer of `n` pixels all set to one grey level. */
const solid = (level: number, n = 1000) => new Uint8ClampedArray(n * 4).fill(level).map((v, i) => (i % 4 === 3 ? 255 : v));

describe("isMostlyDark", () => {
  it("flags black and near-black frames", () => {
    expect(isMostlyDark(solid(0))).toBe(true);
    expect(isMostlyDark(solid(8))).toBe(true);
  });

  it("accepts normal frames", () => {
    expect(isMostlyDark(solid(128))).toBe(false);
    expect(isMostlyDark(solid(40))).toBe(false);
  });

  it("averages mixed frames (dark scene with a bright area)", () => {
    const px = solid(0, 1000);
    for (let i = 0; i < px.length / 2; i++) px[i] = i % 4 === 3 ? 255 : 200; // top half bright
    expect(isMostlyDark(px)).toBe(false);
  });

  it("treats an empty buffer as dark", () => {
    expect(isMostlyDark(new Uint8ClampedArray(0))).toBe(true);
  });
});
