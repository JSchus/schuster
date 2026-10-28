import { describe, expect, it } from "vitest";
import { cleanBirthday, cleanEmail, cleanPhone, parseVcards } from "@/lib/contacts/vcard";

const IPHONE = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "PRODID:-//Apple Inc.//iPhone OS 18.0//EN",
  "N:Schuster;Anna;Marie;;",
  "FN:Anna Marie Schuster",
  "ORG:Acme\\, Inc.;",
  "item1.EMAIL;type=INTERNET;type=pref:Anna@Example.com",
  "item1.X-ABLabel:_$!<Other>!$_",
  "EMAIL;type=INTERNET;type=HOME:anna.home@example.org",
  "TEL;type=CELL;type=VOICE;type=pref:(312) 555-0100",
  "TEL;type=HOME;type=VOICE:+1 312 555 0101",
  "BDAY;value=date:1604-04-12",
  "NOTE:Loves jazz\\nand books",
  "PHOTO;ENCODING=b;TYPE=JPEG:/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHB",
  " wcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy",
  "UID:ABCD-1234",
  "END:VCARD",
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:;;;;",
  "FN:",
  "ORG:Pizza Place;",
  "TEL;type=WORK:312-555-0199",
  "END:VCARD",
].join("\r\n");

const GOOGLE_V4 = `BEGIN:VCARD
VERSION:4.0
FN:Bob Builder
N:Builder;Bob;;;
EMAIL;TYPE=work:bob@builder.example
TEL;VALUE=uri;TYPE=cell:tel:+44-20-7946-0958
BDAY:--0612
UID:urn:uuid:9f2b9c3e-0000-4000-8000-000000000001
END:VCARD`;

const OUTLOOK_21 = [
  "BEGIN:VCARD",
  "VERSION:2.1",
  "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen",
  "FN;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:J=C3=BCrgen M=C3=BC=",
  "ller",
  "EMAIL;PREF;INTERNET:jm@example.de",
  "BDAY:19700101",
  "END:VCARD",
].join("\r\n");

describe("vCard import", () => {
  it("reads an iPhone export: names, groups, several emails and phones, Apple's no-year birthday", () => {
    const [anna, pizza] = parseVcards(IPHONE);
    expect(anna).toEqual({
      name: "Anna Marie Schuster",
      emails: ["anna@example.com", "anna.home@example.org"],
      phones: ["3125550100", "+13125550101"],
      birthday: "--04-12",
      org: "Acme, Inc.",
      note: "Loves jazz\nand books",
      uid: "ABCD-1234",
    });
    // No name at all: falls back to the company.
    expect(pizza).toMatchObject({ name: "Pizza Place", phones: ["3125550199"] });
  });

  it("reads Google's vCard 4 (tel: URIs, --MMDD birthdays, urn:uuid UIDs)", () => {
    expect(parseVcards(GOOGLE_V4)).toEqual([
      {
        name: "Bob Builder",
        emails: ["bob@builder.example"],
        phones: ["+442079460958"],
        birthday: "--06-12",
        org: null,
        note: null,
        uid: "9f2b9c3e-0000-4000-8000-000000000001",
      },
    ]);
  });

  it("reads Outlook's vCard 2.1 quoted-printable with soft line breaks", () => {
    const [c] = parseVcards(OUTLOOK_21);
    expect(c).toMatchObject({ name: "Jürgen Müller", emails: ["jm@example.de"], birthday: "1970-01-01" });
  });

  it("skips photos, empty cards and junk", () => {
    expect(parseVcards("hello\nBEGIN:VCARD\nVERSION:3.0\nEND:VCARD\nnot a card")).toEqual([]);
    expect(JSON.stringify(parseVcards(IPHONE))).not.toContain("9j/4AAQ");
  });

  it("cleans emails, phones and birthdays", () => {
    expect(cleanEmail("mailto:Me@X.COM ")).toBe("me@x.com");
    expect(cleanEmail("not an email")).toBe("");
    expect(cleanPhone("tel:+1 (312) 555-0100")).toBe("+13125550100");
    expect(cleanPhone("ext.")).toBe("");
    expect(cleanBirthday("1985-04-12T00:00:00Z")).toBe("1985-04-12");
    expect(cleanBirthday("--04-12")).toBe("--04-12");
    expect(cleanBirthday("April")).toBeNull();
  });
});
