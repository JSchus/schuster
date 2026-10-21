import { describe, expect, it } from "vitest";
import { MAX_PARTS, MIB, MIN_PART_SIZE, partRange, planParts } from "@/lib/upload/plan";

describe("planParts", () => {
  it("uses one (empty) part for a zero-byte file", () => {
    expect(planParts(0)).toEqual({ partSize: 10 * MIB, partCount: 1 });
  });

  it("uses a single part for small files", () => {
    expect(planParts(3 * MIB)).toEqual({ partSize: 10 * MIB, partCount: 1 });
  });

  it("splits into 10 MiB parts by default", () => {
    expect(planParts(25 * MIB)).toEqual({ partSize: 10 * MIB, partCount: 3 });
  });

  it("grows the part size to stay within 10,000 parts", () => {
    const size = 50 * 1024 * MIB; // 50 GiB
    const plan = planParts(size);
    expect(plan.partCount).toBeLessThanOrEqual(MAX_PARTS);
    expect(plan.partSize % MIB).toBe(0);
    expect(plan.partSize).toBeGreaterThanOrEqual(MIN_PART_SIZE);
    expect(plan.partSize * plan.partCount).toBeGreaterThanOrEqual(size);
  });

  it("keeps exactly 10,000 parts at the boundary", () => {
    expect(planParts(10 * MIB * MAX_PARTS).partCount).toBe(MAX_PARTS);
    expect(planParts(10 * MIB * MAX_PARTS + 1).partCount).toBeLessThanOrEqual(MAX_PARTS);
  });

  it("rejects invalid or oversize input", () => {
    expect(() => planParts(-1)).toThrow(RangeError);
    expect(() => planParts(6 * 1024 ** 4)).toThrow(/5 TiB/);
  });
});

describe("partRange", () => {
  it("returns the byte range for each part, clamped at the end", () => {
    const plan = planParts(25 * MIB);
    expect(partRange(1, plan, 25 * MIB)).toEqual([0, 10 * MIB]);
    expect(partRange(3, plan, 25 * MIB)).toEqual([20 * MIB, 25 * MIB]);
  });
});
