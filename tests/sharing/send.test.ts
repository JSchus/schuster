import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailAlias, MediaItem } from "@/lib/db/schema";
import type { Viewer } from "@/lib/permissions";

vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test@localhost/test";
  process.env.AUTH_SECRET ??= "test-secret-test-secret";
  process.env.MAIL_DOMAIN = "m.schuster.me";
  process.env.MAIL_DRIVER = "memory";
});

const PEOPLE = {
  john: { id: "u-john", name: "John Schuster", email: "john@schuster.me", role: "admin" as const },
  mom: { id: "u-mom", name: "Mom", email: "mom@gmail.com", role: "member" as const },
  dad: { id: "u-dad", name: null, email: "dad@icloud.com", role: "member" as const },
  kid: { id: "u-kid", name: "Kid", email: "kid@gmail.com", role: "viewer" as const },
};
const session = vi.hoisted(() => ({ current: null as null | { user: Viewer & { name: string | null; email: string } } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));
const as = (who: keyof typeof PEOPLE) => {
  const p = PEOPLE[who];
  session.current = { user: { id: p.id, role: p.role, name: p.name, email: p.email } };
};

const db = vi.hoisted(() => ({
  items: new Map<string, MediaItem>(),
  access: new Map<string, string[]>(),
  sends: [] as { itemId: string; fromUser: string; toUser: string | null; toEmail: string | null; note: string | null; shareToken: string | null; createdAt: Date }[],
  shares: [] as { token: string; itemId?: string; expiresAt: Date; allowDownload: boolean }[],
  aliases: new Map<string, MailAlias>(),
  log: [] as { aliasId: string; toAddr: string; outcome: string }[],
  reverse: [] as { aliasId: string; ext: string }[],
}));
vi.mock("@/lib/db/people", () => ({
  listPeople: async () => Object.values(PEOPLE).map((p) => ({ id: p.id, name: p.name, email: p.email })),
}));
vi.mock("@/lib/db/queries", () => ({
  getItemForEdit: async (id: string, u: Viewer) => {
    const i = db.items.get(id);
    return i && (u.role === "admin" || i.addedBy === u.id) ? i : undefined;
  },
  getItemAccess: async (id: string) => db.access.get(id) ?? [],
  setItemAccess: async (id: string, ids: string[]) => void db.access.set(id, ids),
  updateItem: async (id: string, patch: Partial<MediaItem>) => void db.items.set(id, { ...db.items.get(id)!, ...patch }),
}));
vi.mock("@/lib/db/sends", () => ({
  addSends: async (rows: typeof db.sends) => void db.sends.push(...rows.map((r) => ({ ...r, createdAt: new Date() }))),
  countSendsSince: async (u: string, since: Date) => db.sends.filter((s) => s.fromUser === u && s.createdAt > since).length,
}));
vi.mock("@/lib/db/shares", () => ({
  createShare: async (v: (typeof db.shares)[number]) => (db.shares.push(v), v),
}));
vi.mock("@/lib/db/mail", () => ({
  getVisibleAlias: async (u: string, id: string) => {
    const a = db.aliases.get(id);
    return a && (a.ownerId === u || a.memberIds.includes(u)) ? a : undefined;
  },
  countSentSince: async (aliasId: string) => db.log.filter((l) => l.aliasId === aliasId && l.outcome === "sent").length,
  reverseTokenFor: async (aliasId: string, ext: string) => (db.reverse.push({ aliasId, ext }), "tok"),
  addLog: async (row: (typeof db.log)[number]) => void db.log.push(row),
}));

const { MemoryMailSender, setMailSender } = await import("@/lib/mail/sender");
const members = await import("@/app/api/items/[id]/send/members/route");
const email = await import("@/app/api/items/[id]/send/email/route");
let sender: InstanceType<typeof MemoryMailSender>;

const ITEM = "0b8f6f0e-2c4b-4c8a-9f5e-1a2b3c4d5e6f";
const ctx = { params: Promise.resolve({ id: ITEM }) };
const post = (body: unknown) => new Request("https://schuster.me/api/items/x/send", { method: "POST", body: JSON.stringify(body) });
/** Decoded text part of a sent multipart email. */
const textOf = (raw: string) => {
  const part = raw.split(/Content-Type: text\/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n/)[1]!.split("--sm-")[0]!;
  return Buffer.from(part.replace(/\r\n/g, ""), "base64").toString("utf8");
};
const htmlOf = (raw: string) => {
  const part = raw.split(/Content-Type: text\/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n/)[1]!.split("--sm-")[0]!;
  return Buffer.from(part.replace(/\r\n/g, ""), "base64").toString("utf8");
};

function item(visibility: MediaItem["visibility"], addedBy = PEOPLE.mom.id, type: MediaItem["type"] = "video", mime = "video/mp4") {
  db.items.set(ITEM, { id: ITEM, title: "Grandma's recipes", visibility, addedBy, status: "ready", type, mime } as MediaItem);
}

beforeEach(() => {
  db.items.clear();
  db.access.clear();
  db.sends.length = 0;
  db.shares.length = 0;
  db.aliases.clear();
  db.log.length = 0;
  db.reverse.length = 0;
  sender = new MemoryMailSender();
  setMailSender(sender);
  item("private");
  as("mom");
});

describe("send to members", () => {
  it("gives access, records it for Shared with me, and emails each person", async () => {
    const res = await members.POST(post({ userIds: [PEOPLE.dad.id, PEOPLE.kid.id, PEOPLE.mom.id], note: "For the holidays" }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ sent: 2, emailed: 2 });
    expect(db.items.get(ITEM)!.visibility).toBe("people");
    expect(db.access.get(ITEM)!.sort()).toEqual([PEOPLE.dad.id, PEOPLE.kid.id].sort());
    expect(db.sends.map((s) => s.toUser).sort()).toEqual([PEOPLE.dad.id, PEOPLE.kid.id].sort());
    expect(sender.sent.map((m) => m.to[0]).sort()).toEqual(["dad@icloud.com", "kid@gmail.com"]);
    const m = sender.sent[0]!;
    expect(m.from).toBe("noreply@m.schuster.me");
    expect(m.raw).toMatch(/^From: "Mom via Schuster Media" <noreply@m\.schuster\.me>\r$/m);
    expect(textOf(m.raw)).toContain("Mom shared “Grandma's recipes” with you.");
    expect(textOf(m.raw)).toContain("For the holidays");
    expect(textOf(m.raw)).toContain(`https://schuster.me/items/${ITEM}`);
    expect(m.raw).not.toContain("mom@gmail.com");
  });

  it("adds to an existing people list and leaves 'everyone' files alone", async () => {
    item("people");
    db.access.set(ITEM, [PEOPLE.kid.id]);
    await members.POST(post({ userIds: [PEOPLE.dad.id] }), ctx);
    expect(db.access.get(ITEM)!.sort()).toEqual([PEOPLE.dad.id, PEOPLE.kid.id].sort());
    item("everyone");
    db.access.clear();
    await members.POST(post({ userIds: [PEOPLE.dad.id] }), ctx);
    expect(db.items.get(ITEM)!.visibility).toBe("everyone");
    expect(db.access.size).toBe(0);
  });

  it("is only for the uploader or an admin", async () => {
    as("dad");
    expect((await members.POST(post({ userIds: [PEOPLE.kid.id] }), ctx)).status).toBe(404);
    as("kid");
    expect((await members.POST(post({ userIds: [PEOPLE.dad.id] }), ctx)).status).toBe(403);
    as("john");
    expect((await members.POST(post({ userIds: [PEOPLE.dad.id] }), ctx)).status).toBe(201);
    expect((await members.POST(post({ userIds: ["nobody"] }), ctx)).status).toBe(400);
  });
});

describe("email contacts a link", () => {
  it("makes one share link and sends one private email each, from the site", async () => {
    const res = await email.POST(post({ to: ["Aunt@Example.com", "uncle@example.org"], note: "<b>Enjoy</b>", days: 30, allowDownload: false }), ctx);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ sent: 2, failed: [] });
    expect(db.shares).toHaveLength(1);
    expect(db.shares[0]).toMatchObject({ itemId: ITEM, allowDownload: false });
    expect(db.shares[0]!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29.9 * 86_400_000);
    expect(sender.sent.map((m) => m.to)).toEqual([["aunt@example.com"], ["uncle@example.org"]]);
    const m = sender.sent[0]!;
    expect(m.raw).toMatch(/^To: aunt@example\.com\r$/m);
    expect(m.raw).not.toContain("uncle@example.org");
    expect(m.raw).not.toContain("mom@gmail.com");
    expect(textOf(m.raw)).toContain(`https://schuster.me/s/${db.shares[0]!.token}`);
    expect(textOf(m.raw)).toContain("Replies to this email aren't received.");
    expect(htmlOf(m.raw)).toContain("&lt;b&gt;Enjoy&lt;/b&gt;");
    expect(htmlOf(m.raw)).not.toContain("<b>Enjoy");
    expect(db.sends.map((s) => s.toEmail)).toEqual(["aunt@example.com", "uncle@example.org"]);
  });

  it("can send from one of your aliases, so replies come back", async () => {
    const id = randomUUID();
    db.aliases.set(id, { id, localPart: "family", ownerId: PEOPLE.mom.id, memberIds: [], kind: "personal", active: true, pausedReason: null, expiresAt: null } as unknown as MailAlias);
    await email.POST(post({ to: ["aunt@example.com"], from: id }), ctx);
    expect(sender.sent[0]).toMatchObject({ from: "family@m.schuster.me" });
    expect(sender.sent[0]!.raw).toMatch(/^From: family@m\.schuster\.me\r$/m);
    expect(textOf(sender.sent[0]!.raw)).toContain("You can reply to this email.");
    expect(db.reverse).toEqual([{ aliasId: id, ext: "aunt@example.com" }]);
    expect(db.log).toMatchObject([{ aliasId: id, toAddr: "aunt@example.com", outcome: "sent" }]);
    // Someone else's alias, or one that's off, can't be used.
    as("john");
    expect((await email.POST(post({ to: ["x@example.com"], from: id }), ctx)).status).toBe(404);
    as("mom");
    db.aliases.get(id)!.active = false;
    expect((await email.POST(post({ to: ["x@example.com"], from: id }), ctx)).status).toBe(400);
  });

  it("refuses alias addresses, too many people, and the 101st send of the day", async () => {
    expect((await email.POST(post({ to: ["x@m.schuster.me"] }), ctx)).status).toBe(400);
    expect((await email.POST(post({ to: Array.from({ length: 21 }, (_, i) => `p${i}@x.com`) }), ctx)).status).toBe(400);
    expect((await email.POST(post({ to: [] }), ctx)).status).toBe(400);
    for (let i = 0; i < 5; i++) await email.POST(post({ to: Array.from({ length: 20 }, (_, j) => `p${i}-${j}@x.com`) }), ctx);
    expect(db.sends).toHaveLength(100);
    expect((await email.POST(post({ to: ["late@x.com"] }), ctx)).status).toBe(429);
    expect((await members.POST(post({ userIds: [PEOPLE.dad.id] }), ctx)).status).toBe(429);
  });

  it("is only for the uploader or an admin", async () => {
    as("dad");
    expect((await email.POST(post({ to: ["x@example.com"] }), ctx)).status).toBe(404);
    as("kid");
    expect((await email.POST(post({ to: ["x@example.com"] }), ctx)).status).toBe(403);
    expect(sender.sent).toHaveLength(0);
  });
});

describe("per media type", () => {
  it("video can be watch-only; its email says Watch it", async () => {
    await email.POST(post({ to: ["a@example.com"], allowDownload: false }), ctx);
    expect(db.shares[0]!.allowDownload).toBe(false);
    expect(textOf(sender.sent[0]!.raw)).toContain("Watch it: https://schuster.me/s/");
  });

  it("books, games and plain files are always downloadable from the link", async () => {
    for (const [type, mime, label] of [
      ["book", "application/epub+zip", "Download the book"],
      ["game", "application/zip", "Download the game"],
      ["file", "application/pdf", "Open"],
    ] as const) {
      db.shares.length = 0;
      sender.sent.length = 0;
      item("private", PEOPLE.mom.id, type, mime);
      await email.POST(post({ to: ["a@example.com"], allowDownload: false }), ctx);
      expect(db.shares[0]!.allowDownload).toBe(true);
      expect(htmlOf(sender.sent[0]!.raw)).toContain(`>${label}</a>`);
    }
  });

  it("member emails say Open for every type (they get the full reader or player)", async () => {
    item("private", PEOPLE.mom.id, "book", "application/epub+zip");
    await members.POST(post({ userIds: [PEOPLE.dad.id] }), ctx);
    expect(htmlOf(sender.sent[0]!.raw)).toContain(">Open</a>");
  });
});
