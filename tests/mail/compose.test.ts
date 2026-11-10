import { describe, expect, it } from "vitest";
import { composeMessage, encodeSubject } from "@/lib/mail/compose";
import { getHeader, parseMessage } from "@/lib/mail/headers";

const text = (b: Uint8Array) => Buffer.from(b).toString("latin1");

describe("composeMessage", () => {
  const raw = composeMessage({ from: "shop@m.schuster.me", to: "store@example.com", subject: "Order #12", text: "Hi,\nWhere is my order? Café ☕\n", domain: "m.schuster.me", now: new Date("2026-11-10T15:00:00Z") });
  const p = parseMessage(raw);

  it("writes the headers an email needs", () => {
    expect(getHeader(p, "From")).toBe("shop@m.schuster.me");
    expect(getHeader(p, "To")).toBe("store@example.com");
    expect(getHeader(p, "Subject")).toBe("Order #12");
    expect(getHeader(p, "Date")).toBe("Tue, 10 Nov 2026 15:00:00 GMT");
    expect(getHeader(p, "Message-ID")).toMatch(/^<[0-9a-f-]{36}@m\.schuster\.me>$/);
    expect(getHeader(p, "Content-Transfer-Encoding")).toBe("base64");
    expect(p.eol).toBe("\r\n");
  });

  it("keeps any text exactly, with CRLF line endings", () => {
    const body = Buffer.from(text(p.body).replace(/\r\n/g, ""), "base64").toString("utf8");
    expect(body).toBe("Hi,\r\nWhere is my order? Café ☕\r\n");
    expect(text(p.body).split("\r\n").every((l) => l.length <= 76)).toBe(true);
  });

  it("can't be tricked into adding headers", () => {
    const evil = parseMessage(composeMessage({ from: "a@m.schuster.me", to: "b@x.com\r\nBcc: victim@x.com", subject: "Hi\r\nBcc: victim@x.com", text: "x", domain: "m.schuster.me" }));
    expect(getHeader(evil, "Bcc")).toBeUndefined();
    expect(evil.headers.filter((h) => h.name === "To")).toHaveLength(1);
  });

  it("encodes non-ASCII subjects", () => {
    expect(encodeSubject("Fête 🎉")).toMatch(/^=\?UTF-8\?B\?/);
    expect(encodeSubject("  Plain\nsubject ")).toBe("Plain subject");
  });
});
