import { describe, expect, it } from "vitest";
import { isValidSlug, normalizeSlug, randomSlug, validateTarget } from "@/lib/links/rules";

describe("short-link words", () => {
  it("normalizes to lower-case words with dashes", () => {
    expect(normalizeSlug("  My Recital!! 2026 ")).toBe("my-recital-2026");
    expect(normalizeSlug("Café Olé")).toBe("cafe-ole");
    expect(normalizeSlug("---")).toBe("");
  });

  it("accepts 2–64 letters, numbers and inner dashes", () => {
    expect(isValidSlug("go")).toBe(true);
    expect(isValidSlug("my-recital")).toBe(true);
    expect(isValidSlug("a")).toBe(false);
    expect(isValidSlug("-x")).toBe(false);
    expect(isValidSlug("x-")).toBe(false);
    expect(isValidSlug("Upper")).toBe(false);
    expect(isValidSlug("a".repeat(65))).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
  });

  it("makes random words without look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const s = randomSlug();
      expect(s).toMatch(/^[a-km-np-z2-9]{6}$/);
      expect(isValidSlug(s)).toBe(true);
    }
  });
});

describe("destinations", () => {
  const ok = (raw: string) => {
    const r = validateTarget(raw, "schuster.me");
    if ("error" in r) throw new Error(r.error);
    return r.url;
  };
  const bad = (raw: string) => "error" in validateTarget(raw, "schuster.me");

  it("accepts web addresses, adding https:// when missing", () => {
    expect(ok("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(ok("example.com/tickets")).toBe("https://example.com/tickets");
    expect(ok("http://example.org")).toBe("http://example.org/");
    expect(ok("https://schuster.me/s/abc")).toBe("https://schuster.me/s/abc");
  });

  it("refuses scripts, other schemes, passwords in URLs and loops", () => {
    expect(bad("javascript:alert(1)")).toBe(true);
    expect(bad("data:text/html,hi")).toBe(true);
    expect(bad("ftp://example.com")).toBe(true);
    expect(bad("https://user:pw@example.com")).toBe(true);
    expect(bad("https://schuster.me/go/other")).toBe(true);
    expect(bad("https://www.schuster.me/go/other")).toBe(true);
    expect(bad("nothing")).toBe(true);
    expect(bad("")).toBe(true);
    expect(bad(`https://example.com/${"a".repeat(2050)}`)).toBe(true);
  });
});
