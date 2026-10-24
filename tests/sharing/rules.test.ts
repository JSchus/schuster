import { describe, expect, it } from "vitest";
import { canSignIn, roleIsStale, ROLE_TTL } from "@/lib/auth/allowlist";
import { canContribute, canEdit, canView } from "@/lib/permissions";
import { inlineKind, shareUrlLifetime } from "@/lib/sharing/open";
import { hashPassword, isTokenShape, randomToken, shareUnlockValue, verifyPassword } from "@/lib/sharing/tokens";

const admin = { id: "a", role: "admin" } as const;
const member = { id: "m", role: "member" } as const;
const viewer = { id: "v", role: "viewer" } as const;

describe("roles", () => {
  it("lets admins and members contribute, not viewers", () => {
    expect([admin, member, viewer].map(canContribute)).toEqual([true, true, false]);
    expect(canContribute(undefined)).toBe(false);
  });

  it("lets the owner (if still a member) or an admin edit", () => {
    expect(canEdit(member, "m")).toBe(true);
    expect(canEdit(member, "someone")).toBe(false);
    expect(canEdit(admin, "someone")).toBe(true);
    expect(canEdit({ id: "v", role: "viewer" }, "v")).toBe(false); // demoted uploader
    expect(canEdit(null, "m")).toBe(false);
  });

  it("applies visibility like the SQL filter does", () => {
    const item = (visibility: "everyone" | "people" | "private") => ({ ownerId: "m", visibility });
    expect(canView(viewer, item("everyone"), false)).toBe(true);
    expect(canView(viewer, item("private"), false)).toBe(false);
    expect(canView(viewer, item("people"), false)).toBe(false);
    expect(canView(viewer, item("people"), true)).toBe(true);
    expect(canView(member, item("private"), false)).toBe(true); // owner
    expect(canView(admin, item("private"), false)).toBe(true);
  });
});

describe("sign-up gate", () => {
  const base = { email: "x@y.com", userExists: false, adminExists: true, approved: false, allowlist: new Set<string>() };
  it("needs an approval, the env allowlist, an account, or an empty instance", () => {
    expect(canSignIn(base)).toBe(false);
    expect(canSignIn({ ...base, approved: true })).toBe(true);
    expect(canSignIn({ ...base, allowlist: new Set(["x@y.com"]) })).toBe(true);
    expect(canSignIn({ ...base, userExists: true })).toBe(true);
    expect(canSignIn({ ...base, adminExists: false })).toBe(true);
  });

  it("re-reads the role after the TTL", () => {
    const now = 1_000_000_000;
    expect(roleIsStale(undefined, now)).toBe(true);
    expect(roleIsStale(now - ROLE_TTL + 1, now)).toBe(false);
    expect(roleIsStale(now - ROLE_TTL - 1, now)).toBe(true);
  });
});

describe("link secrets", () => {
  it("makes long, URL-safe, unique tokens", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(randomToken()).not.toBe(a);
    expect(isTokenShape(a)).toBe(true);
    expect(isTokenShape("../etc")).toBe(false);
    expect(isTokenShape("short")).toBe(false);
  });

  it("hashes passwords with a salt and verifies them", async () => {
    const h = await hashPassword("open sesame");
    expect(h).toMatch(/^scrypt\$/);
    expect(await hashPassword("open sesame")).not.toBe(h);
    expect(await verifyPassword("open sesame", h)).toBe(true);
    expect(await verifyPassword("open sesame!", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  it("binds the unlock cookie to the token, the password and the secret", () => {
    const v = shareUnlockValue("s", "tok", "hash1");
    expect(shareUnlockValue("s", "tok", "hash1")).toBe(v);
    expect(shareUnlockValue("s", "tok2", "hash1")).not.toBe(v);
    expect(shareUnlockValue("s", "tok", "hash2")).not.toBe(v);
    expect(shareUnlockValue("t", "tok", "hash1")).not.toBe(v);
  });
});

describe("share pages", () => {
  it("plays video/audio and shows images inline; everything else downloads", () => {
    expect(inlineKind({ type: "video", mime: "video/mp4" })).toBe("video");
    expect(inlineKind({ type: "audio", mime: "audio/mpeg" })).toBe("audio");
    expect(inlineKind({ type: "file", mime: "image/jpeg" })).toBe("image");
    expect(inlineKind({ type: "book", mime: "application/pdf" })).toBeNull();
  });

  it("never signs URLs past the link's expiry (or longer than 4 h)", () => {
    const now = 0;
    expect(shareUrlLifetime(new Date(10 * 86_400_000), now)).toBe(4 * 3600);
    expect(shareUrlLifetime(new Date(600_000), now)).toBe(600);
    expect(shareUrlLifetime(new Date(1000), now)).toBe(60);
  });
});
