import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailAlias, MailLogRow } from "@/lib/db/schema";
import type { Viewer } from "@/lib/permissions";

const TOPIC = "arn:aws:sns:us-east-1:123456789012:schuster-mail";
vi.hoisted(() => {
  process.env.DATABASE_URL ??= "postgres://test@localhost/test";
  process.env.AUTH_SECRET ??= "test-secret-test-secret";
  process.env.MAIL_INBOUND_TOPIC_ARN = "arn:aws:sns:us-east-1:123456789012:schuster-mail";
  process.env.MAIL_DOMAIN = "m.schuster.me";
  process.env.MAIL_DRIVER = "memory";
});
/* Test-only SNS signer: the inbound route trusts this key via MAIL_TEST_SNS_CERT_FILE. */
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const certDir = mkdtempSync(join(tmpdir(), "sns-"));
const certFile = join(certDir, "cert.pem");
writeFileSync(certFile, keys.publicKey.export({ type: "spki", format: "pem" }).toString());
process.env.MAIL_TEST_SNS_CERT_FILE = certFile;

const session = vi.hoisted(() => ({ current: null as null | { user: Viewer } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const PEOPLE = {
  mom: { id: "00000000-0000-4000-8000-000000000001", email: "mom@gmail.com", role: "member" as const },
  dad: { id: "00000000-0000-4000-8000-000000000002", email: "dad@icloud.com", role: "member" as const },
  boss: { id: "00000000-0000-4000-8000-000000000003", email: "john@ionos.example", role: "admin" as const },
  kid: { id: "00000000-0000-4000-8000-000000000004", email: "kid@gmail.com", role: "viewer" as const },
};
const people = Object.values(PEOPLE);

const db = vi.hoisted(() => ({
  aliases: new Map<string, MailAlias>(),
  reverse: new Map<string, { aliasId: string; externalAddress: string }>(),
  log: [] as MailLogRow[],
  replyFrom: [] as { id: string; userId: string; email: string; tokenHash: string | null; tokenExpiresAt: Date | null; confirmedAt: Date | null; createdAt: Date }[],
}));
vi.mock("@/lib/db/people", () => ({
  listPeople: async () => people.map((p) => ({ id: p.id, name: null, email: p.email })),
}));
vi.mock("@/lib/db/mail", () => {
  const visible = (u: string, a: MailAlias) => a.ownerId === u || a.memberIds.includes(u);
  return {
    listAliases: async (u: string) => [...db.aliases.values()].filter((a) => visible(u, a)),
    getVisibleAlias: async (u: string, id: string) => {
      const a = db.aliases.get(id);
      return a && visible(u, a) ? a : undefined;
    },
    getAliasByLocal: async (l: string) => [...db.aliases.values()].find((a) => a.localPart === l),
    createAlias: async (v: Pick<MailAlias, "localPart" | "ownerId" | "label" | "kind" | "memberIds" | "expiresAt">) => {
      if ([...db.aliases.values()].some((a) => a.localPart === v.localPart)) return undefined;
      const a: MailAlias = { id: randomUUID(), active: true, pausedReason: null, received: 0, blocked: 0, lastReceivedAt: null, createdAt: new Date(), ...v };
      db.aliases.set(a.id, a);
      return a;
    },
    updateAlias: async (id: string, patch: Partial<MailAlias>) => void db.aliases.set(id, { ...db.aliases.get(id)!, ...patch }),
    deleteAlias: async (id: string) => void db.aliases.delete(id),
    countMessage: async (id: string, delivered: boolean) => {
      const a = db.aliases.get(id)!;
      if (delivered) a.received++;
      else a.blocked++;
    },
    reverseTokenFor: async (aliasId: string, ext: string, token: string) => {
      for (const [t, r] of db.reverse) if (r.aliasId === aliasId && r.externalAddress === ext) return t;
      db.reverse.set(token, { aliasId, externalAddress: ext });
      return token;
    },
    getReverse: async (token: string) => {
      const r = db.reverse.get(token);
      const alias = r && db.aliases.get(r.aliasId);
      return r && alias ? { externalAddress: r.externalAddress, alias } : undefined;
    },
    emailsFor: async (ids: string[]) => people.filter((p) => ids.includes(p.id)).map((p) => p.email),
    adminEmails: async () => people.filter((p) => p.role === "admin").map((p) => p.email),
    addLog: async (row: Omit<MailLogRow, "id" | "createdAt">) => void db.log.push({ ...row, id: randomUUID(), createdAt: new Date() }),
    listLog: async (aliasId: string) => db.log.filter((r) => r.aliasId === aliasId),
    getVisibleLog: async (u: string, id: string) => {
      const r = db.log.find((x) => x.id === id);
      const a = r && db.aliases.get(r.aliasId);
      return r && a && visible(u, a) ? r : undefined;
    },
    pruneLog: async () => undefined,
    MAX_REPLY_ADDRESSES: 3,
    listReplyAddresses: async (u: string) => db.replyFrom.filter((r) => r.userId === u),
    saveReplyAddress: async (userId: string, email: string, tokenHash: string, tokenExpiresAt: Date) => {
      let r = db.replyFrom.find((x) => x.userId === userId && x.email === email);
      if (!r) db.replyFrom.push((r = { id: randomUUID(), userId, email, tokenHash, tokenExpiresAt, confirmedAt: null, createdAt: new Date() }));
      else if (!r.confirmedAt) Object.assign(r, { tokenHash, tokenExpiresAt });
      return r;
    },
    confirmReplyAddress: async (hash: string, now = new Date()) => {
      const r = db.replyFrom.find((x) => x.tokenHash === hash && x.tokenExpiresAt! > now);
      if (r) Object.assign(r, { confirmedAt: now, tokenHash: null, tokenExpiresAt: null });
      return r;
    },
    deleteReplyAddress: async (u: string, id: string) => {
      const i = db.replyFrom.findIndex((r) => r.id === id && r.userId === u);
      if (i >= 0) db.replyFrom.splice(i, 1);
      return i >= 0;
    },
    replyEmailsFor: async (ids: string[]) => db.replyFrom.filter((r) => ids.includes(r.userId) && r.confirmedAt).map((r) => r.email),
  };
});

const { MemoryStorageAdapter } = await import("@/lib/storage/memory");
const { setStorage } = await import("@/lib/storage");
const { MemoryMailSender, setMailSender } = await import("@/lib/mail/sender");
const { stringToSign } = await import("@/lib/mail/sns");
const inbound = await import("@/app/api/mail/inbound/route");
const list = await import("@/app/api/mail/aliases/route");
const one = await import("@/app/api/mail/aliases/[id]/route");
const messages = await import("@/app/api/mail/aliases/[id]/messages/route");
const message = await import("@/app/api/mail/messages/[id]/route");
const replyFrom = await import("@/app/api/mail/reply-addresses/route");
const replyFromOne = await import("@/app/api/mail/reply-addresses/[id]/route");
const { confirmReplyAddress } = await import("@/lib/db/mail");
const { hashToken } = await import("@/lib/mail/confirm");

let storage: InstanceType<typeof MemoryStorageAdapter>;
let sender: InstanceType<typeof MemoryMailSender>;

const as = (who: keyof typeof PEOPLE) => (session.current = { user: { id: PEOPLE[who].id, role: PEOPLE[who].role, email: PEOPLE[who].email } as Viewer });
const req = (method: string, body?: unknown) =>
  new Request("https://schuster.me/api/mail/aliases", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function makeAlias(who: keyof typeof PEOPLE, body: Record<string, unknown>) {
  as(who);
  const res = await list.POST(req("POST", body));
  expect(res.status).toBe(201);
  return (await res.json()) as { id: string; address: string };
}

type Verdicts = { spam?: string; virus?: string; spf?: string; dkim?: string };
let n = 0;

/** Store a raw message in "S3" and POST the signed SNS notification SES would send. */
async function deliver(raw: string, recipients: string[], v: Verdicts = {}, key?: string) {
  const objectKey = key ?? `inbound/msg-${++n}`;
  storage.objects.set(objectKey, { body: new Uint8Array(Buffer.from(raw, "latin1")), contentType: "message/rfc822" });
  const ses = {
    notificationType: "Received",
    mail: { source: "bounce@sender.example", destination: recipients, commonHeaders: { subject: "x" } },
    receipt: {
      recipients,
      spamVerdict: { status: v.spam ?? "PASS" },
      virusVerdict: { status: v.virus ?? "PASS" },
      spfVerdict: { status: v.spf ?? "PASS" },
      dkimVerdict: { status: v.dkim ?? "PASS" },
      action: { type: "S3", bucketName: "schuster-media", objectKey },
    },
  };
  return post(ses);
}

async function post(ses: unknown, over: Record<string, string> = {}) {
  const m = {
    Type: "Notification" as const,
    MessageId: randomUUID(),
    TopicArn: TOPIC,
    Message: JSON.stringify(ses),
    Timestamp: new Date().toISOString(),
    SignatureVersion: "2",
    Signature: "",
    SigningCertURL: "https://sns.us-east-1.amazonaws.com/SimpleNotificationService-test.pem",
    ...over,
  };
  if (!over.Signature) m.Signature = createSign("RSA-SHA256").update(stringToSign(m)).sign(keys.privateKey, "base64");
  return inbound.POST(new Request("https://schuster.me/api/mail/inbound", { method: "POST", body: JSON.stringify(m) }));
}

const mail = (from: string, to: string, subject = "Your receipt", extra = "") =>
  [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Message-ID: <abc@sender.example>",
    "DKIM-Signature: v=1; d=sender.example; b=sig",
    "Return-Path: <bounce@sender.example>",
    extra,
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Thanks for your order.",
    "",
  ]
    .filter((l, i) => l !== "" || i > 6)
    .join("\r\n");

beforeEach(() => {
  db.aliases.clear();
  db.reverse.clear();
  db.log.length = 0;
  db.replyFrom.length = 0;
  storage = new MemoryStorageAdapter();
  setStorage(storage);
  sender = new MemoryMailSender();
  setMailSender(sender);
});

describe("inbound mail", () => {
  it("forwards to the owner as the alias, with a hidden reply address", async () => {
    const a = await makeAlias("mom", { name: "Netflix", label: "Netflix sign-up" });
    expect(a.address).toBe("netflix@m.schuster.me");
    const res = await deliver(mail('"Netflix" <info@netflix.example>', a.address), [a.address]);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ recipient: a.address, outcome: "delivered" }] });
    expect(sender.sent).toHaveLength(1);
    const out = sender.sent[0]!;
    expect(out.to).toEqual(["mom@gmail.com"]);
    expect(out.from).toBe("netflix@m.schuster.me");
    expect(out.raw).toMatch(/^From: "Netflix via Schuster Media" <netflix@m\.schuster\.me>\r\n/);
    expect(out.raw).toMatch(/^Reply-To: r-[a-z2-7]{16}@m\.schuster\.me\r\n/m);
    expect(out.raw).toMatch(/^X-Original-From: info@netflix\.example\r\n/m);
    expect(out.raw).not.toMatch(/DKIM-Signature|Return-Path/);
    expect(out.raw).toContain("Subject: Your receipt\r\n");
    expect(out.raw.endsWith("\r\n\r\nThanks for your order.\r\n")).toBe(true);
    expect(db.aliases.get(a.id)).toMatchObject({ received: 1, blocked: 0 });
  });

  it("sends a group alias to everyone in it", async () => {
    const a = await makeAlias("mom", { name: "family", memberIds: [PEOPLE.dad.id, PEOPLE.boss.id] });
    await deliver(mail("school@district.example", a.address), [a.address]);
    expect(sender.sent[0]!.to.sort()).toEqual(["dad@icloud.com", "john@ionos.example", "mom@gmail.com"]);
  });

  it("drops spam, viruses, turned-off and expired aliases without bouncing", async () => {
    const a = await makeAlias("mom", { name: "shop" });
    await deliver(mail("x@spam.example", a.address), [a.address], { spam: "FAIL" });
    await deliver(mail("x@spam.example", a.address), [a.address], { virus: "FAIL" });
    as("mom");
    await one.PATCH(req("PATCH", { active: false }), ctx(a.id));
    await deliver(mail("x@shop.example", a.address), [a.address]);
    await one.PATCH(req("PATCH", { active: true }), ctx(a.id));
    db.aliases.get(a.id)!.expiresAt = new Date(Date.now() - 1000);
    await deliver(mail("x@shop.example", a.address), [a.address]);
    expect(sender.sent).toHaveLength(0);
    expect(db.log.map((r) => r.outcome)).toEqual(["spam", "virus", "off", "expired"]);
    expect(db.aliases.get(a.id)).toMatchObject({ received: 0, blocked: 4 });
  });

  it("ignores unknown aliases and other domains", async () => {
    const res = await deliver(mail("x@y.example", "nobody@m.schuster.me"), ["nobody@m.schuster.me", "john@schuster.me"]);
    expect(await res.json()).toEqual({ results: [{ recipient: "nobody@m.schuster.me", outcome: "unknown" }] });
    expect(sender.sent).toHaveLength(0);
  });

  it("sends the owner's reply from the alias to the original sender only", async () => {
    const a = await makeAlias("mom", { name: "seller" });
    await deliver(mail('"Buyer Bob" <bob@buyer.example>', a.address), [a.address]);
    const replyTo = /^Reply-To: (r-[a-z2-7]+@m\.schuster\.me)/m.exec(sender.sent[0]!.raw)![1]!;
    sender.sent.length = 0;
    const res = await deliver(
      mail('"Mom Real Name" <mom@gmail.com>', replyTo, "Re: Your receipt", "X-Original-From: bob@buyer.example\r\nReceived: from mom-laptop.home (1.2.3.4)\r\nCc: secret@gmail.com"),
      [replyTo],
      { spf: "PASS" },
    );
    expect((await res.json()).results[0].outcome).toBe("delivered");
    const out = sender.sent[0]!;
    expect(out.from).toBe("seller@m.schuster.me");
    expect(out.to).toEqual(["bob@buyer.example"]);
    const head = out.raw.slice(0, out.raw.indexOf("\r\n\r\n"));
    expect(head).toMatch(/^From: seller@m\.schuster\.me$/m);
    expect(head).toMatch(/^To: bob@buyer\.example$/m);
    expect(head).toContain("Subject: Re: Your receipt");
    expect(head).not.toMatch(/mom|Received|X-Original-From|Cc:|1\.2\.3\.4|DKIM/i);
  });

  it("refuses spoofed replies (wrong sender, or failed SPF and DKIM)", async () => {
    const a = await makeAlias("mom", { name: "seller" });
    await deliver(mail("bob@buyer.example", a.address), [a.address]);
    const replyTo = /^Reply-To: (r-[a-z2-7]+@m\.schuster\.me)/m.exec(sender.sent[0]!.raw)![1]!;
    sender.sent.length = 0;
    await deliver(mail("stranger@evil.example", replyTo), [replyTo]);
    await deliver(mail("mom@gmail.com", replyTo), [replyTo], { spf: "FAIL", dkim: "FAIL" });
    expect(sender.sent).toHaveLength(0);
    expect(db.log.filter((r) => r.direction === "out").map((r) => r.outcome)).toEqual(["rejected", "rejected"]);
  });

  it("sends postmaster@ and abuse@ to the admins", async () => {
    await deliver(mail("isp@example.net", "postmaster@m.schuster.me"), ["postmaster@m.schuster.me"]);
    expect(sender.sent[0]!.to).toEqual(["john@ionos.example"]);
  });

  it("never reads outside inbound/ and rejects unsigned or foreign SNS posts", async () => {
    const a = await makeAlias("mom", { name: "x1" });
    storage.objects.set("media/private.mp4", { body: new Uint8Array([1]), contentType: "video/mp4" });
    expect((await deliver(mail("a@b.example", a.address), [a.address], {}, "media/private.mp4")).status).toBe(500);
    expect((await deliver(mail("a@b.example", a.address), [a.address], {}, "inbound/../media/private.mp4")).status).toBe(500);
    expect((await post({ notificationType: "Received" }, { Signature: "bm9wZQ==" })).status).toBe(403);
    expect((await post({ notificationType: "Received" }, { TopicArn: "arn:aws:sns:us-east-1:999:other" })).status).toBe(403);
    expect(sender.sent).toHaveLength(0);
  });

  it("pauses an alias after a spam complaint, and the owner can turn it back on", async () => {
    const a = await makeAlias("mom", { name: "news" });
    await post({ notificationType: "Complaint", mail: { source: a.address, destination: ["x@y.example"] }, complaint: {} });
    expect(db.aliases.get(a.id)!.pausedReason).toMatch(/spam/);
    await deliver(mail("x@y.example", a.address), [a.address]);
    expect(sender.sent).toHaveLength(0);
    as("mom");
    expect((await one.PATCH(req("PATCH", { unpause: true }), ctx(a.id))).status).toBe(200);
    await deliver(mail("x@y.example", a.address), [a.address]);
    expect(sender.sent).toHaveLength(1);
  });
});

describe("alias API", () => {
  it("is for members and admins; viewers get 403", async () => {
    as("kid");
    expect((await list.POST(req("POST", {}))).status).toBe(403);
    expect((await list.GET()).status).toBe(403);
  });

  it("refuses taken and reserved names, and picks random ones", async () => {
    await makeAlias("mom", { name: "pizza" });
    as("dad");
    expect((await list.POST(req("POST", { name: "Pizza" }))).status).toBe(409);
    expect((await list.POST(req("POST", { name: "postmaster" }))).status).toBe(400);
    expect((await list.POST(req("POST", { name: "r-sneaky" }))).status).toBe(400);
    const r = await makeAlias("dad", { days: 7 });
    expect(r.address).toMatch(/^[a-z]+-[a-z]+-\d{2}@m\.schuster\.me$/);
    expect(db.aliases.get(r.id)!.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
  });

  it("keeps each person's aliases private, even from admins", async () => {
    const a = await makeAlias("mom", { name: "private" });
    await deliver(mail("bank@bank.example", a.address), [a.address]);
    const logId = db.log[0]!.id;
    for (const who of ["dad", "boss"] as const) {
      as(who);
      expect(await (await list.GET()).json()).toEqual([]);
      expect((await one.PATCH(req("PATCH", { active: false }), ctx(a.id))).status).toBe(404);
      expect((await one.DELETE(req("DELETE"), ctx(a.id))).status).toBe(404);
      expect((await messages.GET(req("GET"), ctx(a.id))).status).toBe(404);
      expect((await message.GET(req("GET"), ctx(logId))).status).toBe(404);
    }
  });

  it("lets group members read but not change a group alias", async () => {
    const a = await makeAlias("mom", { name: "family", memberIds: [PEOPLE.dad.id, "00000000-0000-4000-8000-0000000000ff", PEOPLE.mom.id] });
    expect(db.aliases.get(a.id)!.memberIds).toEqual([PEOPLE.dad.id]);
    await deliver(mail('"Coach" <coach@team.example>', a.address, "Practice moved"), [a.address]);
    as("dad");
    const listed = await (await list.GET()).json();
    expect(listed).toMatchObject([{ address: a.address, mine: false, kind: "group" }]);
    const log = await (await messages.GET(req("GET"), ctx(a.id))).json();
    expect(log).toMatchObject([{ from: "coach@team.example", subject: "Practice moved", outcome: "delivered", viewable: true }]);
    const msg = await (await message.GET(req("GET"), ctx(log[0].id))).json();
    expect(msg).toMatchObject({ subject: "Practice moved", text: expect.stringContaining("Thanks for your order.") });
    expect((await one.PATCH(req("PATCH", { active: false }), ctx(a.id))).status).toBe(404);
  });

  it("says when a stored message has expired", async () => {
    const a = await makeAlias("mom", { name: "old" });
    await deliver(mail("x@y.example", a.address), [a.address]);
    storage.objects.clear();
    as("mom");
    expect((await message.GET(req("GET"), ctx(db.log[0]!.id))).status).toBe(410);
  });

  it("deletes an alias", async () => {
    const a = await makeAlias("mom", { name: "gone" });
    expect((await one.DELETE(req("DELETE"), ctx(a.id))).status).toBe(204);
    expect(db.aliases.size).toBe(0);
  });
});

describe("reply-from addresses", () => {
  const addReq = (email: string) => new Request("https://schuster.me/api/mail/reply-addresses", { method: "POST", body: JSON.stringify({ email }) });
  /** The token from the confirmation email the site just sent. */
  const tokenFromMail = () => /\/mail-confirm\/([A-Za-z0-9_-]+)/.exec(sender.sent.at(-1)!.raw)![1]!;

  async function setUpReply() {
    const a = await makeAlias("mom", { name: "seller" });
    await deliver(mail("bob@buyer.example", a.address), [a.address]);
    const replyTo = /^Reply-To: (r-[a-z2-7]+@m\.schuster\.me)/m.exec(sender.sent[0]!.raw)![1]!;
    sender.sent.length = 0;
    return replyTo;
  }

  it("emails a confirmation link, and the address only counts once it's opened", async () => {
    const replyTo = await setUpReply();
    as("mom");
    const res = await replyFrom.POST(addReq("Mom.Personal@Gmail.com"));
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ email: "mom.personal@gmail.com", confirmed: false });
    const confirm = sender.sent.at(-1)!;
    expect(confirm).toMatchObject({ from: "noreply@m.schuster.me", to: ["mom.personal@gmail.com"] });
    expect(confirm.raw).toContain("Subject: Confirm replies from this address");
    expect(confirm.raw).toContain("mom@gmail.com asked");
    expect(db.replyFrom[0]!.tokenHash).not.toBe(tokenFromMail()); // only the hash is stored
    const token = tokenFromMail();
    sender.sent.length = 0;

    // Not confirmed yet: a reply from it is refused.
    await deliver(mail("mom.personal@gmail.com", replyTo), [replyTo]);
    expect(sender.sent).toHaveLength(0);

    expect(await confirmReplyAddress(hashToken("wrong-token-wrong-token"))).toBeUndefined();
    expect(await confirmReplyAddress(hashToken(token))).toMatchObject({ email: "mom.personal@gmail.com" });
    expect(await confirmReplyAddress(hashToken(token))).toBeUndefined(); // single use

    await deliver(mail('"Mom" <mom.personal@gmail.com>', replyTo), [replyTo]);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ from: "seller@m.schuster.me", to: ["bob@buyer.example"] });
    expect(sender.sent[0]!.raw).not.toMatch(/mom\.personal/);
  });

  it("still needs SPF or DKIM, and other people's addresses don't count", async () => {
    const replyTo = await setUpReply();
    as("dad");
    await replyFrom.POST(addReq("dad.personal@gmail.com"));
    await confirmReplyAddress(hashToken(tokenFromMail()));
    as("mom");
    await replyFrom.POST(addReq("mom.personal@gmail.com"));
    await confirmReplyAddress(hashToken(tokenFromMail()));
    sender.sent.length = 0;
    await deliver(mail("dad.personal@gmail.com", replyTo), [replyTo]);
    await deliver(mail("mom.personal@gmail.com", replyTo), [replyTo], { spf: "FAIL", dkim: "FAIL" });
    expect(sender.sent).toHaveLength(0);
  });

  it("refuses your own sign-in address, alias addresses, and more than three", async () => {
    as("mom");
    expect((await replyFrom.POST(addReq("mom@gmail.com"))).status).toBe(400);
    expect((await replyFrom.POST(addReq("x@m.schuster.me"))).status).toBe(400);
    expect((await replyFrom.POST(addReq("not an email"))).status).toBe(400);
    for (const n of [1, 2, 3]) expect((await replyFrom.POST(addReq(`m${n}@x.example`))).status).toBe(201);
    expect((await replyFrom.POST(addReq("m4@x.example"))).status).toBe(400);
    expect((await replyFrom.POST(addReq("m1@x.example"))).status).toBe(201); // re-send is fine
  });

  it("shows and removes only your own, and viewers can't use it", async () => {
    as("mom");
    await replyFrom.POST(addReq("mom.personal@gmail.com"));
    const id = db.replyFrom[0]!.id;
    as("dad");
    expect(await (await replyFrom.GET()).json()).toEqual([]);
    expect((await replyFromOne.DELETE(req("DELETE"), ctx(id))).status).toBe(404);
    as("kid");
    expect((await replyFrom.POST(addReq("kid2@gmail.com"))).status).toBe(403);
    as("mom");
    expect(await (await replyFrom.GET()).json()).toEqual([{ id, email: "mom.personal@gmail.com", confirmed: false }]);
    expect((await replyFromOne.DELETE(req("DELETE"), ctx(id))).status).toBe(204);
    expect(db.replyFrom).toHaveLength(0);
  });
});
