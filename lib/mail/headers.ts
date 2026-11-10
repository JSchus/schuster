/**
 * Just enough RFC 5322 to forward a message: split the header block from
 * the body, read and rewrite a few headers, and leave every MIME byte of
 * the body untouched. Headers are handled as latin1 so non-ASCII bytes
 * survive the round trip exactly.
 */

export type Header = { name: string; /** Raw value, still folded, without the trailing line break. */ raw: string };
export type Parsed = { headers: Header[]; body: Uint8Array; eol: "\r\n" | "\n" };

const latin1 = (b: Uint8Array) => Buffer.from(b.buffer, b.byteOffset, b.byteLength).toString("latin1");

/** Split a raw message at the first blank line. A message with no body keeps an empty one. */
export function parseMessage(raw: Uint8Array): Parsed {
  const buf = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
  let sep = buf.indexOf("\r\n\r\n");
  let eol: Parsed["eol"] = "\r\n";
  let sepLen = 4;
  const lf = buf.indexOf("\n\n");
  if (sep === -1 || (lf !== -1 && lf < sep)) {
    sep = lf;
    eol = "\n";
    sepLen = 2;
  }
  const headerText = sep === -1 ? latin1(raw) : buf.subarray(0, sep).toString("latin1");
  const body = sep === -1 ? new Uint8Array() : new Uint8Array(buf.subarray(sep + sepLen));
  const headers: Header[] = [];
  for (const line of headerText.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && headers.length) headers[headers.length - 1]!.raw += `${eol}${line}`;
    else {
      const i = line.indexOf(":");
      if (i > 0) headers.push({ name: line.slice(0, i), raw: line.slice(i + 1).replace(/^ /, "") });
    }
  }
  return { headers, body, eol };
}

/** First value of a header, unfolded and trimmed (still latin1/encoded-words as sent). */
export function getHeader(p: Parsed, name: string): string | undefined {
  const h = p.headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.raw.replace(/\r?\n[ \t]+/g, " ").trim();
}

/**
 * Rebuild the message: drop `remove` headers, replace any header named in
 * `set` (set values go first, in order), keep the rest and the body as-is.
 */
export function rewriteMessage(
  raw: Uint8Array,
  change: { remove?: string[]; set?: [string, string][]; /** Keep only these headers (plus `set`). */ keepOnly?: string[] },
): Uint8Array {
  const p = parseMessage(raw);
  const drop = new Set([...(change.remove ?? []), ...(change.set ?? []).map(([n]) => n)].map((n) => n.toLowerCase()));
  const keep = change.keepOnly ? new Set(change.keepOnly.map((n) => n.toLowerCase())) : null;
  const lines = [
    ...(change.set ?? []).map(([n, v]) => `${n}: ${v}`),
    ...p.headers
      .filter((h) => !drop.has(h.name.toLowerCase()) && (!keep || keep.has(h.name.toLowerCase())))
      .map((h) => `${h.name}: ${h.raw}`),
  ];
  const head = Buffer.from(lines.join(p.eol) + p.eol + p.eol, "latin1");
  const out = new Uint8Array(head.length + p.body.length);
  out.set(head, 0);
  out.set(p.body, head.length);
  return out;
}

export type Address = { name: string; address: string };

/** `"Ann Smith" <ann@x.com>`, `Ann <ann@x.com>` or `ann@x.com` → { name, address (lower-case) }. */
export function parseAddress(value: string | undefined): Address | null {
  if (!value) return null;
  const m = /^\s*(?:"?((?:[^"\\]|\\.)*?)"?\s*)?<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(value);
  if (m) return { name: (m[1] ?? "").replace(/\\(.)/g, "$1").trim(), address: m[2]!.toLowerCase() };
  const bare = /([^\s<>,;"]+@[^\s<>,;"]+)/.exec(value);
  return bare ? { name: "", address: bare[1]!.toLowerCase() } : null;
}

/** Every address in a To/Cc style list. */
export function parseAddressList(value: string | undefined): Address[] {
  if (!value) return [];
  return (value.match(/(?:"(?:[^"\\]|\\.)*"\s*)?[^,"]*<[^>]+>|[^\s,<>"]+@[^\s,<>"]+/g) ?? [])
    .map((part) => parseAddress(part))
    .filter((a): a is Address => !!a);
}

/** A display name made safe for a header: RFC 2047 for non-ASCII, quoted otherwise. */
export function formatAddress(name: string, address: string): string {
  const clean = name.replace(/[\r\n]+/g, " ").trim();
  if (!clean) return address;
  if (/[^\x20-\x7e]/.test(clean)) return `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?= <${address}>`;
  return `"${clean.replace(/(["\\])/g, "\\$1")}" <${address}>`;
}

/** Decode RFC 2047 encoded words (=?utf-8?B?…?= / ?Q?) for display. */
export function decodeWords(value: string): string {
  return value.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_, charset: string, enc: string, text: string) => {
    try {
      const bytes =
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : Buffer.from(text.replace(/_/g, " ").replace(/=([0-9A-F]{2})/gi, (_m, h: string) => String.fromCharCode(parseInt(h, 16))), "latin1");
      return new TextDecoder(charset.toLowerCase()).decode(bytes);
    } catch {
      return text;
    }
  });
}
