import { describe, expect, it } from "vitest";
import { planImport, type ExistingContact } from "@/lib/contacts/merge";
import type { ParsedContact } from "@/lib/contacts/vcard";

const parsed = (p: Partial<ParsedContact> & { name: string }): ParsedContact => ({
  emails: [],
  phones: [],
  birthday: null,
  org: null,
  note: null,
  uid: null,
  ...p,
});
const existing = (e: Partial<ExistingContact> & { id: string; name: string }): ExistingContact => ({
  emails: [],
  phones: [],
  birthday: null,
  org: null,
  note: null,
  sourceUid: null,
  ...e,
});

describe("re-importing contacts", () => {
  it("updates by UID, then by shared email or phone; inserts the rest", () => {
    const plan = planImport(
      [
        existing({ id: "1", name: "Anna", sourceUid: "U1", emails: ["a@x.com"], note: "keep me" }),
        existing({ id: "2", name: "Bob", phones: ["3125550100"] }),
      ],
      [
        parsed({ name: "Anna S", uid: "U1", emails: ["anna@new.com"] }),
        parsed({ name: "Robert", phones: ["3125550100"], birthday: "--06-12" }),
        parsed({ name: "Cara", emails: ["c@x.com"], uid: "U3" }),
      ],
    );
    expect(plan.updates).toEqual([
      expect.objectContaining({ id: "1", name: "Anna S", emails: ["anna@new.com", "a@x.com"], note: "keep me", sourceUid: "U1" }),
      expect.objectContaining({ id: "2", name: "Robert", birthday: "--06-12", phones: ["3125550100"] }),
    ]);
    expect(plan.inserts).toEqual([expect.objectContaining({ name: "Cara", sourceUid: "U3" })]);
  });

  it("importing the same file twice changes nothing new", () => {
    const file = [parsed({ name: "Dee", uid: "D", emails: ["d@x.com"] })];
    const first = planImport([], file);
    expect(first.inserts).toHaveLength(1);
    const second = planImport([existing({ id: "9", ...first.inserts[0]! })], file);
    expect(second.inserts).toHaveLength(0);
    expect(second.updates).toHaveLength(1);
  });

  it("merges duplicates inside one file instead of inserting twice", () => {
    const plan = planImport(
      [],
      [parsed({ name: "Eve", emails: ["e@x.com"] }), parsed({ name: "Eve Work", emails: ["e@x.com"], phones: ["123"] })],
    );
    expect(plan.inserts).toEqual([expect.objectContaining({ name: "Eve Work", emails: ["e@x.com"], phones: ["123"] })]);
  });
});
