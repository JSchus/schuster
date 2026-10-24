import { describe, expect, it } from "vitest";
import { decodeTime, encodeTime, percentOf, resumeTime } from "@/lib/player/position";

describe("playback position", () => {
  it("encodes and decodes seconds", () => {
    expect(encodeTime(123.456)).toBe("t:123.5");
    expect(encodeTime(-4)).toBe("t:0");
    expect(decodeTime("t:754.2")).toBe(754.2);
    expect(decodeTime("page:3")).toBeUndefined();
    expect(decodeTime(undefined)).toBeUndefined();
  });

  it("computes percent safely", () => {
    expect(percentOf(30, 120)).toBe(25);
    expect(percentOf(500, 120)).toBe(100);
    expect(percentOf(10, 0)).toBe(0);
    expect(percentOf(10, Number.NaN)).toBe(0);
  });

  it("resumes mid-way, restarts near the end or at the very start", () => {
    expect(resumeTime(600, 5400)).toBe(600);
    expect(resumeTime(5390, 5400)).toBe(0); // in the credits (last 5%)
    expect(resumeTime(110, 120)).toBe(0); // 2-min clip: last 12 s
    expect(resumeTime(95, 120)).toBe(95);
    expect(resumeTime(5.5, 12)).toBe(5.5); // tiny clip still resumes mid-way
    expect(resumeTime(170, 180)).toBe(0); // song: last 18 s
    expect(resumeTime(1, 5400)).toBe(0);
    expect(resumeTime(undefined, 5400)).toBe(0);
    expect(resumeTime(42, Number.NaN)).toBe(42); // duration not known yet
  });
});
