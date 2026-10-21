/** S3 multipart limits: parts ≥ 5 MiB (except the last), ≤ 10,000 parts, ≤ 5 TiB object. */
export const MIB = 1024 * 1024;
export const MIN_PART_SIZE = 5 * MIB;
export const DEFAULT_PART_SIZE = 10 * MIB;
export const MAX_PARTS = 10_000;
export const MAX_OBJECT_SIZE = 5 * 1024 * 1024 * MIB;

export type PartPlan = { partSize: number; partCount: number };

/**
 * Choose a part size for `size` bytes: 10 MiB by default, grown (in whole
 * MiB) only as needed to stay within 10,000 parts.
 */
export function planParts(size: number): PartPlan {
  if (!Number.isFinite(size) || size < 0) throw new RangeError("size must be ≥ 0");
  if (size > MAX_OBJECT_SIZE) throw new RangeError("file exceeds the 5 TiB S3 object limit");
  const needed = Math.ceil(size / MAX_PARTS);
  const partSize = Math.max(DEFAULT_PART_SIZE, Math.ceil(needed / MIB) * MIB);
  const partCount = Math.max(1, Math.ceil(size / partSize));
  return { partSize, partCount };
}

/** Byte range [start, end) of a 1-based part. */
export function partRange(partNumber: number, plan: PartPlan, size: number): [number, number] {
  const start = (partNumber - 1) * plan.partSize;
  return [start, Math.min(start + plan.partSize, size)];
}
