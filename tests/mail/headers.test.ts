import { describe, expect, it } from "vitest";
import { decodeWords, formatAddress, getHeader, parseAddress, parseAddressList, parseMessage, rewriteMessage } from "@/lib/mail/headers";

const bytes = (s: string) => new Uint8Array(Buffer.from(s, "latin1"));
const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

const RAW = [
  'From: "Ann Smith" <Ann@Example.com>',
  "To: netflix@m.schuster.me",
  "Subject: Hello",
  "  there",
  "DKIM-Signature: v=1; a=rsa-sha256;",
  "\tb=abc",
  "Content-Type: multipart/alternative; boundary=xyz",
  "",
  "--xyz",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Caf\xc3\xa9 body",
  "--xyz--",
  "",
].join("\r\n");

describe("mail headers", () => {
  it("parses folded headers and keeps the line ending", () => {
    const p = parseMessage(bytes(RAW));
    expect(p.eol).toBe("\r\n");
    expect(getHeader(p, "subject")).toBe("Hello there");
    expect(getHeader(p, "DKIM-Signature")).toBe("v=1; a=rsa-sha256; b=abc");
    expect(text(p.body).startsWith("--xyz\r\n")).toBe(true);
  });

  it("handles bare LF messages and messages with no body", () => {
    expect(parseMessage(bytes("Subject: a\n\nbody\n")).eol).toBe("\n");
    expect(text(parseMessage(bytes("Subject: a")).body)).toBe("");
  });

  it("rewrites headers without touching a single body byte", () => {
    const out = rewriteMessage(bytes(RAW), { remove: ["dkim-signature"], set: [["From", "x@m.schuster.me"], ["Reply-To", "r-abc@m.schuster.me"]] });
    const s = text(out);
    expect(s).not.toMatch(/DKIM-Signature/i);
    expect(s.startsWith("From: x@m.schuster.me\r\nReply-To: r-abc@m.schuster.me\r\n")).toBe(true);
    expect(s.match(/^From:/gm)).toHaveLength(1);
    expect(s).toContain("Subject: Hello\r\n  there\r\n");
    expect(s.endsWith(RAW.slice(RAW.indexOf("\r\n\r\n") + 4))).toBe(true);
    expect(Buffer.from(parseMessage(out).body).equals(Buffer.from(parseMessage(bytes(RAW)).body))).toBe(true);
  });

  it("can keep only a whitelist of headers", () => {
    const s = text(rewriteMessage(bytes(RAW), { keepOnly: ["subject", "content-type"], set: [["From", "a@b.c"]] }));
    expect(s).not.toMatch(/Ann|DKIM|^To:/m);
    expect(s).toMatch(/^Subject:/m);
    expect(s).toMatch(/^Content-Type: multipart/m);
  });

  it("parses addresses", () => {
    expect(parseAddress('"Ann Smith" <Ann@Example.com>')).toEqual({ name: "Ann Smith", address: "ann@example.com" });
    expect(parseAddress("Bob <bob@x.org>")).toEqual({ name: "Bob", address: "bob@x.org" });
    expect(parseAddress("bob@x.org")).toEqual({ name: "", address: "bob@x.org" });
    expect(parseAddress("nobody")).toBeNull();
    expect(parseAddressList('"Smith, Ann" <a@x.com>, b@y.com').map((a) => a.address)).toEqual(["a@x.com", "b@y.com"]);
  });

  it("formats display names safely", () => {
    expect(formatAddress("", "a@b.c")).toBe("a@b.c");
    expect(formatAddress('Ann "A" via Schuster Media', "a@b.c")).toBe('"Ann \\"A\\" via Schuster Media" <a@b.c>');
    expect(formatAddress("Evil\r\nBcc: x@y.z", "a@b.c")).not.toMatch(/[\r\n]/);
    const enc = formatAddress("José", "a@b.c");
    expect(enc).toMatch(/^=\?UTF-8\?B\?/);
    expect(decodeWords(enc.split(" <")[0]!)).toBe("José");
  });

  it("decodes encoded words", () => {
    expect(decodeWords("=?utf-8?Q?Caf=C3=A9_time?=")).toBe("Café time");
    expect(decodeWords("plain")).toBe("plain");
  });
});
