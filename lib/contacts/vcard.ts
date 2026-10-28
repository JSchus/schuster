/**
 * Minimal vCard (.vcf) reader for contacts exported from iPhone, iCloud,
 * Google or Outlook (vCard 2.1, 3.0 and 4.0). Runs in the browser, so the
 * file never leaves the device until the person chooses who to import.
 * Photos are skipped: they make exports huge and aren't needed here.
 */

export type ParsedContact = {
  name: string;
  emails: string[];
  phones: string[];
  /** "YYYY-MM-DD", or "--MM-DD" when the year is unknown. */
  birthday: string | null;
  org: string | null;
  note: string | null;
  uid: string | null;
};

export const MAX_CONTACTS = 10_000;

type Prop = { name: string; params: Record<string, string>; value: string };

/** Join folded lines (RFC 6350: a line starting with a space or tab continues the previous one). */
function unfold(text: string): string[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1] += line.slice(1);
    else if (out.length && /=$/.test(out[out.length - 1]!) && /QUOTED-PRINTABLE/i.test(out[out.length - 1]!)) {
      // vCard 2.1 quoted-printable soft line break: "...=\n..."
      out[out.length - 1] = out[out.length - 1]!.slice(0, -1) + line;
    } else out.push(line);
  }
  return out;
}

function parseLine(line: string): Prop | null {
  // NAME;PARAM=a;PARAM2=b:value — the first unquoted ":" ends the name/params.
  let i = 0;
  let quoted = false;
  for (; i < line.length; i++) {
    const c = line[i];
    if (c === '"') quoted = !quoted;
    else if (c === ":" && !quoted) break;
  }
  if (i >= line.length) return null;
  const [rawName = "", ...rawParams] = line.slice(0, i).split(";");
  // Apple groups related lines: "item1.EMAIL", "item1.X-ABLabel".
  const name = rawName.replace(/^[^.]*\./, "").toUpperCase();
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq === -1) params[p.toUpperCase()] = "true"; // vCard 2.1 bare params, e.g. ";QUOTED-PRINTABLE"
    else params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name, params, value: line.slice(i + 1) };
}

/** Decode vCard 2.1 quoted-printable (bytes, then UTF-8 unless another charset is named). */
function decodeQuotedPrintable(value: string, charset = "utf-8"): string {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    if (value[i] === "=" && /^[0-9A-F]{2}$/i.test(value.slice(i + 1, i + 3))) {
      bytes.push(parseInt(value.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(value.charCodeAt(i) & 0xff);
  }
  try {
    return new TextDecoder(charset).decode(new Uint8Array(bytes));
  } catch {
    return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
  }
}

/** Undo vCard text escaping: \n \, \; \\ */
function unescape(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

function isQuotedPrintable(p: Prop): boolean {
  return (p.params.ENCODING ?? "").toUpperCase() === "QUOTED-PRINTABLE" || !!p.params["QUOTED-PRINTABLE"];
}

function textValue(p: Prop): string {
  const raw = isQuotedPrintable(p) ? decodeQuotedPrintable(p.value, p.params.CHARSET) : p.value;
  return unescape(raw).trim();
}

/** Keep digits and one leading "+"; drop "tel:" prefixes and punctuation. */
export function cleanPhone(raw: string): string {
  const v = raw.replace(/^tel:/i, "").trim();
  const digits = v.replace(/[^\d]/g, "");
  return digits ? (v.startsWith("+") ? `+${digits}` : digits) : "";
}

export function cleanEmail(raw: string): string {
  const v = raw.replace(/^mailto:/i, "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
}

/** "1985-04-12", "19850412", "--0412", "--04-12", "1985-04-12T00:00:00Z" → "YYYY-MM-DD" / "--MM-DD". */
export function cleanBirthday(raw: string): string | null {
  const v = raw.trim();
  let m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(v);
  if (m) return m[1] === "1604" ? `--${m[2]}-${m[3]}` : `${m[1]}-${m[2]}-${m[3]}`; // Apple uses 1604 for "no year"
  m = /^--(\d{2})-?(\d{2})/.exec(v);
  if (m) return `--${m[1]}-${m[2]}`;
  return null;
}

/** "Last;First;Middle;Prefix;Suffix" → "First Middle Last". */
function nameFromN(value: string): string {
  const [last = "", first = "", middle = "", prefix = "", suffix = ""] = value.split(";").map((s) => unescape(s).trim());
  return [prefix, first, middle, last, suffix].filter(Boolean).join(" ");
}

const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** Parse every BEGIN:VCARD … END:VCARD block. Contacts with no name, email or phone are dropped. */
export function parseVcards(text: string): ParsedContact[] {
  const out: ParsedContact[] = [];
  let props: Prop[] | null = null;
  for (const line of unfold(text)) {
    if (/^BEGIN:VCARD$/i.test(line.trim())) {
      props = [];
      continue;
    }
    if (/^END:VCARD$/i.test(line.trim())) {
      if (props) {
        const c = toContact(props);
        if (c) out.push(c);
        if (out.length >= MAX_CONTACTS) break;
      }
      props = null;
      continue;
    }
    if (!props) continue;
    const p = parseLine(line);
    if (p && p.name !== "PHOTO" && p.name !== "LOGO" && p.name !== "SOUND" && p.name !== "KEY") props.push(p);
  }
  return out;
}

function toContact(props: Prop[]): ParsedContact | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const all = (name: string) => props.filter((p) => p.name === name);
  const emails = uniq(all("EMAIL").map((p) => cleanEmail(textValue(p))));
  const phones = uniq(all("TEL").map((p) => cleanPhone(textValue(p))));
  const org = get("ORG") ? textValue(get("ORG")!).split(";").filter(Boolean).join(", ") || null : null;
  const fn = get("FN") ? textValue(get("FN")!) : "";
  const nProp = get("N");
  // Split N on ";" before unescaping, so an escaped "\;" inside a part survives.
  const n = nProp ? nameFromN(isQuotedPrintable(nProp) ? decodeQuotedPrintable(nProp.value, nProp.params.CHARSET) : nProp.value) : "";
  const name = (fn || n || org || emails[0] || phones[0] || "").slice(0, 200);
  if (!name) return null;
  return {
    name,
    emails: emails.slice(0, 10),
    phones: phones.slice(0, 10),
    birthday: get("BDAY") ? cleanBirthday(textValue(get("BDAY")!)) : null,
    org: org?.slice(0, 200) ?? null,
    note: get("NOTE") ? textValue(get("NOTE")!).slice(0, 2000) || null : null,
    uid: get("UID") ? textValue(get("UID")!).replace(/^urn:uuid:/i, "").slice(0, 200) || null : null,
  };
}
