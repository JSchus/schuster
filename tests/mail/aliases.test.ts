import { describe, expect, it } from "vitest";
import { isLive, localProblem, normalizeLocal, randomLocal, reverseToken, splitAddress } from "@/lib/mail/aliases";

describe("alias names", () => {
  it("normalizes what people type", () => {
    expect(normalizeLocal("  Netflix Account! ")).toBe("netflix-account");
    expect(normalizeLocal("Café")).toBe("cafe");
    expect(normalizeLocal("me@gmail.com")).toBe("me");
    expect(normalizeLocal("a..b")).toBe("a.b");
    expect(normalizeLocal("x".repeat(60))).toHaveLength(40);
  });

  it("explains bad or reserved names", () => {
    expect(localProblem("netflix")).toBeNull();
    expect(localProblem("a.b-c")).toBeNull();
    expect(localProblem("a")).toMatch(/2–40/);
    expect(localProblem("-ab")).toMatch(/2–40/);
    expect(localProblem("postmaster")).toMatch(/reserved/);
    expect(localProblem("abuse")).toMatch(/reserved/);
    expect(localProblem("r-anything")).toMatch(/reserved/);
  });

  it("makes friendly random names and reply tokens", () => {
    expect(randomLocal(() => 0)).toBe("quiet-otter-10");
    for (let i = 0; i < 50; i++) expect(localProblem(randomLocal())).toBeNull();
    const t = reverseToken();
    expect(t).toMatch(/^[a-z2-7]{16}$/);
    expect(reverseToken()).not.toBe(t);
  });

  it("splits addresses and checks expiry", () => {
    expect(splitAddress("Net@M.Schuster.me")).toEqual({ local: "net", domain: "m.schuster.me" });
    const now = new Date("2026-01-01");
    const base = { active: true, pausedReason: null, expiresAt: null };
    expect(isLive(base, now)).toBe(true);
    expect(isLive({ ...base, active: false }, now)).toBe(false);
    expect(isLive({ ...base, pausedReason: "spam" }, now)).toBe(false);
    expect(isLive({ ...base, expiresAt: new Date("2025-12-31") }, now)).toBe(false);
    expect(isLive({ ...base, expiresAt: new Date("2026-01-02") }, now)).toBe(true);
  });
});
