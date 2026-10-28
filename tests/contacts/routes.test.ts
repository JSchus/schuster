import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Contact, Invite, Profile } from "@/lib/db/schema";
import type { Viewer } from "@/lib/permissions";

const session = vi.hoisted(() => ({ current: null as null | { user: Viewer } }));
vi.mock("@/auth", () => ({ auth: async () => session.current }));

const db = vi.hoisted(() => ({
  contacts: new Map<string, Contact>(),
  profiles: new Map<string, Profile>(),
  invites: [] as Partial<Invite>[],
  next: 0,
}));

const own = (owner: string) => [...db.contacts.values()].filter((c) => c.ownerId === owner);

vi.mock("@/lib/db/contacts", () => ({
  listContacts: async (owner: string) => own(owner),
  getContact: async (owner: string, id: string) => own(owner).find((c) => c.id === id),
  createContact: async (owner: string, f: Contact) => {
    const id = `00000000-0000-4000-8000-${String(++db.next).padStart(12, "0")}`;
    const c = { ...f, id, ownerId: owner } as Contact;
    db.contacts.set(id, c);
    return c;
  },
  applyImport: async (owner: string, plan: { updates: Contact[]; inserts: Contact[] }) => {
    for (const u of plan.updates) db.contacts.set(u.id, { ...db.contacts.get(u.id)!, ...u });
    for (const f of plan.inserts) {
      const id = `00000000-0000-4000-8000-${String(++db.next).padStart(12, "0")}`;
      db.contacts.set(id, { ...f, id, ownerId: owner } as Contact);
    }
  },
  updateContact: async (owner: string, id: string, patch: Partial<Contact>) => {
    const c = own(owner).find((x) => x.id === id);
    if (c) db.contacts.set(id, { ...c, ...patch });
  },
  deleteContact: async (owner: string, id: string) => {
    if (own(owner).some((x) => x.id === id)) db.contacts.delete(id);
  },
  deleteAllContacts: async (owner: string) => {
    const mine = own(owner);
    mine.forEach((c) => db.contacts.delete(c.id));
    return mine.length;
  },
  getProfile: async (id: string) => db.profiles.get(id),
  upsertProfile: async (id: string, f: Profile) => void db.profiles.set(id, { ...f, userId: id }),
}));

vi.mock("@/lib/db/people", () => ({
  createInvite: async (v: Invite) => {
    db.invites.push(v);
    return v;
  },
}));

const list = await import("@/app/api/contacts/route");
const one = await import("@/app/api/contacts/[id]/route");
const imp = await import("@/app/api/contacts/import/route");
const invite = await import("@/app/api/contacts/invite/route");
const profile = await import("@/app/api/profile/route");

const req = (method: string, body?: unknown) =>
  new Request("http://test/api/contacts", { method, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const as = (id: string, role: Viewer["role"]) => (session.current = { user: { id, role } });

beforeEach(() => {
  db.contacts.clear();
  db.profiles.clear();
  db.invites.length = 0;
  as("john", "member");
});

describe("contacts are private to their owner", () => {
  it("nobody else, not even an admin, can list, read, change or delete them", async () => {
    const res = await list.POST(req("POST", { name: "Anna", emails: ["Anna@X.com"], phones: ["(312) 555-0100"] }));
    expect(res.status).toBe(201);
    const { id, emails, phones } = await res.json();
    expect(emails).toEqual(["anna@x.com"]);
    expect(phones).toEqual(["3125550100"]);

    as("boss", "admin");
    expect(await (await list.GET(req("GET"))).json()).toEqual([]);
    expect((await one.PATCH(req("PATCH", { name: "Hacked" }), ctx(id))).status).toBe(404);
    expect((await one.DELETE(req("DELETE"), ctx(id))).status).toBe(404);
    expect((await invite.POST(req("POST", { contactId: id, role: "member" }))).status).toBe(404);
    expect(await (await list.DELETE()).json()).toEqual({ deleted: 0 });
    expect(db.contacts.get(id)?.name).toBe("Anna");

    as("john", "member");
    expect((await one.PATCH(req("PATCH", { name: "Anna S" }), ctx(id))).status).toBe(200);
    expect(db.contacts.get(id)?.name).toBe("Anna S");
  });

  it("viewers can keep their own contacts too", async () => {
    as("kid", "viewer");
    expect((await list.POST(req("POST", { name: "Grandma" }))).status).toBe(201);
    session.current = null;
    expect((await list.GET(req("GET"))).status).toBe(401);
  });
});

describe("importing", () => {
  it("adds new contacts, updates matches, and drops bad emails without failing the batch", async () => {
    const batch = [
      { name: "Anna", emails: ["anna@x.com", "not-an-email"], phones: ["+1 312 555 0100"], birthday: "1604-04-12", uid: "A" },
      { name: "Bob", phones: ["312-555-0199"] },
    ];
    expect(await (await imp.POST(req("POST", { contacts: batch }))).json()).toEqual({ added: 2, updated: 0 });
    const anna = [...db.contacts.values()].find((c) => c.name === "Anna")!;
    expect(anna).toMatchObject({ emails: ["anna@x.com"], phones: ["+13125550100"], birthday: "--04-12" });
    expect(await (await imp.POST(req("POST", { contacts: batch }))).json()).toEqual({ added: 0, updated: 2 });
    expect(db.contacts.size).toBe(2);
  });

  it("limits batch size", async () => {
    const big = Array.from({ length: 501 }, (_, i) => ({ name: `P${i}` }));
    expect((await imp.POST(req("POST", { contacts: big }))).status).toBe(400);
  });
});

describe("inviting a contact", () => {
  it("is for admins only and makes a single-use, 7-day invite", async () => {
    const { id } = await (await list.POST(req("POST", { name: "Cara", emails: ["c@x.com"] }))).json();
    expect((await invite.POST(req("POST", { contactId: id, role: "member" }))).status).toBe(403);
    // An admin's own contact:
    as("boss", "admin");
    const mine = await (await list.POST(req("POST", { name: "Dan", phones: ["555"] }))).json();
    const res = await invite.POST(req("POST", { contactId: mine.id, role: "viewer" }));
    expect(res.status).toBe(201);
    expect(db.invites[0]).toMatchObject({ role: "viewer", maxUses: 1, note: "Dan", createdBy: "boss" });
    expect((db.invites[0]!.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
  });
});

describe("family directory entry", () => {
  it("saves your own entry, hidden unless you choose to be listed", async () => {
    expect(await (await profile.GET()).json()).toBeNull();
    const body = { displayName: "John", phone: "312", birthday: "--04-12", address: null, note: null, listed: false };
    expect((await profile.PUT(req("PUT", body))).status).toBe(200);
    expect(db.profiles.get("john")).toMatchObject({ displayName: "John", listed: false, birthday: "--04-12" });
    expect((await profile.PUT(req("PUT", { ...body, birthday: "April 12" }))).status).toBe(400);
  });
});
