import { describe, expect, it } from "vitest";
import { daysUntilBirthday, formatBirthday, isAppleMobile, mailtoHref, smsHref } from "@/lib/contacts/compose";

describe("message links", () => {
  it("builds sms: links the way iPhone and Android each expect", () => {
    expect(smsHref("+13125550100", "Hi & welcome: https://x.y/a?b=1", true)).toBe(
      "sms:+13125550100&body=Hi%20%26%20welcome%3A%20https%3A%2F%2Fx.y%2Fa%3Fb%3D1",
    );
    expect(smsHref("3125550100", "Hi", false)).toBe("sms:3125550100?body=Hi");
  });

  it("builds mailto: links with subject and body", () => {
    expect(mailtoHref("a@b.com", "You're invited", "Line 1\nLine 2")).toBe(
      "mailto:a@b.com?subject=You're%20invited&body=Line%201%0ALine%202",
    );
  });

  it("spots iPhones and iPads (including iPads that say they're Macs)", () => {
    expect(isAppleMobile("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 5)).toBe(true);
    expect(isAppleMobile("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", 0)).toBe(false);
    expect(isAppleMobile("Mozilla/5.0 (Linux; Android 14)")).toBe(false);
  });
});

describe("birthdays (Chicago time)", () => {
  // 2026-10-28 10:00 in Chicago.
  const now = new Date("2026-10-28T15:00:00Z");
  it("counts days to the next birthday, wrapping into next year", () => {
    expect(daysUntilBirthday("--10-28", now)).toBe(0);
    expect(daysUntilBirthday("1980-10-29", now)).toBe(1);
    expect(daysUntilBirthday("--10-27", now)).toBe(364);
    expect(daysUntilBirthday("nonsense", now)).toBeNull();
  });

  it("uses Chicago's date, not UTC's, late in the evening", () => {
    // 11:30 pm Oct 28 in Chicago is already Oct 29 in UTC.
    expect(daysUntilBirthday("--10-28", new Date("2026-10-29T04:30:00Z"))).toBe(0);
  });

  it("formats birthdays without the year", () => {
    expect(formatBirthday("1985-04-12")).toBe("April 12");
    expect(formatBirthday("--12-25")).toBe("December 25");
  });
});
