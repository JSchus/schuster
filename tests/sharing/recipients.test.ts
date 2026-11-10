import { describe, expect, it } from "vitest";
import { daysLabel, FOREVER, isForever, shareExpiry } from "@/lib/sharing/protocol";
import { rankRecipients } from "@/lib/sharing/recipients";

const at = (d: string) => new Date(d);

describe("rankRecipients", () => {
  it("puts the people you send to most at the top, then most recent, then A–Z", () => {
    const list = rankRecipients(
      [
        { name: "Zoe", emails: ["zoe@x.com"] },
        { name: "Aunt Mary", emails: ["Mary@X.com", "mary.work@x.com"] },
        { name: "Bob", emails: ["bob@x.com"] },
        { name: "Carl", emails: [] },
      ],
      [
        { email: "bob@x.com", count: 2, last: at("2026-11-01") },
        { email: "mary@x.com", count: 5, last: at("2026-10-01") },
        { email: "zoe@x.com", count: 2, last: at("2026-11-05") },
        { email: "friend@typed.com", count: 1, last: at("2026-11-09") },
      ],
    );
    expect(list.map((r) => `${r.name}|${r.email}|${r.sent}`)).toEqual([
      "Aunt Mary|mary@x.com|5",
      "Zoe|zoe@x.com|2",
      "Bob|bob@x.com|2",
      "friend@typed.com|friend@typed.com|1",
      "Aunt Mary|mary.work@x.com|0",
    ]);
  });

  it("lists never-sent contacts alphabetically", () => {
    const list = rankRecipients([{ name: "bea", emails: ["b@x.com"] }, { name: "Al", emails: ["a@x.com"] }], []);
    expect(list.map((r) => r.name)).toEqual(["Al", "bea"]);
  });
});

describe("forever links", () => {
  it("are stored far in the future and labelled", () => {
    expect(isForever(shareExpiry(null))).toBe(true);
    expect(shareExpiry(null)).toEqual(FOREVER);
    expect(isForever(shareExpiry(30))).toBe(false);
    expect(shareExpiry(7, 0).getTime()).toBe(7 * 86_400_000);
    expect([1, 7, 30, null].map(daysLabel)).toEqual(["1 day", "7 days", "30 days", "Forever"]);
  });
});
